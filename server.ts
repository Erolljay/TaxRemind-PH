import express from "express";
import { createServer as createViteServer } from "vite";
import { Telegraf, Markup } from "telegraf";
import cron from "node-cron";
import Database from "better-sqlite3";
import axios from "axios";
import Tesseract from "tesseract.js";
import path from "path";
import { format, addDays, isSameDay, differenceInDays, startOfDay } from "date-fns";
import { TaxType, TaxpayerType, getDeadlinesForMonth, FILING_INSTRUCTIONS } from "./src/taxDeadlines";

// --- Database Setup ---
const db = new Database("tax_bot.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    chat_id INTEGER PRIMARY KEY,
    username TEXT,
    tax_types TEXT -- JSON array of TaxType
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pending_ocr (
    id TEXT PRIMARY KEY,
    chat_id INTEGER,
    ocr_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: Add taxpayer_type column if it doesn't exist
const tableInfo = db.prepare("PRAGMA table_info(users)").all() as any[];
const hasTaxpayerType = tableInfo.some(col => col.name === 'taxpayer_type');
if (!hasTaxpayerType) {
  db.exec("ALTER TABLE users ADD COLUMN taxpayer_type TEXT DEFAULT 'Individual'");
  console.log("✅ Database migration: Added taxpayer_type column to users table.");
}

const saveUser = db.prepare("INSERT OR REPLACE INTO users (chat_id, username, tax_types, taxpayer_type) VALUES (?, ?, ?, ?)");
const getUser = db.prepare("SELECT * FROM users WHERE chat_id = ?");
const getAllUsers = db.prepare("SELECT * FROM users");
const updateTaxpayerType = db.prepare("UPDATE users SET taxpayer_type = ? WHERE chat_id = ?");

const savePendingOcr = db.prepare("INSERT INTO pending_ocr (id, chat_id, ocr_text) VALUES (?, ?, ?)");
const getPendingOcr = db.prepare("SELECT * FROM pending_ocr WHERE id = ?");
const deletePendingOcr = db.prepare("DELETE FROM pending_ocr WHERE id = ?");

// --- Telegram Bot Setup ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("❌ ERROR: TELEGRAM_BOT_TOKEN is missing from environment variables!");
} else {
  console.log("✅ TELEGRAM_BOT_TOKEN found. Initializing bot...");
}

let bot: Telegraf | null = null;
try {
  if (token) {
    console.log("✅ TELEGRAM_BOT_TOKEN found. Initializing bot...");
    bot = new Telegraf(token);
    console.log("🤖 Bot instance created. Registering handlers...");
  } else {
    console.error("❌ ERROR: TELEGRAM_BOT_TOKEN is missing from environment variables!");
  }
} catch (err) {
  console.error("❌ CRITICAL: Failed to initialize Telegraf instance:", err);
  bot = null;
}

if (bot) {
  bot.use((ctx, next) => {
    console.log(`📡 Incoming update: ${ctx.updateType} from ${ctx.from?.username || ctx.from?.id}`);
    return next();
  });

  bot.on('text', (ctx, next) => {
    console.log(`💬 Text message: "${ctx.message.text}" from ${ctx.from.username}`);
    return next();
  });

  bot.start((ctx) => {
    console.log(`📥 Received /start from ${ctx.from.username} (${ctx.from.id})`);
    
    // Save user to database immediately
    const chatId = ctx.chat.id;
    const username = ctx.from.username || "unknown";
    const existingUser = getUser.get(chatId);
    if (!existingUser) {
      saveUser.run(chatId, username, JSON.stringify([]), TaxpayerType.INDIVIDUAL);
      console.log(`👤 New user registered: ${username} (${chatId})`);
    }

    const payload = ctx.startPayload;
    if (payload === 'instructions') {
      return showOnboarding(ctx);
    }

    ctx.reply(
      "Welcome to TaxRemind PH! 🇵🇭\n\nI am your personal Philippine tax compliance assistant. I'll help you never miss a BIR deadline again.\n\n🚀 *Getting Started:*\n1. Tap *📖 View Instructions* to see how I work.\n2. Send a photo of your *BIR COR* for quick setup.\n3. Or use */settings* to choose manually.",
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([["📖 View Instructions"], ["/settings", "/deadlines"], ["/help"]])
          .resize()
      }
    );
  });

  bot.hears("📖 View Instructions", (ctx) => {
    showOnboarding(ctx);
  });

  bot.command("instructions", (ctx) => {
    showOnboarding(ctx);
  });

  function showOnboarding(ctx: any) {
    const guide = [
      "👋 *Welcome to TaxRemind PH!*",
      "I'm here to ensure you stay compliant with the BIR without the stress of tracking dates manually.",
      "",
      "1️⃣ *Setup Your Profile*\nSend me a photo of your *BIR Certificate of Registration (COR)*. I'll use AI to detect your tax types automatically. Alternatively, use `/settings` to pick them yourself.",
      "",
      "2️⃣ *Smart Reminders*\nOnce set up, I will send you alerts:\n• *5 days* before Monthly deadlines\n• *15 days* before Quarterly deadlines\n• *25 days* before Annual deadlines\n• *On the day* of the deadline itself",
      "",
      "3️⃣ *Filing Guides*\nNot sure how to file? Use `/help` to get step-by-step instructions and required attachments for each tax type.",
      "",
      "Ready to start? Send your COR photo now or go to /settings!"
    ].join("\n");

    ctx.replyWithMarkdown(guide, Markup.inlineKeyboard([
      [Markup.button.callback("⚙️ Go to Settings", "menu_manage")],
      [Markup.button.callback("📅 Check Deadlines", "menu_deadlines")]
    ]));
  }

  function getFutureDeadlines(selectedTypes: TaxType[] = [], taxpayerType: TaxpayerType = TaxpayerType.INDIVIDUAL) {
    const now = startOfDay(new Date());
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Look ahead 4 months to ensure we catch the next quarterly/annual filing
    const allDeadlines = [];
    for (let i = 0; i < 4; i++) {
      const month = (currentMonth + i) % 12;
      const year = currentYear + Math.floor((currentMonth + i) / 12);
      allDeadlines.push(...getDeadlinesForMonth(month, year, taxpayerType));
    }

    // Filter for future deadlines AND user's selected types (if provided)
    return allDeadlines
      .filter(d => {
        const isFuture = startOfDay(d.deadline) >= now;
        const isSelected = selectedTypes.length === 0 || selectedTypes.includes(d.taxType);
        return isFuture && isSelected;
      })
      .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  }

  // --- Photo Handler for COR Parsing ---
  bot.on('photo', async (ctx) => {
    const chatId = ctx.chat.id;
    const photo = ctx.message.photo[ctx.message.photo.length - 1]; // Get largest photo
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);

    ctx.reply("🔍 *Reading your COR with OCR...* Please wait a moment.", { parse_mode: 'Markdown' });

    try {
      // Download image
      const response = await axios.get(fileLink.href, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      // Step 1: Perform OCR
      const { data: { text: ocrText } } = await Tesseract.recognize(imageBuffer, 'eng');
      
      if (!ocrText || ocrText.trim().length < 10) {
        return ctx.reply("❌ *OCR Failed to Read COR*\n\nI couldn't extract enough text from the photo. Please ensure the photo is:\n1. *Clear and sharp* (not blurry)\n2. *Well-lit* (no shadows or glare)\n3. *Focused* specifically on the *'Registered Tax Types'* section of your COR.\n\nPlease try sending a new photo!", { parse_mode: 'Markdown' });
      }

      // Step 2: Save to DB and redirect to Dashboard for Gemini processing
      // We MUST call Gemini from the frontend per guidelines
      const ocrId = Math.random().toString(36).substring(2, 15);
      savePendingOcr.run(ocrId, chatId, ocrText);

      const dashboardUrl = `${process.env.APP_URL || 'https://ais-dev-3odtoill5qh6gxeqcbawzi-336918796231.asia-east1.run.app'}/?ocr_id=${ocrId}&username=${ctx.from?.username || ''}`;

      ctx.reply("🤖 *OCR Complete!*\n\nTo ensure accuracy and security, please click the button below to confirm your tax types using our AI assistant on the dashboard.", {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url("🚀 Confirm with AI", dashboardUrl)]
        ])
      });

    } catch (error) {
      console.error("OCR/Gemini Error:", error);
      ctx.reply("⚠️ Sorry, I encountered an error while processing your COR. Please try /settings instead.");
    }
  });

  bot.action("confirm_cor_pending", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const data = pendingCorData.get(chatId);
    if (!data) {
      return ctx.reply("⚠️ Sorry, the session expired. Please try scanning your COR again.");
    }

    saveUser.run(chatId, ctx.from?.username || "unknown", JSON.stringify(data.taxTypes), data.taxpayerType);
    pendingCorData.delete(chatId);

    ctx.editMessageText("🎯 *Tax types and Taxpayer Type saved!* I will now remind you of your upcoming deadlines.", { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback("⚙️ Open Settings", "menu_main")]])
    });
    ctx.answerCbQuery("Saved successfully!");
  });

  bot.action(/confirm_cor_(.+)/, (ctx) => {
    // Legacy handler for old callback data if any
    const types = JSON.parse(ctx.match[1]) as string[];
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const existingUser = getUser.get(chatId) as any;
    const taxpayerType = existingUser?.taxpayer_type || TaxpayerType.INDIVIDUAL;
    saveUser.run(chatId, ctx.from?.username || "unknown", JSON.stringify(types), taxpayerType);
    ctx.editMessageText("🎯 *Tax types saved!* I will now remind you of your upcoming deadlines.", { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback("⚙️ Open Settings", "menu_main")]])
    });
    ctx.answerCbQuery("Saved successfully!");
  });

  bot.action("cancel_cor", (ctx) => {
    ctx.editMessageText("Operation cancelled. You can still use /settings to add tax types manually.");
    ctx.answerCbQuery();
  });

  bot.command("settings", (ctx) => {
    showMainMenu(ctx);
  });

  function showMainMenu(ctx: any) {
    const chatId = ctx.chat?.id;
    const user = getUser.get(chatId) as any;
    const selectedTypes = user ? JSON.parse(user.tax_types) : [];
    const taxpayerType = user?.taxpayer_type || TaxpayerType.INDIVIDUAL;
    
    let msg = "⚙️ *Settings Menu*\n\n";
    msg += `👤 Type: *${taxpayerType}*\n`;
    msg += `📋 Subscriptions: *${selectedTypes.length}* tax types.\n\n`;
    msg += "Choose an option below:";

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback("👤 Change Taxpayer Type", "menu_taxpayer_type")],
      [Markup.button.callback("📋 Manage Tax Types", "menu_manage")],
      [Markup.button.callback("👀 View My Subscriptions", "menu_view")],
      [Markup.button.callback("📸 Re-scan COR Photo", "menu_rescan")],
      [Markup.button.callback("📅 View Next Deadlines", "menu_deadlines")]
    ]);

    if (ctx.callbackQuery) {
      ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
    } else {
      ctx.replyWithMarkdown(msg, keyboard);
    }
  }

  bot.action("menu_taxpayer_type", (ctx) => {
    const buttons = Object.values(TaxpayerType).map(type => [
      Markup.button.callback(type, `set_taxpayer_${type}`)
    ]);
    buttons.push([Markup.button.callback("⬅️ Back to Menu", "menu_main")]);
    
    ctx.editMessageText("👤 *Select Taxpayer Type*\n\nThis affects your Income Tax deadlines (1701Q vs 1702Q):", {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
    ctx.answerCbQuery();
  });

  bot.action(/set_taxpayer_(.+)/, (ctx) => {
    const type = ctx.match[1] as TaxpayerType;
    const chatId = ctx.chat?.id;
    if (chatId) {
      updateTaxpayerType.run(type, chatId);
      ctx.answerCbQuery(`Set to ${type}`);
      showMainMenu(ctx);
    }
  });

  bot.action("menu_manage", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const user = getUser.get(chatId) as any;
    const selectedTypes = user ? JSON.parse(user.tax_types) : [];

    const buttons = Object.values(TaxType).map((type) => {
      const isSelected = selectedTypes.includes(type);
      return [Markup.button.callback(`${isSelected ? "✅" : "⬜"} ${type}`, `toggle_${type}`)];
    });
    buttons.push([Markup.button.callback("⬅️ Back to Menu", "menu_main")]);

    ctx.editMessageText("📋 *Manage Tax Types*\n\nTap to add or remove a tax type from your reminders:", {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
    ctx.answerCbQuery();
  });

  bot.action("menu_view", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const user = getUser.get(chatId) as any;
    const selectedTypes = user ? JSON.parse(user.tax_types) : [];

    let msg = "👀 *Your Subscribed Tax Types:*\n\n";
    if (selectedTypes.length === 0) {
      msg += "_You haven't selected any tax types yet._";
    } else {
      selectedTypes.forEach((t: string) => msg += `✅ ${t}\n`);
    }

    ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back to Menu", "menu_main")]])
    });
    ctx.answerCbQuery();
  });

  bot.action("menu_rescan", (ctx) => {
    ctx.editMessageText("📸 *Re-scan COR*\n\nPlease send a clear photo of your BIR Certificate of Registration (Form 2303). I will automatically detect your tax types.", {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back to Menu", "menu_main")]])
    });
    ctx.answerCbQuery();
  });

  bot.action("menu_deadlines", (ctx) => {
    const chatId = ctx.chat?.id;
    if (!chatId) return;
    const user = getUser.get(chatId) as any;
    const selectedTypes = user ? JSON.parse(user.tax_types) : [];
    const taxpayerType = user?.taxpayer_type || TaxpayerType.INDIVIDUAL;

    const filtered = getFutureDeadlines(selectedTypes, taxpayerType as TaxpayerType);

    let msg = "📅 *Your Upcoming Deadlines:*\n\n";

    if (filtered.length === 0) {
      msg += "_No upcoming deadlines for your selected tax types in the next 120 days._";
    } else {
      filtered.forEach(d => {
        msg += `• *${d.taxType}* (${d.form})\n   └ ${format(d.deadline, 'MMM dd, yyyy')}\n\n`;
      });
    }

    ctx.editMessageText(msg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back to Menu", "menu_main")]])
    });
    ctx.answerCbQuery();
  });

  bot.action("menu_main", (ctx) => {
    showMainMenu(ctx);
    ctx.answerCbQuery();
  });

  bot.action(/toggle_(.+)/, (ctx) => {
    const taxType = ctx.match[1] as TaxType;
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const user = getUser.get(chatId) as any;
    let selectedTypes = user ? JSON.parse(user.tax_types) : [];

    if (selectedTypes.includes(taxType)) {
      selectedTypes = selectedTypes.filter((t: string) => t !== taxType);
    } else {
      selectedTypes.push(taxType);
    }

    const taxpayerType = user?.taxpayer_type || TaxpayerType.INDIVIDUAL;
    saveUser.run(chatId, ctx.from?.username || "unknown", JSON.stringify(selectedTypes), taxpayerType);

    // Refresh keyboard
    const buttons = Object.values(TaxType).map((type) => {
      const isSelected = selectedTypes.includes(type);
      return [Markup.button.callback(`${isSelected ? "✅" : "⬜"} ${type}`, `toggle_${type}`)];
    });
    buttons.push([Markup.button.callback("⬅️ Back to Menu", "menu_main")]);

    ctx.editMessageReplyMarkup(Markup.inlineKeyboard(buttons).reply_markup);
    ctx.answerCbQuery(`Updated ${taxType}`);
  });

  bot.command("ping", (ctx) => {
    ctx.reply("🏓 Pong! I am alive and listening.");
  });

  bot.command("deadlines", (ctx) => {
    const filtered = getFutureDeadlines(); // Show all common deadlines
    let msg = "📅 *Upcoming Common Deadlines:*\n\n";
    
    if (filtered.length === 0) {
      msg += "_No upcoming deadlines found for the next 90-120 days._";
    } else {
      filtered.forEach(d => {
        msg += `• *${d.taxType}* (${d.form}): ${format(d.deadline, 'MMM dd, yyyy')}\n`;
      });
    }
    
    ctx.replyWithMarkdown(msg);
  });

  bot.command("help", (ctx) => {
    let msg = "📖 *Filing Instructions*\n\nSelect a tax type to see how to file:";
    const buttons = Object.values(TaxType).map(type => [Markup.button.callback(type, `help_${type}`)]);
    ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(buttons));
  });

  bot.command("add", (ctx) => {
    ctx.reply("To add a tax type, use /settings or simply send me a photo of your BIR Certificate of Registration (COR).");
  });

  bot.action(/help_(.+)/, (ctx) => {
    const taxType = ctx.match[1] as TaxType;
    const instruction = FILING_INSTRUCTIONS[taxType];
    ctx.replyWithMarkdown(instruction);
    ctx.answerCbQuery();
  });

  bot.catch((err: any, ctx: any) => {
    console.error(`❌ Bot error for update ${ctx.update.update_id}:`, err);
  });

  bot.launch()
    .then(() => console.log("Telegram bot started successfully"))
    .catch((err) => console.error("CRITICAL: Failed to launch Telegram bot:", err));
}

