import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { calculateFSPL, calculateReceivedPower } from '../lib/utils';
import { Calculator, ArrowRight } from 'lucide-react';

export function RFLinkBudget() {
  const { links, sites, equipmentDB } = useAppContext();
  const [selectedLinkId, setSelectedLinkId] = useState<string>(links[0]?.id || '');

  const activeLink = links.find(l => l.id === selectedLinkId);
  const source = sites.find(s => s.id === activeLink?.sourceSiteId);
  const target = sites.find(s => s.id === activeLink?.targetSiteId);
  const eq = equipmentDB.find(e => e.id === activeLink?.equipmentId);

  if (!activeLink || !source || !target) {
    return <div className="p-6 text-slate-400">No active links available to calculate.</div>;
  }

  const fspl = calculateFSPL(activeLink.distanceKm, activeLink.frequencyMHz);
  const rsl = calculateReceivedPower(activeLink, fspl);
  const rxSens = eq?.rxSensitivityDBm || -100;
  const margin = rsl - rxSens;
  const isGood = margin >= activeLink.fadeMarginDB;

  return (
    <div className="p-6 h-full flex flex-col">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
        <Calculator className="w-6 h-6 mr-3 text-blue-600" />
        RF Link Budget Calculation
      </h2>
      
      <div className="flex gap-4 mb-6">
        <select 
          value={selectedLinkId} 
          onChange={e => setSelectedLinkId(e.target.value)}
          className="bg-white border border-slate-300 shadow-sm text-slate-800 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-2.5"
        >
          {links.map(l => {
            const s = sites.find(site => site.id === l.sourceSiteId)?.name;
            const t = sites.find(site => site.id === l.targetSiteId)?.name;
            return <option key={l.id} value={l.id}>{s} ↔ {t}</option>;
          })}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Source Site */}
        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">TX Node: {source.name}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 font-medium">TX Power</span> <span className="text-slate-800 font-mono font-semibold">{activeLink.txPowerDBm} dBm</span></div>
            <div className="flex justify-between"><span className="text-slate-500 font-medium">Antenna Gain</span> <span className="text-slate-800 font-mono font-semibold">{activeLink.txAntennaGainDBi} dBi</span></div>
            <div className="flex justify-between"><span className="text-slate-500 font-medium">Cable Loss</span> <span className="text-rose-600 font-mono font-semibold">-{activeLink.txCableLossDB} dB</span></div>
            <div className="pt-2 border-t border-slate-100 flex justify-between font-bold">
              <span className="text-slate-600 text-xs uppercase tracking-wider">EIRP</span>
              <span className="text-blue-600 font-mono">{(activeLink.txPowerDBm + activeLink.txAntennaGainDBi - activeLink.txCableLossDB).toFixed(1)} dBm</span>
            </div>
          </div>
        </div>

        {/* Path */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>
          <ArrowRight className="w-8 h-8 text-slate-400 mb-2" />
          <div className="text-center z-10">
            <div className="text-slate-600 font-bold mb-1 text-xs uppercase tracking-widest">Path Loss</div>
            <div className="text-rose-600 font-mono text-xl mb-3 font-bold">-{fspl.toFixed(2)} dB</div>
            <div className="text-slate-500 text-sm font-medium">Distance: {activeLink.distanceKm} km</div>
            <div className="text-slate-500 text-sm font-medium">Freq: {activeLink.frequencyMHz} MHz</div>
          </div>
        </div>

        {/* Target Site */}
        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-5">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">RX Node: {target.name}</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 font-medium">Antenna Gain</span> <span className="text-slate-800 font-mono font-semibold">{activeLink.rxAntennaGainDBi} dBi</span></div>
            <div className="flex justify-between"><span className="text-slate-500 font-medium">Cable Loss</span> <span className="text-rose-600 font-mono font-semibold">-{activeLink.rxCableLossDB} dB</span></div>
            <div className="flex justify-between"><span className="text-slate-500 font-medium">RX Sensitivity</span> <span className="text-slate-800 font-mono font-semibold">{rxSens} dBm</span></div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mt-6 bg-white border border-slate-300 shadow-sm rounded-xl p-6">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-6 border-b border-slate-100 pb-2">Link Analysis Results</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Received Signal Level (RSL)</div>
            <div className={`text-3xl font-bold font-mono ${rsl >= rxSens ? 'text-emerald-600' : 'text-rose-600'}`}>
              {rsl.toFixed(2)} dBm
            </div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Fade Margin</div>
            <div className={`text-3xl font-bold font-mono ${margin >= activeLink.fadeMarginDB ? 'text-emerald-600' : 'text-amber-600'}`}>
              {margin.toFixed(2)} dB
            </div>
            <div className="text-slate-400 text-xs mt-1 font-medium">Target: {activeLink.fadeMarginDB} dB</div>
          </div>
          <div className="p-4 flex flex-col justify-center">
            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-3">Status</div>
            <div className="flex items-center">
              {isGood ? (
                <div className="w-full text-center px-4 py-2 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 text-xs font-bold uppercase tracking-widest shadow-sm">PASS - RELIABLE LINK</div>
              ) : (
                <div className="w-full text-center px-4 py-2 bg-rose-50 text-rose-700 rounded border border-rose-200 text-xs font-bold uppercase tracking-widest shadow-sm">FAIL - MARGIN TOO LOW</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
