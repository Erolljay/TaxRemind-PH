import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, ShieldCheck, FileText, Settings, Users, CheckCircle2, AlertCircle, Loader2, Check, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { GoogleGenAI } from "@google/genai";

export default function Dashboard() {
  const [status, setStatus] = useState<{ botActive: boolean; userCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  
  // OCR Processing State
  const [ocrId, setOcrId] = useState<string | null>(searchParams.get('ocr_id'));
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (ocrId) {
      fetch(`/api/ocr/${ocrId}`)
        .then(res => res.json())
        .then(data => {
          setOcrText(data.ocr_text);
          processWithAI(data.ocr_text);
        })
        .catch(err => console.error("Failed to fetch OCR text:", err));
    }
  }, [ocrId]);

  const processWithAI = async (text: string) => {
    setIsProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY || (process as any).env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            {
              text: `You are a Philippine Tax Expert. I have extracted text from a BIR Certificate of Registration (COR) using OCR. 
              
              OCR EXTRACTED TEXT:
              ---
              ${text}
              ---
              
              TASK:
              1. Prioritize identifying 'Registered Tax Types' mentioned under the 'Registered Tax Types' section of the COR.
              2. Map each identified tax type to one of these EXACT values: 
                 - Percentage Tax
                 - Value Added Tax
                 - Withholding Tax - Compensation
                 - Withholding Tax - Expanded
                 - Income Tax
              
              3. Identify the 'Taxpayer Type'. Look for keywords like 'Individual', 'Single Proprietor', 'Professional' (map to 'Individual') or 'Corporation', 'Partnership', 'Non-Individual' (map to 'Non-Individual (Corporate)').
              
              4. Be precise in extracting filing frequencies (monthly, quarterly, annual) and any specific date mentions for each tax type.
              
              5. If you detect a tax type that is NOT in the list above but seems important, include it in the 'unknownTaxTypes' array.
              
              Return the result as a JSON object with this structure:
              {
                "taxTypes": ["Exact Name 1", "Exact Name 2"],
                "taxpayerType": "Individual" | "Non-Individual (Corporate)",
                "unknownTaxTypes": ["Unknown Tax Type 1"],
                "notes": "Brief summary of frequencies and dates found"
              }
              
              If no matching tax types are found, return an empty array for taxTypes.`,
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
        }
      });

      const result = JSON.parse(response.text || "{}");
      setOcrResult(result);
    } catch (error) {
      console.error("Gemini Error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!ocrId || !ocrResult) return;
    setIsSaving(true);
    try {
      // Fetch the full OCR data to get the correct chat_id
      const ocrDataRes = await fetch(`/api/ocr/${ocrId}`);
      const ocrData = await ocrDataRes.json();
      
      const res = await fetch('/api/ocr/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: ocrId,
          chat_id: ocrData.chat_id,
          ...ocrResult,
          username: searchParams.get('username')
        })
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setOcrId(null), 3000);
      }
    } catch (error) {
      console.error("Save Error:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans selection:bg-emerald-100">
      {/* OCR Processing Modal */}
      <AnimatePresence>
        {ocrId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-[#141414]/5 flex justify-between items-center bg-emerald-50/50">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">AI COR Verification</h2>
                  <p className="text-sm text-[#141414]/50">Powered by Gemini AI</p>
                </div>
                <button onClick={() => setOcrId(null)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 overflow-y-auto flex-1 space-y-6">
                {isProcessing ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4">
                    <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
                    <p className="font-medium text-[#141414]/60">Analyzing your COR text...</p>
                  </div>
                ) : ocrResult ? (
                  <div className="space-y-6">
                    <div className="p-6 bg-[#F5F5F0] rounded-3xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold uppercase tracking-wider text-[#141414]/40">Taxpayer Type</span>
                        <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full">{ocrResult.taxpayerType}</span>
                      </div>
                      
                      <div className="space-y-2">
                        <span className="text-sm font-bold uppercase tracking-wider text-[#141414]/40">Detected Tax Types</span>
                        <div className="flex flex-wrap gap-2">
                          {ocrResult.taxTypes.map((t: string, i: number) => (
                            <div key={i} className="px-4 py-2 bg-white border border-emerald-200 text-emerald-700 text-sm font-semibold rounded-2xl flex items-center gap-2">
                              <Check className="w-4 h-4" />
                              {t}
                            </div>
                          ))}
                        </div>
                      </div>

                      {ocrResult.unknownTaxTypes?.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-sm font-bold uppercase tracking-wider text-[#141414]/40">Other Detections</span>
                          <div className="flex flex-wrap gap-2">
                            {ocrResult.unknownTaxTypes.map((t: string, i: number) => (
                              <div key={i} className="px-4 py-2 bg-white border border-amber-200 text-amber-700 text-sm font-medium rounded-2xl italic">
                                {t}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {ocrResult.notes && (
                      <div className="p-6 border border-[#141414]/5 rounded-3xl space-y-2">
                        <span className="text-sm font-bold uppercase tracking-wider text-[#141414]/40">AI Observations</span>
                        <p className="text-sm text-[#141414]/70 leading-relaxed italic">"{ocrResult.notes}"</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center justify-center space-y-4 text-red-500">
                    <AlertCircle className="w-12 h-12" />
                    <p className="font-medium">Failed to process COR text. Please try again.</p>
                  </div>
                )}
              </div>

              <div className="p-8 bg-[#F5F5F0]/50 border-t border-[#141414]/5">
                {saveSuccess ? (
                  <div className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    Saved to Telegram!
                  </div>
                ) : (
                  <button 
                    disabled={isProcessing || !ocrResult || isSaving}
                    onClick={handleConfirm}
                    className="w-full py-4 bg-[#141414] text-white rounded-2xl font-bold hover:bg-[#141414]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-xl shadow-black/10"
                  >
                    {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                    Confirm & Sync to Bot
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-[#141414]/10 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <ShieldCheck className="text-white w-5 h-5" />
            </div>
            <span className="font-bold text-lg tracking-tight">TaxRemind PH</span>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${status?.botActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              <div className={`w-2 h-2 rounded-full ${status?.botActive ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {status?.botActive ? 'Bot Online' : 'Bot Offline'}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Hero Section */}
          <div className="md:col-span-2 space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <h1 className="text-5xl font-bold tracking-tight leading-[1.1]">
                Never miss a <span className="text-emerald-600">BIR deadline</span> again.
              </h1>
              <p className="text-xl text-[#141414]/60 max-w-lg">
                Your personal Philippine tax compliance assistant. Get timely reminders for VAT, Income Tax, and Withholding taxes directly on Telegram.
              </p>
              
              <div className="pt-4 flex flex-wrap gap-4">
                <a 
                  href="https://t.me/taxremind_bot" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#141414] text-white px-8 py-4 rounded-2xl font-semibold hover:bg-[#141414]/90 transition-all flex items-center gap-2 shadow-xl shadow-black/10"
                >
                  Connect to Telegram
                  <Bell className="w-5 h-5" />
                </a>
                <Link 
                  to="/instructions"
                  className="border border-[#141414]/10 px-8 py-4 rounded-2xl font-semibold hover:bg-white transition-all"
                >
                  View Instructions
                </Link>
              </div>
            </motion.div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8">
              {[
                { icon: Bell, title: "Smart Reminders", desc: "5, 15, and 25-day alerts before deadlines." },
                { icon: ShieldCheck, title: "COR Auto-Parsing", desc: "Upload your BIR COR photo and we'll extract your tax types automatically." },
                { icon: FileText, title: "Filing Guides", desc: "Step-by-step instructions for every tax type." },
                { icon: Settings, title: "Customizable", desc: "Select only the taxes applicable to you." }
              ].map((f, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * i }}
                  className="p-6 bg-white rounded-3xl border border-[#141414]/5 hover:border-emerald-500/20 transition-colors group"
                >
                  <div className="w-12 h-12 bg-[#F5F5F0] rounded-2xl flex items-center justify-center mb-4 group-hover:bg-emerald-50 transition-colors">
                    <f.icon className="w-6 h-6 text-[#141414]/70 group-hover:text-emerald-600" />
                  </div>
                  <h3 className="font-bold text-lg mb-1">{f.title}</h3>
                  <p className="text-sm text-[#141414]/50 leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Sidebar Stats */}
          <div className="space-y-6">
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white p-8 rounded-[2rem] border border-[#141414]/5 shadow-sm space-y-6"
            >
              <div className="space-y-1">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#141414]/40">Bot Statistics</h2>
                <p className="text-3xl font-bold">Active Users</p>
              </div>

              <div className="flex items-center gap-4 p-4 bg-[#F5F5F0] rounded-2xl">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                  <Users className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{loading ? '...' : status?.userCount || 0}</p>
                  <p className="text-xs text-[#141414]/40 font-medium">Subscribed Taxpayers</p>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <h3 className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  Supported Taxes
                </h3>
                <ul className="space-y-3">
                  {['Percentage Tax', 'Value Added Tax', 'Withholding Tax', 'Income Tax'].map((t, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-[#141414]/60">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              {!status?.botActive && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700 leading-relaxed">
                    <strong>Action Required:</strong> Please provide a valid <code>TELEGRAM_BOT_TOKEN</code> in your environment variables to activate the reminder service.
                  </p>
                </div>
              )}
            </motion.div>

            <div className="p-6 bg-emerald-600 rounded-[2rem] text-white space-y-4">
              <h3 className="font-bold text-lg">Pro Tip 💡</h3>
              <p className="text-sm text-white/80 leading-relaxed">
                Always file at least 2 days before the deadline to avoid system congestion in eBIRForms or EFPS.
              </p>
            </div>
          </div>

        </div>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 border-t border-[#141414]/5 text-center">
        <p className="text-sm text-[#141414]/40">
          © {new Date().getFullYear()} TaxRemind PH. Not affiliated with the BIR. For informational purposes only.
        </p>
      </footer>
    </div>
  );
}
