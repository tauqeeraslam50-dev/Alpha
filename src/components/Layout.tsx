import React, { useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { View } from '../types';
import { cn } from '../lib/utils';
import { LayoutDashboard, Map, MapPin, Radio, Activity, Wifi, Zap, Share2, Mountain, FileText, Database, Cpu, Download, Upload, Sun, Moon, Info, Eye } from 'lucide-react';

interface SidebarItemProps { view: View; icon: React.ElementType; label: string; }

export function Sidebar() {
  const { currentView, setCurrentView, theme, toggleTheme, setIsAboutModalOpen } = useAppContext();
  const NavItem = ({ view, icon: Icon, label }: SidebarItemProps) => {
    const isActive = currentView === view;
    return <button type="button" onClick={() => setCurrentView(view)} className={cn("flex items-center w-full px-3 py-2 text-xs font-semibold transition-all rounded-lg mb-1 text-left group", isActive ? theme === 'light' ? "bg-blue-50 text-blue-700 shadow-sm border border-blue-200/80 font-bold" : "bg-blue-600 text-white font-bold shadow-sm" : theme === 'light' ? "text-slate-600 hover:text-slate-900 hover:bg-slate-100" : "text-slate-400 hover:text-white hover:bg-slate-800")}>
      <Icon className={cn("w-4 h-4 mr-3 transition-colors", isActive ? theme === 'light' ? "text-blue-600" : "text-white" : theme === 'light' ? "text-slate-400 group-hover:text-slate-600" : "text-slate-400 group-hover:text-slate-200")} />
      <span className="truncate">{label}</span>
    </button>;
  };
  return <nav className={cn("w-64 flex flex-col flex-shrink-0 h-full relative z-20 border-r transition-colors duration-200", theme === 'light' ? "bg-white border-slate-200" : "bg-slate-900 border-slate-800")}>
    <div className={cn("p-3.5 space-y-0.5 overflow-y-auto flex-1", theme === 'light' ? 'scrollbar-thin' : '')}>
      <NavItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
      <div className={cn("px-3 text-[10px] font-bold uppercase tracking-wider mb-1.5 mt-5", theme === 'light' ? "text-slate-400" : "text-slate-500")}>GIS & Network Design</div>
      <NavItem view="map" icon={Map} label="Maps" />
      <NavItem view="sites" icon={MapPin} label="Sites & Nodes" />
      <NavItem view="equipment" icon={Cpu} label="Equipment & Radios" />
      <NavItem view="rf-links" icon={Radio} label="RF Link Budget" />
      <NavItem view="frequency" icon={Activity} label="VHF/UHF Planning" />
      <div className={cn("px-3 text-[10px] font-bold uppercase tracking-wider mb-1.5 mt-5", theme === 'light' ? "text-slate-400" : "text-slate-500")}>Propagation & Analysis</div>
      <NavItem view="los" icon={Eye} label="Line of Sight (LOS)" />
      <NavItem view="coverage" icon={Wifi} label="Coverage Prediction" />
      <NavItem view="microwave" icon={Zap} label="Microwave Backhaul" />
      <NavItem view="simulation" icon={Share2} label="Network Simulation" />
      <NavItem view="terrain" icon={Mountain} label="Terrain Profile" />
      <div className={cn("px-3 text-[10px] font-bold uppercase tracking-wider mb-1.5 mt-5", theme === 'light' ? "text-slate-400" : "text-slate-500")}>Engineering</div>
      <NavItem view="reports" icon={FileText} label="Reports & Export" />
      <NavItem view="database" icon={Database} label="Engineering Database" />
    </div>
    <div className={cn("p-3.5 border-t", theme === 'light' ? "bg-slate-50/80 border-slate-200" : "bg-slate-950/60 border-slate-800/80")}>
      <div onClick={() => setIsAboutModalOpen(true)} className={cn("p-2.5 rounded-xl border cursor-pointer transition-all hover:scale-[1.01]", theme === 'light' ? "bg-white border-slate-200 hover:border-blue-300 shadow-sm" : "bg-slate-800/90 border-slate-700 hover:border-blue-500")}>
        <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded">v1.0 Release</span><Info className="w-3.5 h-3.5 text-blue-600 hover:text-blue-700" /></div>
        <div className={cn("text-xs font-bold truncate", theme === 'light' ? "text-slate-800" : "text-slate-100")}>Radio Network Planner</div>
        <div className="text-[11px] text-blue-600 dark:text-blue-400 font-medium truncate mt-0.5">Develop by Tauqeer Aslam</div>
      </div>
      <div className="flex items-center justify-between mt-2.5 px-1">
        <button onClick={toggleTheme} className={cn("flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-colors", theme === 'light' ? "bg-white border-slate-200 text-slate-700 hover:bg-slate-100" : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700")} title="Toggle Light / Dark Theme">
          {theme === 'light' ? <><Moon className="w-3 h-3 text-indigo-600" /><span>Dark Mode</span></> : <><Sun className="w-3 h-3 text-amber-400" /><span>Light Mode</span></>}
        </button>
        <button onClick={() => setIsAboutModalOpen(true)} className="text-[11px] font-semibold text-slate-500 hover:text-blue-600 transition-colors">About</button>
      </div>
    </div>
  </nav>;
}

export function Header() {
  const { setCurrentView, theme, toggleTheme, setIsAboutModalOpen, exportBackup, importBackup } = useAppContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = (event) => { const content = event.target?.result as string; if (content) importBackup(content); }; reader.readAsText(file); e.target.value = ''; };
  return <header className={cn("h-14 border-b px-5 flex items-center justify-between flex-shrink-0 transition-colors duration-200 z-30 shadow-xs", theme === 'light' ? "bg-white border-slate-200" : "bg-slate-900 border-slate-800")}>
    <div className="flex items-center gap-3.5"><img src="/Pakistan_Inter_Services_(Emblem).png" alt="Logo" className="w-8 h-8 object-contain drop-shadow-sm" /><div><div className="flex items-center gap-2"><h1 className={cn("text-sm sm:text-base font-bold tracking-tight whitespace-nowrap", theme === 'light' ? "text-slate-800" : "text-white")}>Radio Network Management System</h1><span className="hidden sm:inline-block px-1.5 py-0.2 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-[10px] font-mono font-bold rounded">v1.1 GIS</span></div><p className="text-[10px] text-slate-400 leading-none mt-0.5 hidden sm:block">Develop by <strong className="text-slate-600 dark:text-slate-300 font-semibold">Tauqeer Aslam</strong></p></div></div>
    <div className="flex items-center gap-2 sm:gap-3"><div className={cn("hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-semibold", theme === 'light' ? "bg-slate-100 border-slate-200 text-slate-700" : "bg-slate-800 border-slate-700 text-slate-300")}><span className="text-[10px] font-bold text-slate-400 uppercase">PROJECT:</span><span className="font-mono text-blue-600 dark:text-blue-400">Region-7_VHF_Expansion</span></div>
      <button onClick={() => setCurrentView('map')} className={cn("p-1.5 rounded-lg border transition-colors", theme === 'light' ? "bg-slate-50 hover:bg-blue-50 border-slate-200 text-slate-700" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300")} title="Open GIS Map"><Map className="w-4 h-4 text-blue-600" /></button>
      <button onClick={toggleTheme} className={cn("p-1.5 rounded-lg border transition-colors", theme === 'light' ? "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-amber-400")} title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Theme`}>{theme === 'light' ? <Moon className="w-4 h-4 text-slate-700" /> : <Sun className="w-4 h-4 text-amber-400" />}</button>
      <button onClick={exportBackup} className={cn("px-3 py-1.5 border text-xs font-semibold rounded-lg transition flex items-center shadow-xs", theme === 'light' ? "bg-white hover:bg-slate-50 border-slate-200 text-slate-700" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200")}><Download className="w-3.5 h-3.5 mr-1.5 text-blue-600" /><span className="hidden sm:inline">Export Plan</span></button>
      <input type="file" accept=".json" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <button onClick={() => fileInputRef.current?.click()} className={cn("px-3 py-1.5 border text-xs font-semibold rounded-lg transition flex items-center shadow-xs", theme === 'light' ? "bg-white hover:bg-slate-50 border-slate-200 text-slate-700" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200")}><Upload className="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-500" /><span className="hidden sm:inline">Import Plan</span></button>
      <button onClick={() => setCurrentView('reports')} className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition flex items-center"><FileText className="w-3.5 h-3.5 mr-1.5" /><span className="hidden sm:inline">Reports</span></button>
      <button onClick={() => setIsAboutModalOpen(true)} className={cn("p-1.5 rounded-lg border transition ml-0.5", theme === 'light' ? "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-600 hover:text-blue-600" : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 hover:text-blue-400")} title="About Software Version 1.1"><Info className="w-4 h-4" /></button>
    </div>
  </header>;
}

export function StatusBar() {
  const { sites, links, theme, setIsAboutModalOpen } = useAppContext();
  const goodLinks = links.length; const marginalLinks = 0; const failedLinks = 0;
  return <footer className={cn("h-8 px-5 flex items-center justify-between flex-shrink-0 text-[10px] font-mono border-t z-30 transition-colors duration-200", theme === 'light' ? "bg-white border-slate-200 text-slate-600" : "bg-slate-900 border-slate-800 text-slate-400")}>
    <div className="flex items-center gap-5"><div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.6)]"></div><span className="font-semibold text-emerald-600 uppercase tracking-tight">System v1.1 GIS Online</span></div><div className="hidden md:flex items-center gap-4 text-slate-500"><span>Sites: <b className={theme === 'light' ? "text-slate-800" : "text-slate-200"}>{sites.length}</b></span><span>Links: <b className={theme === 'light' ? "text-slate-800" : "text-slate-200"}>{links.length}</b></span><span>Frequency: <b className={theme === 'light' ? "text-slate-800" : "text-slate-200"}>136 - 470 MHz</b></span></div></div>
    <div className="flex items-center gap-4"><div className="hidden sm:flex items-center gap-3 font-bold uppercase text-[9px]"><span className="text-emerald-600">{goodLinks} Valid</span><span className="text-amber-500">{marginalLinks} Marg</span><span className="text-rose-500">{failedLinks} Fail</span></div><div className="border-l border-slate-300 dark:border-slate-700 pl-3 flex items-center gap-1 text-slate-500"><span>Dev:</span><button onClick={() => setIsAboutModalOpen(true)} className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">Tauqeer Aslam</button></div></div>
  </footer>;
}