// --- Reminder Logic ---
cron.schedule("0 9 * * *", () => {
  // Runs every day at 9:00 AM
  console.log("Running daily reminder check...");
  if (!bot) return;

  const now = startOfDay(new Date());
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  
  const users = getAllUsers.all() as any[];

  users.forEach(user => {
    const userTaxTypes = JSON.parse(user.tax_types) as TaxType[];
    const taxpayerType = (user.taxpayer_type || TaxpayerType.INDIVIDUAL) as TaxpayerType;
    
    // Get deadlines for current, next month, and the month after for this specific user type
    const userDeadlines = [
      ...getDeadlinesForMonth(currentMonth, currentYear, taxpayerType),
      ...getDeadlinesForMonth((currentMonth + 1) % 12, currentMonth === 11 ? currentYear + 1 : currentYear, taxpayerType),
      ...getDeadlinesForMonth((currentMonth + 2) % 12, currentMonth >= 10 ? currentYear + 1 : currentYear, taxpayerType)
    ];

    userDeadlines.forEach(d => {
      if (!userTaxTypes.includes(d.taxType)) return;

      const deadlineDate = startOfDay(d.deadline);
      const daysUntil = differenceInDays(deadlineDate, now);
      let shouldRemind = false;
      let reminderMsg = "";

      const attachmentsStr = d.attachments ? `\n📎 *Attachments:* ${d.attachments.join(', ')}` : "";

      if (daysUntil === 0) {
        shouldRemind = true;
        reminderMsg = `🚨 *TODAY IS THE DEADLINE!* 🚨\n\nTax: *${d.taxType}*\nForm: *${d.form}*${attachmentsStr}\nDeadline: *${format(d.deadline, 'MMM dd, yyyy')}*\n\nDon't forget to file and pay today to avoid penalties!`;
      } else if (d.frequency === 'monthly' && daysUntil === 5) {
        shouldRemind = true;
        reminderMsg = `⚠️ *5 Days Remaining* ⚠️\n\nTax: *${d.taxType}*\nForm: *${d.form}*${attachmentsStr}\nDeadline: *${format(d.deadline, 'MMM dd, yyyy')}*\n\nStart preparing your documents!`;
      } else if (d.frequency === 'quarterly' && daysUntil === 15) {
        shouldRemind = true;
        reminderMsg = `⚠️ *15 Days Remaining (Quarterly)* ⚠️\n\nTax: *${d.taxType}*\nForm: *${d.form}*${attachmentsStr}\nDeadline: *${format(d.deadline, 'MMM dd, yyyy')}*\n\nQuarterly filing takes time, better start now!`;
      } else if (d.frequency === 'annual' && daysUntil === 25) {
        shouldRemind = true;
        reminderMsg = `⚠️ *25 Days Remaining (Annual)* ⚠️\n\nTax: *${d.taxType}*\nForm: *${d.form}*${attachmentsStr}\nDeadline: *${format(d.deadline, 'MMM dd, yyyy')}*\n\nAnnual filing is a big one! Get your books ready.`;
      }

      if (shouldRemind) {
        bot.telegram.sendMessage(user.chat_id, reminderMsg, { parse_mode: 'Markdown' })
          .catch(err => console.error(`Failed to send reminder to ${user.chat_id}:`, err));
      }
    });
  });
});

