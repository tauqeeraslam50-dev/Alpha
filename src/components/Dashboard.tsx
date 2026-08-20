import React from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  Activity, MapPin, Radio, AlertTriangle, Wifi, Zap, 
  Share2, Mountain, FileText, ArrowRight, ShieldCheck, CheckCircle2, Eye
} from 'lucide-react';

export function Dashboard() {
  const { sites, links, setCurrentView, theme } = useAppContext();

  const baseStationCount = sites.filter(s => s.type === 'base-station').length;
  const repeaterCount = sites.filter(s => s.type === 'repeater').length;
  const relayCount = sites.filter(s => s.type === 'relay').length;
  const avgFadeMargin = links.length > 0
    ? (links.reduce((acc, l) => acc + l.fadeMarginDB, 0) / links.length).toFixed(1)
    : '0.0';

  // Check for any link with low fade margin (<10 dB)
  const lowMarginLinks = links.filter(l => l.fadeMarginDB < 10);
  const healthScore = links.length > 0 
    ? Math.round(((links.length - lowMarginLinks.length) / links.length) * 100) 
    : 100;

  return (
    <div className={`p-4 md:p-6 space-y-6 ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">RF Network Overview & Diagnostics</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time status of wireless radio links, repeater infrastructure, and coverage topology
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Operational (v1.0)
          </span>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Sites */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Total Sites</span>
            <MapPin className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-3xl font-bold font-mono text-slate-800 dark:text-white">{sites.length}</div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-1">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span> {baseStationCount} Base
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span> {repeaterCount} Rptr
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span> {relayCount} Relay
            </span>
          </div>
        </div>

        {/* Active RF Links */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Active RF Links</span>
            <Radio className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold font-mono text-slate-800 dark:text-white">{links.length}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            Avg Fade Margin: <b className="text-emerald-600 font-mono">+{avgFadeMargin} dB</b>
          </div>
        </div>

        {/* Network Health */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Link Health</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400">{healthScore}%</div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            {lowMarginLinks.length === 0 ? 'All links clear' : `${lowMarginLinks.length} low margin`}
          </div>
        </div>

        {/* Alerts / Warnings */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Bottlenecks</span>
            <AlertTriangle className={`w-4 h-4 ${lowMarginLinks.length > 0 ? 'text-rose-500' : 'text-slate-400'}`} />
          </div>
          <div className={`text-3xl font-bold font-mono ${lowMarginLinks.length > 0 ? 'text-rose-600' : 'text-slate-800 dark:text-white'}`}>
            {lowMarginLinks.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {lowMarginLinks.length > 0 ? 'Attention required' : 'Optimal propagation'}
          </div>
        </div>
      </div>

      {/* Quick Launch & Diagnostic Modules Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Map & Site Exploration */}
        <div 
          onClick={() => setCurrentView('gis-map')}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Interactive Map & GIS</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Base stations & repeaters with live link path overlays and coordinate geocoding.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
            Open Map <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Line of Sight & Fresnel Analysis */}
        <div 
          onClick={() => setCurrentView('los')}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Eye className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Line of Sight (LOS) Analysis</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Topographic cross-sections, 1st Fresnel zone clearance, K-factor Earth curvature & diffraction.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-bold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-1 transition-transform">
            Launch LOS Studio <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Coverage Prediction Heatmaps */}
        <div 
          onClick={() => setCurrentView('coverage')}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Wifi className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Coverage & Heatmaps</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Okumura-Hata and Egli propagation modeling with 3-ring RSSI field contours.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-bold text-emerald-600 dark:text-emerald-400 group-hover:translate-x-1 transition-transform">
            Launch Coverage <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Microwave Backhaul */}
        <div 
          onClick={() => setCurrentView('microwave')}
          className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-amber-500 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
        >
          <div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Microwave Backhaul</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ITU-R P.530 path reliability, rain attenuation, parabolic dish gain, and modulation.
            </p>
          </div>
          <div className="mt-4 flex items-center text-xs font-bold text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform">
            Open Microwave <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>
      </div>

      {/* Active Links Table */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-600" />
            Active Radio Link Roster
          </h3>
          <button 
            onClick={() => setCurrentView('rf-links')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            Manage Link Budgets <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 text-[10px]">
              <tr>
                <th className="py-2 px-3">Path Link</th>
                <th className="py-2 px-3">Distance</th>
                <th className="py-2 px-3">Frequency</th>
                <th className="py-2 px-3">TX Power</th>
                <th className="py-2 px-3">Fade Margin</th>
                <th className="py-2 px-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {links.map(l => {
                const src = sites.find(s => s.id === l.sourceSiteId)?.name || l.sourceSiteId;
                const tgt = sites.find(s => s.id === l.targetSiteId)?.name || l.targetSiteId;
                return (
                  <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                      {src} <span className="text-slate-400 mx-1">↔</span> {tgt}
                    </td>
                    <td className="py-2.5 px-3 font-mono">{l.distanceKm.toFixed(1)} km</td>
                    <td className="py-2.5 px-3 font-mono text-blue-600 dark:text-blue-400 font-semibold">
                      {l.frequencyMHz} MHz
                    </td>
                    <td className="py-2.5 px-3 font-mono">{l.txPowerDBm} dBm</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{l.fadeMarginDB} dB
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Optimal
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
