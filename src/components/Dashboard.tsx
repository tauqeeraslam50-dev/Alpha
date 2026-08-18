import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Activity, MapPin, Radio, AlertTriangle } from 'lucide-react';

export function Dashboard() {
  const { sites, links } = useAppContext();

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold text-slate-800 mb-6">Network Dashboard</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Total Sites</h3>
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-3xl font-bold text-slate-800">{sites.length}</p>
        </div>
        
        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Active RF Links</h3>
            <Radio className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-slate-800">{links.length}</p>
        </div>

        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Network Health</h3>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-emerald-600">100%</p>
        </div>

        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-slate-500 uppercase tracking-widest text-[10px] font-bold">Alerts</h3>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-3xl font-bold text-slate-800">0</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-5 h-64">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Recent Activity</h3>
          <div className="space-y-4">
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 rounded-full bg-blue-500 mr-3"></div>
              <span className="text-slate-700">Added new repeater <span className="font-mono text-blue-600">REPEATER-01</span></span>
              <span className="text-slate-400 ml-auto text-xs">2h ago</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mr-3"></div>
              <span className="text-slate-700">Link budget optimized for <span className="font-mono text-emerald-600">SITE-01 ↔ REPEATER-01</span></span>
              <span className="text-slate-400 ml-auto text-xs">3h ago</span>
            </div>
            <div className="flex items-center text-sm">
              <div className="w-2 h-2 rounded-full bg-slate-400 mr-3"></div>
              <span className="text-slate-700">Updated equipment DB with Motorola SLR 5500</span>
              <span className="text-slate-400 ml-auto text-xs">1d ago</span>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-5 h-64 flex flex-col items-center justify-center bg-slate-50/50">
          <Activity className="w-12 h-12 text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm font-medium">No coverage maps generated yet.</p>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded shadow-sm hover:bg-blue-700 transition">
            Generate Coverage Map
          </button>
        </div>
      </div>
    </div>
  );
}
