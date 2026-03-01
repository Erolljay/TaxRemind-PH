import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Camera, Bell, FileText, CheckCircle, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

const Instructions = () => {
  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] font-serif selection:bg-[#5A5A40] selection:text-white">
      {/* Navigation */}
      <nav className="p-6 max-w-4xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-[#5A5A40] hover:opacity-70 transition-opacity font-sans font-medium">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
        <div className="font-sans text-xs uppercase tracking-widest opacity-50">
          Onboarding Guide v2.0
        </div>
      </nav>

      {/* Hero Section */}
      <header className="max-w-4xl mx-auto px-6 pt-12 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-6xl md:text-8xl font-light tracking-tight leading-none mb-8">
            How it <span className="italic font-normal">Works</span>
          </h1>
          <p className="text-xl md:text-2xl text-[#1a1a1a]/60 max-w-2xl mx-auto leading-relaxed">
            Stay compliant with BIR deadlines without the stress. 
            Three simple steps to automate your Philippine tax compliance.
          </p>
        </motion.div>
      </header>

      {/* Steps Section */}
      <main className="max-w-4xl mx-auto px-6 pb-32 space-y-32">
        {/* Step 1 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="w-12 h-12 rounded-full bg-[#5A5A40] text-white flex items-center justify-center font-sans font-bold">
              01
            </div>
            <h2 className="text-4xl font-normal">Setup Your Profile</h2>
            <p className="text-lg text-[#1a1a1a]/70 leading-relaxed">
              Simply take a photo of your <span className="font-semibold italic">BIR Certificate of Registration (Form 2303)</span>. 
              Our AI-powered OCR will read the document, extract your registered tax types, and identify any specific deadline notes.
            </p>
            <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-[#1a1a1a]/5 shadow-sm">
              <Camera className="w-6 h-6 text-[#5A5A40]" />
              <span className="font-sans text-sm font-medium">Try sending a photo to the bot now</span>
            </div>
          </motion.div>
          <div className="relative aspect-square bg-[#E6E6E6] rounded-[40px] overflow-hidden shadow-2xl">
             <div className="absolute inset-0 flex items-center justify-center">
                <ShieldCheck className="w-32 h-32 text-[#5A5A40]/20" />
             </div>
             {/* Decorative elements */}
             <div className="absolute top-8 left-8 right-8 h-1 bg-[#1a1a1a]/5 rounded-full" />
             <div className="absolute top-16 left-8 w-1/2 h-1 bg-[#1a1a1a]/5 rounded-full" />
             <div className="absolute bottom-8 left-8 right-8 h-32 bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <div className="h-2 w-24 bg-[#1a1a1a]/10 rounded-full" />
                </div>
                <div className="space-y-2">
                  <div className="h-2 w-full bg-[#1a1a1a]/5 rounded-full" />
                  <div className="h-2 w-3/4 bg-[#1a1a1a]/5 rounded-full" />
                </div>
             </div>
          </div>
        </section>

        {/* Step 2 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1 relative aspect-square bg-[#141414] rounded-[40px] overflow-hidden shadow-2xl p-8 flex flex-col justify-end">
             <Bell className="absolute top-12 right-12 w-24 h-24 text-white/10 rotate-12" />
             <div className="space-y-4">
                <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 transform -rotate-2">
                  <p className="text-white text-sm font-sans">⚠️ 5 Days Remaining (Monthly)</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10 transform rotate-1 translate-x-4">
                  <p className="text-white text-sm font-sans">⚠️ 15 Days Remaining (Quarterly)</p>
                </div>
                <div className="bg-white/20 backdrop-blur-md p-4 rounded-2xl border border-white/20 transform -rotate-1 translate-x-2">
                  <p className="text-white text-sm font-sans">🚨 TODAY IS THE DEADLINE!</p>
                </div>
             </div>
          </div>
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="order-1 md:order-2 space-y-6"
          >
            <div className="w-12 h-12 rounded-full bg-[#5A5A40] text-white flex items-center justify-center font-sans font-bold">
              02
            </div>
            <h2 className="text-4xl font-normal">Smart Reminders</h2>
            <p className="text-lg text-[#1a1a1a]/70 leading-relaxed">
              We calculate your deadlines based on standard BIR rules. You'll receive automated alerts directly on Telegram:
            </p>
            <ul className="space-y-4 font-sans text-sm">
              <li className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span><span className="font-bold">Monthly:</span> 5 days before + Deadline day</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span><span className="font-bold">Quarterly:</span> 15 days before + Deadline day</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span><span className="font-bold">Annual:</span> 25 days before + Deadline day</span>
              </li>
            </ul>
          </motion.div>
        </section>

        {/* Step 3 */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <div className="w-12 h-12 rounded-full bg-[#5A5A40] text-white flex items-center justify-center font-sans font-bold">
              03
            </div>
            <h2 className="text-4xl font-normal">Filing Guides</h2>
            <p className="text-lg text-[#1a1a1a]/70 leading-relaxed">
              Not sure how to file? Use the <span className="font-mono text-sm bg-[#5A5A40]/10 px-1 rounded">/help</span> command to get step-by-step instructions and required attachments for each tax type.
            </p>
            <div className="p-6 bg-white rounded-3xl border border-[#1a1a1a]/5 shadow-sm space-y-4">
              <div className="flex items-center gap-3 text-[#5A5A40]">
                <FileText className="w-5 h-5" />
                <span className="font-sans font-bold uppercase tracking-wider text-xs">Required Attachments</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Alphalist', 'QAP', 'SLS', 'SLP'].map(tag => (
                  <span key={tag} className="px-3 py-1 bg-[#f5f5f0] rounded-full font-sans text-xs font-medium opacity-70">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
          <div className="relative aspect-square bg-[#f5f2ed] rounded-[40px] border-2 border-dashed border-[#1a1a1a]/10 flex items-center justify-center">
             <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-white rounded-3xl shadow-lg mx-auto flex items-center justify-center">
                   <FileText className="w-10 h-10 text-[#5A5A40]" />
                </div>
                <p className="font-sans text-xs uppercase tracking-widest opacity-40">Step-by-step instructions</p>
             </div>
          </div>
        </section>
      </main>

      {/* Footer CTA */}
      <footer className="bg-[#141414] text-white py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto space-y-8">
          <h2 className="text-5xl font-light leading-tight">Ready to stay <span className="italic">compliant?</span></h2>
          <p className="text-white/50 text-lg font-sans">
            Join hundreds of Filipino taxpayers who never miss a deadline.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a 
              href="https://t.me/taxremind_bot" 
              className="w-full sm:w-auto bg-white text-[#141414] px-12 py-5 rounded-2xl font-sans font-bold hover:scale-105 transition-transform shadow-xl"
            >
              Start on Telegram
            </a>
            <Link 
              to="/" 
              className="w-full sm:w-auto border border-white/20 px-12 py-5 rounded-2xl font-sans font-bold hover:bg-white/5 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Instructions;
