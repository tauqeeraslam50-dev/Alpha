import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Radio, User, Award, Shield, Cpu, Layers, ExternalLink, X, Mail, CheckCircle2, Globe, Sparkles } from 'lucide-react';

export function AboutModal() {
  const { isAboutModalOpen, setIsAboutModalOpen, theme } = useAppContext();

  if (!isAboutModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border transition-all ${
          theme === 'light' 
            ? 'bg-white border-slate-200 text-slate-800' 
            : 'bg-slate-900 border-slate-700 text-slate-100'
        }`}
      >
        {/* Header with decorative background */}
        <div className="relative bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 p-6 text-white overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center shadow-inner">
                <Radio className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold tracking-tight">Radio Network Management System</h2>
                  <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-blue-500/40 border border-white/20 rounded-full">
                    v1.0
                  </span>
                </div>
                <p className="text-xs text-blue-100 mt-0.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  Tactical & Commercial RF Planning Engine
                </p>
              </div>
            </div>
            
            <button 
              onClick={() => setIsAboutModalOpen(false)}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Developer Card */}
          <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            theme === 'light' ? 'bg-blue-50/60 border-blue-100' : 'bg-slate-800/80 border-slate-700'
          }`}>
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
                TA
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600">Lead Engineer & Architect</div>
                <div className="text-base font-bold text-slate-900 dark:text-white">Develop by Tauqeer Aslam</div>
                <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3 text-slate-400" />
                  <a href="mailto:TAUQEERASLAM50@gmail.com" className="hover:underline text-blue-600 dark:text-blue-400 font-mono text-[11px]">
                    TAUQEERASLAM50@gmail.com
                  </a>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 self-start sm:self-center">
              <span className="px-2.5 py-1 text-[10px] font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-300">
                Version 1.0 Release
              </span>
            </div>
          </div>

          {/* Core Modules Grid */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              Core System Capabilities
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className={`p-3 rounded-lg border flex gap-2.5 ${
                theme === 'light' ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-800/50 border-slate-700'
              }`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 dark:text-slate-200">GIS Terrain & Station Map</strong>
                  <span className="text-slate-500 leading-tight">Interactive Leaflet mapping with live node markers, RX/TX frequencies, and LOS calculations.</span>
                </div>
              </div>

              <div className={`p-3 rounded-lg border flex gap-2.5 ${
                theme === 'light' ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-800/50 border-slate-700'
              }`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 dark:text-slate-200">Okumura-Hata & Egli Propagation</strong>
                  <span className="text-slate-500 leading-tight">Empirical VHF/UHF propagation algorithms factoring clutter, antenna mast heights & radio horizon.</span>
                </div>
              </div>

              <div className={`p-3 rounded-lg border flex gap-2.5 ${
                theme === 'light' ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-800/50 border-slate-700'
              }`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 dark:text-slate-200">Automated Frequency Planning</strong>
                  <span className="text-slate-500 leading-tight">Topology visualization, automated channel assignment, and adjacent/co-channel interference checks.</span>
                </div>
              </div>

              <div className={`p-3 rounded-lg border flex gap-2.5 ${
                theme === 'light' ? 'bg-slate-50 border-slate-200/80' : 'bg-slate-800/50 border-slate-700'
              }`}>
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-800 dark:text-slate-200">Desktop (.EXE) & Web Ready</strong>
                  <span className="text-slate-500 leading-tight">Packaged for cross-platform desktop deployment using Electron, with full local JSON import/export.</span>
                </div>
              </div>
            </div>
          </div>

          {/* System Specs */}
          <div className={`p-3.5 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-3 ${
            theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-800/40 border-slate-700 text-slate-400'
          }`}>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-slate-400" />
              <span>Stack: <b>React 18 • TypeScript • Tailwind CSS • D3.js • Leaflet</b></span>
            </div>
            <div className="text-[11px] font-mono">
              Build: <span className="text-blue-600 font-bold">1.0.0-PROD</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between ${
          theme === 'light' ? 'bg-slate-50/80 border-slate-100' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="text-[11px] text-slate-500">
            © 2026 Radio Network Management System • Designed by Tauqeer Aslam
          </div>
          <button
            onClick={() => setIsAboutModalOpen(false)}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