// --- Express Server Setup ---
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.get("/api/status", async (req, res) => {
    let isActuallyOnline = false;
    if (bot) {
      try {
        await bot.telegram.getMe();
        isActuallyOnline = true;
      } catch (e) {
        console.error("Bot getMe failed:", e);
      }
    }
    res.json({ 
      botActive: isActuallyOnline, 
      userCount: (db.prepare("SELECT COUNT(*) as count FROM users").get() as any).count 
    });
  });

  app.get("/api/ocr/:id", (req, res) => {
    const data = getPendingOcr.get(req.params.id) as any;
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  });

  app.post("/api/ocr/confirm", express.json(), (req, res) => {
    const { id, chat_id, taxTypes, taxpayerType, username } = req.body;
    if (!id || !chat_id) return res.status(400).json({ error: "Missing data" });

    saveUser.run(chat_id, username || "unknown", JSON.stringify(taxTypes), taxpayerType);
    deletePendingOcr.run(id);

    if (bot) {
      bot.telegram.sendMessage(chat_id, "🎯 *Tax types and Taxpayer Type saved via Dashboard!* I will now remind you of your upcoming deadlines.", { parse_mode: 'Markdown' });
    }

    res.json({ success: true });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
    // Serve index.html for all other routes to support client-side routing
    app.get("*", (req, res) => {
      res.sendFile(path.resolve("dist/index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
