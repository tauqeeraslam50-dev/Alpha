import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { calculatePathLossAtDistance, calculateReceivedPower, calculateRealisticRange, calculateRadioHorizon, calculateFSPL, calculateFresnelZone } from '../lib/utils';
import { Calculator, ArrowRight, Radio, Compass, ShieldCheck, Download, Eye, Activity } from 'lucide-react';

export function RFLinkBudget() {
  const { links, sites, equipmentDB, setCurrentView } = useAppContext();
  const [selectedLinkId, setSelectedLinkId] = useState<string>(links[0]?.id || '');
  const [environment, setEnvironment] = useState<string>('suburban');
  const [txTowerHeight, setTxTowerHeight] = useState<number>(30);
  const [rxTowerHeight, setRxTowerHeight] = useState<number>(30);

  const activeLink = links.find(l => l.id === selectedLinkId);
  const source = sites.find(s => s.id === activeLink?.sourceSiteId);
  const target = sites.find(s => s.id === activeLink?.targetSiteId);
  const eq = equipmentDB.find(e => e.id === activeLink?.equipmentId);

  if (!activeLink || !source || !target) {
    return <div className="p-6 text-slate-400">No active links available to calculate.</div>;
  }

  const pathLoss = calculatePathLossAtDistance(activeLink.distanceKm, activeLink.frequencyMHz, txTowerHeight, rxTowerHeight, environment);
  const rsl = calculateReceivedPower(activeLink, pathLoss);
  const rxSens = eq?.rxSensitivityDBm || -110;
  const margin = rsl - rxSens;
  const isGood = margin >= activeLink.fadeMarginDB;
  
  const fspl = calculateFSPL(activeLink.distanceKm, activeLink.frequencyMHz);
  const fresnelRadius = calculateFresnelZone(activeLink.distanceKm, activeLink.frequencyMHz, 1);
  const bandwidthHz = (activeLink.channelBandwidthKHz || eq?.channelSpacingKHz || 12.5) * 1000;
  const thermalNoiseDBm = -174 + 10 * Math.log10(bandwidthHz);
  const snr = rsl - thermalNoiseDBm;

  // Calculate realistic link communication range
  const rangeResult = calculateRealisticRange({
    txPowerDBm: activeLink.txPowerDBm,
    txGainDBi: activeLink.txAntennaGainDBi,
    rxGainDBi: activeLink.rxAntennaGainDBi,
    txLossDB: activeLink.txCableLossDB,
    rxLossDB: activeLink.rxCableLossDB,
    rxSensDBm: rxSens,
    fadeMarginDB: activeLink.fadeMarginDB,
    freqMHz: activeLink.frequencyMHz,
    ht_m: txTowerHeight,
    hr_m: rxTowerHeight,
    environment
  });

  const radioHorizon = calculateRadioHorizon(txTowerHeight, rxTowerHeight);

  const exportToCSV = () => {
    const eirp = activeLink.txPowerDBm + activeLink.txAntennaGainDBi - activeLink.txCableLossDB;
    
    const csvRows = [
      ['RF Link Budget Analysis'],
      ['Export Date', new Date().toISOString()],
      ['Link ID', activeLink.id],
      ['Frequency (MHz)', activeLink.frequencyMHz],
      ['Distance (km)', activeLink.distanceKm],
      ['Clutter Environment', environment],
      [],
      ['Transmitter (TX)'],
      ['Site Name', source.name],
      ['Tower Height (m)', txTowerHeight],
      ['TX Power (dBm)', activeLink.txPowerDBm],
      ['TX Antenna Gain (dBi)', activeLink.txAntennaGainDBi],
      ['TX Cable Loss (dB)', activeLink.txCableLossDB],
      ['EIRP (dBm)', eirp.toFixed(2)],
      [],
      ['Path & Propagation'],
      ['Free Space Path Loss (dB)', fspl.toFixed(2)],
      ['Total Path Loss (dB)', pathLoss.toFixed(2)],
      ['Radio Horizon (km)', radioHorizon.toFixed(2)],
      ['1st Fresnel Zone Radius (m)', fresnelRadius.toFixed(2)],
      [],
      ['Receiver (RX)'],
      ['Site Name', target.name],
      ['Tower Height (m)', rxTowerHeight],
      ['RX Antenna Gain (dBi)', activeLink.rxAntennaGainDBi],
      ['RX Cable Loss (dB)', activeLink.rxCableLossDB],
      ['RX Sensitivity (dBm)', rxSens],
      ['Thermal Noise Floor (dBm)', thermalNoiseDBm.toFixed(2)],
      [],
      ['Performance Analysis'],
      ['Received Signal Level (dBm)', rsl.toFixed(2)],
      ['Signal to Noise Ratio (dB)', snr.toFixed(2)],
      ['Fade Margin (dB)', margin.toFixed(2)],
      ['Required Margin (dB)', activeLink.fadeMarginDB],
      ['Status', isGood ? 'PASS - RELIABLE' : 'FAIL - DEFICIT'],
      ['Absolute Max Range (km)', rangeResult.maxRangeKm.toFixed(2)],
      ['Reliable Range (km)', rangeResult.reliableRangeKm.toFixed(2)]
    ];

    const csvContent = csvRows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `link_budget_${source.name}_to_${target.name}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center">
            <Calculator className="w-6 h-6 mr-3 text-blue-600" />
            RF Link Budget & Communication Range
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Physical path calculation using ITU-R & Okumura-Hata empirical models</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Link:</label>
            <select 
              value={selectedLinkId} 
              onChange={e => setSelectedLinkId(e.target.value)}
              className="bg-white border border-slate-300 shadow-sm text-slate-800 text-xs font-semibold rounded focus:ring-blue-500 focus:border-blue-500 p-2"
            >
              {links.map(l => {
                const s = sites.find(site => site.id === l.sourceSiteId)?.name;
                const t = sites.find(site => site.id === l.targetSiteId)?.name;
                return <option key={l.id} value={l.id}>{s} ↔ {t}</option>;
              })}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Clutter:</label>
            <select
              value={environment}
              onChange={e => setEnvironment(e.target.value)}
              className="bg-white border border-slate-300 shadow-sm text-slate-800 text-xs font-semibold rounded focus:ring-blue-500 focus:border-blue-500 p-2"
            >
              <option value="suburban">Suburban (Hata)</option>
              <option value="rural">Rural / Open (Hata/Egli)</option>
              <option value="urban">Urban City</option>
              <option value="los">Line of Sight (Free Space)</option>
            </select>
          </div>
          
          <button 
            onClick={() => setCurrentView('los')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-xs font-bold transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Topographic LOS
          </button>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded text-xs font-bold transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Source Site */}
        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-5">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">TX: {source.name}</h3>
            <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">{source.type.replace('-', ' ')}</span>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 font-medium">TX Power</span> <span className="text-slate-800 font-mono font-semibold">{activeLink.txPowerDBm} dBm ({(Math.pow(10, activeLink.txPowerDBm / 10) / 1000).toFixed(1)}W)</span></div>
            <div className="flex justify-between"><span className="text-slate-500 font-medium">Antenna Gain</span> <span className="text-slate-800 font-mono font-semibold">{activeLink.txAntennaGainDBi} dBi</span></div>
            <div className="flex justify-between"><span className="text-slate-500 font-medium">Cable Loss</span> <span className="text-rose-600 font-mono font-semibold">-{activeLink.txCableLossDB} dB</span></div>
            
            <div className="flex justify-between items-center pt-2">
              <span className="text-slate-500 font-medium text-xs">Tower/Mast Height:</span>
              <div className="flex items-center gap-1">
                <input 
                  type="number" 
                  value={txTowerHeight} 
                  onChange={e => setTxTowerHeight(Number(e.target.value))}
                  className="w-16 text-xs p-1 border border-slate-300 rounded font-mono text-right"
                />
                <span className="text-xs text-slate-400">m</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between font-bold">
              <span className="text-slate-600 text-xs uppercase tracking-wider">EIRP</span>
              <span className="text-blue-600 font-mono">{(activeLink.txPowerDBm + activeLink.txAntennaGainDBi - activeLink.txCableLossDB).toFixed(1)} dBm</span>
            </div>
          </div>
        </div>

        {/* Path */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col items-center justify-center relative overflow-hidden shadow-inner">
          <ArrowRight className="w-8 h-8 text-slate-400 mb-2" />
          <div className="text-center z-10">
            <div className="text-slate-600 font-bold mb-1 text-xs uppercase tracking-widest">Total Path Loss</div>
            <div className="text-rose-600 font-mono text-xl mb-2 font-bold">-{pathLoss.toFixed(2)} dB</div>
            <div className="text-slate-600 text-xs font-semibold">Link Distance: <span className="text-slate-900 font-mono">{activeLink.distanceKm} km</span></div>
            <div className="text-slate-500 text-xs font-medium mt-1">Frequency: <span className="font-mono">{activeLink.frequencyMHz} MHz</span></div>
            <div className="text-[11px] text-slate-400 mt-2 font-mono">Radio Horizon: {radioHorizon.toFixed(1)} km</div>
          </div>
        </div>

        {/* Target Site */}
        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-5">
          <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">RX: {target.name}</h3>
            <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">{target.type.replace('-', ' ')}</span>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 font-medium">Antenna Gain</span> <span className="text-slate-800 font-mono font-semibold">{activeLink.rxAntennaGainDBi} dBi</span></div>
            <div className="flex justify-between"><span className="text-slate-500 font-medium">Cable Loss</span> <span className="text-rose-600 font-mono font-semibold">-{activeLink.rxCableLossDB} dB</span></div>
            <div className="flex justify-between"><span className="text-slate-500 font-medium">RX Sensitivity</span> <span className="text-slate-800 font-mono font-semibold">{rxSens} dBm</span></div>
            
            <div className="flex justify-between items-center pt-2">
              <span className="text-slate-500 font-medium text-xs">Tower/Mast Height:</span>
              <div className="flex items-center gap-1">
                <input 
                  type="number" 
                  value={rxTowerHeight} 
                  onChange={e => setRxTowerHeight(Number(e.target.value))}
                  className="w-16 text-xs p-1 border border-slate-300 rounded font-mono text-right"
                />
                <span className="text-xs text-slate-400">m</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-between font-bold">
              <span className="text-slate-600 text-xs uppercase tracking-wider">Required Margin</span>
              <span className="text-amber-600 font-mono">{activeLink.fadeMarginDB} dB</span>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mt-6 bg-white border border-slate-300 shadow-sm rounded-xl p-6">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2 flex items-center justify-between">
          <span>Link Analysis & Fade Performance</span>
          <span className="text-[10px] font-mono text-slate-400 font-normal">Receiver Threshold: {rxSens} dBm | Noise Floor: {thermalNoiseDBm.toFixed(1)} dBm</span>
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Received Signal (RSL)</div>
            <div className={`text-2xl font-bold font-mono ${rsl >= rxSens ? 'text-emerald-600' : 'text-rose-600'}`}>
              {rsl.toFixed(2)} dBm
            </div>
            <div className="text-slate-400 text-[10px] mt-1 font-medium">Expected signal level</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Link Fade Margin</div>
            <div className={`text-2xl font-bold font-mono ${margin >= activeLink.fadeMarginDB ? 'text-emerald-600' : 'text-amber-600'}`}>
              {margin.toFixed(2)} dB
            </div>
            <div className="text-slate-400 text-[10px] mt-1 font-medium">Design Target: {activeLink.fadeMarginDB} dB</div>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1">Signal to Noise (SNR)</div>
            <div className={`text-2xl font-bold font-mono ${snr >= 10 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {snr.toFixed(2)} dB
            </div>
            <div className="text-slate-400 text-[10px] mt-1 font-medium">Above Thermal Noise Floor</div>
          </div>
          <div className="p-4 flex flex-col justify-center">
            <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2">Link Viability</div>
            <div>
              {isGood ? (
                <div className="w-full text-center px-2 py-2 bg-emerald-50 text-emerald-700 rounded border border-emerald-200 text-[10px] font-bold uppercase tracking-widest shadow-sm flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  PASS - RELIABLE
                </div>
              ) : (
                <div className="w-full text-center px-2 py-2 bg-rose-50 text-rose-700 rounded border border-rose-200 text-[10px] font-bold uppercase tracking-widest shadow-sm">
                  MARGIN DEFICIT ({Math.abs(margin - activeLink.fadeMarginDB).toFixed(1)} dB short)
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="flex justify-between items-center p-3 bg-indigo-50/40 rounded border border-indigo-100">
            <div>
              <div className="text-xs font-bold text-slate-700">Free Space Path Loss (FSPL)</div>
              <div className="text-[10px] text-slate-500">Theoretical loss in a perfect vacuum</div>
            </div>
            <div className="font-mono font-bold text-indigo-700">-{fspl.toFixed(2)} dB</div>
          </div>
          <div className="flex justify-between items-center p-3 bg-indigo-50/40 rounded border border-indigo-100">
            <div>
              <div className="text-xs font-bold text-slate-700">1st Fresnel Zone Radius</div>
              <div className="text-[10px] text-slate-500">Maximum clearance needed at mid-point</div>
            </div>
            <div className="font-mono font-bold text-indigo-700">{fresnelRadius.toFixed(2)} m</div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center">
              <Compass className="w-4 h-4 mr-1.5 text-indigo-600" />
              Realistic Communication Range Estimation
            </h3>
            <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded font-bold">
              Model: {rangeResult.modelUsed}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-4 bg-indigo-50/70 rounded-lg border border-indigo-100">
              <div className="text-indigo-700 text-xs font-bold uppercase tracking-wider mb-1">
                Reliable Range ({activeLink.fadeMarginDB}dB Margin)
              </div>
              <div className="text-2xl font-bold font-mono text-indigo-800">
                {rangeResult.reliableRangeKm} <span className="text-sm font-normal text-indigo-600">km</span>
              </div>
              <div className="text-indigo-600/80 text-[11px] mt-1.5 leading-snug">
                Max operating distance ensuring full fade margin under {environment} propagation.
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-1">
                Absolute Max Range (0dB Margin)
              </div>
              <div className="text-2xl font-bold font-mono text-slate-800">
                {rangeResult.maxRangeKm} <span className="text-sm font-normal text-slate-500">km</span>
              </div>
              <div className="text-slate-500 text-[11px] mt-1.5 leading-snug">
                Distance where signal strength drops to sensitivity limit ({rxSens} dBm).
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-slate-600 text-xs font-bold uppercase tracking-wider mb-1">
                Earth Curvature Radio Horizon
              </div>
              <div className="text-2xl font-bold font-mono text-slate-800">
                {radioHorizon.toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span>
              </div>
              <div className="text-slate-500 text-[11px] mt-1.5 leading-snug">
                Geometric Line of Sight limit with standard k=4/3 atmospheric refraction.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
