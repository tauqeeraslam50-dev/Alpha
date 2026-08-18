import React from 'react';
import { useAppContext } from '../context/AppContext';
import { View } from '../types';
import { cn } from '../lib/utils';
import {
  LayoutDashboard, Map as MapIcon, MapPin, Radio, Activity,
  Wifi, Zap, Share2, Mountain, FileText, Database,
  Save, Download, Settings
} from 'lucide-react';

interface SidebarItemProps {
  view: View;
  icon: React.ElementType;
  label: string;
}

export function Sidebar() {
  const { currentView, setCurrentView } = useAppContext();

  const NavItem = ({ view, icon: Icon, label }: SidebarItemProps) => {
    const isActive = currentView === view;
    return (
      <button
        type="button"
        onClick={() => setCurrentView(view)}
        className={cn(
          "flex items-center w-full px-3 py-2 text-sm transition-colors rounded mb-0.5 text-left",
          isActive 
            ? "bg-blue-600 text-white font-medium cursor-pointer" 
            : "text-slate-400 hover:text-white hover:bg-slate-700/50 cursor-pointer"
        )}
      >
        <Icon className="w-4 h-4 mr-3" />
        <span className="font-medium">{label}</span>
      </button>
    );
  };

  return (
    <nav className="w-64 bg-slate-800 flex flex-col flex-shrink-0 h-full relative z-20">
      <div className="p-4 space-y-1 overflow-y-auto flex-1">
        <NavItem view="dashboard" icon={LayoutDashboard} label="Dashboard" />
        <NavItem view="gis-map" icon={MapIcon} label="GIS Terrain Engine" />
        
        <div className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 mt-6">Network</div>
        <NavItem view="sites" icon={MapPin} label="Sites & Nodes" />
        <NavItem view="rf-links" icon={Radio} label="RF Link Budget" />
        <NavItem view="frequency" icon={Activity} label="VHF/UHF Planning" />
        
        <div className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 mt-6">Analysis</div>
        <NavItem view="coverage" icon={Wifi} label="Coverage Prediction" />
        <NavItem view="microwave" icon={Zap} label="Microwave Backhaul" />
        <NavItem view="simulation" icon={Share2} label="Network Simulation" />
        <NavItem view="terrain" icon={Mountain} label="Terrain Profile" />
        
        <div className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 mt-6">Data</div>
        <NavItem view="reports" icon={FileText} label="Reports & Export" />
        <NavItem view="database" icon={Database} label="Engineering Database" />
      </div>
      <div className="mt-auto p-4 border-t border-slate-700 bg-slate-900/50">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Live Telemetry</div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">CPU Load</span>
            <span className="text-slate-200">12%</span>
          </div>
          <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 w-[12%]"></div>
          </div>
        </div>
      </div>
    </nav>
  );
}

export function Header() {
  const { setCurrentView, sites, links } = useAppContext();
  
  const handleExportApp = () => {
    const exportData = {
      sites,
      links,
      exportDate: new Date().toISOString(),
      appName: 'RF NEXUS | Network Planner Pro'
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "rf_nexus_export.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };
  
  return (
    <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-4">
        <div className="bg-blue-600 p-1.5 rounded shadow-sm">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-lg font-bold tracking-tight text-slate-800">
          RF NEXUS <span className="text-slate-400 font-normal ml-2">| Network Planner Pro</span>
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded border border-slate-200">
          <span className="text-xs font-semibold text-slate-500">PROJECT:</span>
          <span className="text-xs font-bold text-slate-700 uppercase">Region-7_VHF_Expansion</span>
        </div>
        <button 
          onClick={handleExportApp}
          className="px-4 py-1.5 bg-white border border-slate-300 text-xs font-semibold text-slate-700 rounded hover:bg-slate-50 transition flex items-center shadow-sm"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          Export Data
        </button>
        <button 
          onClick={() => setCurrentView('reports')}
          className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded shadow-sm hover:bg-blue-700 transition flex items-center"
        >
          <FileText className="w-3.5 h-3.5 mr-1.5" />
          Generate Report
        </button>
        <button className="p-1.5 text-slate-400 hover:text-slate-600 transition ml-2">
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

export function StatusBar() {
  const { sites, links } = useAppContext();
  
  // Mock logic for status
  const goodLinks = links.length;
  const marginalLinks = 0;
  const failedLinks = 0;

  return (
    <footer className="h-8 bg-slate-900 border-t border-slate-800 px-6 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">System Ready</span>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-slate-500">
          <span>Sites: <b className="text-slate-300">{sites.length}</b></span>
          <span>Links: <b className="text-slate-300">{links.length}</b></span>
          <span>Frequency: <b className="text-slate-300">446.0-446.2 MHz</b></span>
        </div>
      </div>
      <div className="flex items-center gap-4 text-[10px] font-bold uppercase">
        <span className="text-emerald-500">{goodLinks} Good</span>
        <span className="text-amber-500">{marginalLinks} Marginal</span>
        <span className="text-rose-500">{failedLinks} Fail</span>
      </div>
    </footer>
  );
}
