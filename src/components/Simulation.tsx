import React from 'react';
import { useAppContext } from '../context/AppContext';
import { Share2, Activity, Play } from 'lucide-react';

export function Simulation() {
  const { sites, links } = useAppContext();

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center">
          <Share2 className="w-6 h-6 mr-3 text-blue-600" />
          Network Topology Simulation
        </h2>
        
        <button className="flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded shadow-sm transition">
          <Play className="w-4 h-4 mr-2" />
          Run Simulation
        </button>
      </div>

      <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-5 mb-6">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Topology Map</h3>
        <div className="font-mono text-sm text-slate-600 bg-slate-50 p-6 rounded-lg border border-slate-200 flex justify-center overflow-x-auto whitespace-pre">
{`             REPEATER-01
             /         \\
        SITE-01       SITE-02
          |              |
       RADIO-01       RADIO-02
                          \\
                        SITE-03`}
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-300 shadow-sm rounded-xl overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest">Link Status Analysis</h3>
          <div className="flex space-x-4 text-xs font-semibold text-slate-600">
            <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-emerald-500 mr-2 shadow-sm"></div>Good</span>
            <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-amber-500 mr-2 shadow-sm"></div>Marginal</span>
            <span className="flex items-center"><div className="w-2 h-2 rounded-full bg-rose-500 mr-2 shadow-sm"></div>Failed</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Link Path</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Distance</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Analysis Notes</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {links.map((link) => {
                const source = sites.find(s => s.id === link.sourceSiteId)?.name;
                const target = sites.find(s => s.id === link.targetSiteId)?.name;
                return (
                  <tr key={link.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-semibold">
                      {source} ↔ {target}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                      {link.distanceKm} km
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 inline-flex text-[10px] font-bold uppercase tracking-widest rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
                        Good
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      Fade margin &gt; 20dB. Solid connection.
                    </td>
                  </tr>
                );
              })}
              <tr className="hover:bg-slate-50 transition">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-800 font-semibold">
                  SITE-02 ↔ SITE-03
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                  45.2 km
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 inline-flex text-[10px] font-bold uppercase tracking-widest rounded bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
                    Failed
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-rose-600 font-medium">
                  Terrain obstruction at km 22. LOS blocked.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
