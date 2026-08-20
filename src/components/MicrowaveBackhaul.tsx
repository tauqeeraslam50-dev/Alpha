import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  Radio, Zap, ShieldCheck, AlertTriangle, Compass, Activity, 
  BarChart2, Layers, Download, CheckCircle, Info, Sliders, ArrowRight
} from 'lucide-react';
import { calculateDistanceKm, calculateBearing, calculateEarthBulge } from '../lib/utils';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell 
} from 'recharts';

export function MicrowaveBackhaul() {
  const { sites, links, theme } = useAppContext();
  
  // Select active link or fallback
  const [selectedLinkId, setSelectedLinkId] = useState<string>(links[0]?.id || '');
  
  // Microwave Parameters
  const [freqGHz, setFreqGHz] = useState<number>(11.0); // 6, 7, 8, 11, 13, 15, 18, 23, 38, 80 GHz
  const [txPowerDBm, setTxPowerDBm] = useState<number>(27); // Standard MW ODU power ~24-30 dBm
  const [txDishDiameterM, setTxDishDiameterM] = useState<number>(0.6); // 0.3m, 0.6m, 1.2m, 1.8m
  const [rxDishDiameterM, setRxDishDiameterM] = useState<number>(0.6);
  const [dishEfficiency, setDishEfficiency] = useState<number>(0.60); // 60% standard parabolic efficiency
  const [txWaveguideLossDB, setTxWaveguideLossDB] = useState<number>(1.0);
  const [rxWaveguideLossDB, setRxWaveguideLossDB] = useState<number>(1.0);
  const [modulation, setModulation] = useState<string>('256QAM');
  const [channelBandwidthMHz, setChannelBandwidthMHz] = useState<number>(56);
  const [rainRateMmHr, setRainRateMmHr] = useState<number>(42); // ITU Rain Zone K/M standard (e.g. 42 mm/hr for 99.99%)
  const [polarization, setPolarization] = useState<'vertical' | 'horizontal'>('vertical');
  const [kFactor, setKFactor] = useState<number>(1.333); // 4/3 earth standard

  const activeLink = links.find(l => l.id === selectedLinkId) || links[0];
  const sourceSite = sites.find(s => s.id === activeLink?.sourceSiteId) || sites[0];
  const targetSite = sites.find(s => s.id === activeLink?.targetSiteId) || sites[1] || sites[0];

  const distanceKm = useMemo(() => {
    if (!sourceSite || !targetSite) return 10;
    const d = calculateDistanceKm(sourceSite.lat, sourceSite.lng, targetSite.lat, targetSite.lng);
    return d > 0 ? Number(d.toFixed(2)) : (activeLink?.distanceKm || 10);
  }, [sourceSite, targetSite, activeLink]);

  // Microwave Math Engine (ITU-R P.530 & Antenna Theory)
  const mwCalculations = useMemo(() => {
    const c = 299792458; // speed of light m/s
    const lambdaM = c / (freqGHz * 1e9); // wavelength in meters
    const wavelengthMm = lambdaM * 1000;

    // Parabolic Dish Antenna Gain: G (dBi) = 10 * log10( eta * (pi * D / lambda)^2 )
    const calcDishGain = (diamM: number) => {
      const gLinear = dishEfficiency * Math.pow((Math.PI * diamM) / lambdaM, 2);
      return Math.max(10 * Math.log10(gLinear), 0);
    };

    const txDishGainDBi = calcDishGain(txDishDiameterM);
    const rxDishGainDBi = calcDishGain(rxDishDiameterM);

    // 3dB Beamwidth (Half-power beamwidth): theta_3dB ≈ 70 * (lambda / D) degrees
    const txBeamwidthDeg = (70 * lambdaM) / txDishDiameterM;
    const rxBeamwidthDeg = (70 * lambdaM) / rxDishDiameterM;

    // Free Space Path Loss: FSPL = 92.45 + 20*log10(f_GHz) + 20*log10(d_km)
    const fsplDB = 92.45 + 20 * Math.log10(freqGHz) + 20 * Math.log10(distanceKm);

    // Atmospheric Absorption (Oxygen + Water Vapor ITU-R P.676)
    // Approximate ~0.01 dB/km at 6-11 GHz, rising at 18-23 GHz and 60-80 GHz
    let specificGasAttenDBPerKm = 0.012;
    if (freqGHz >= 15 && freqGHz < 25) specificGasAttenDBPerKm = 0.08;
    else if (freqGHz >= 25 && freqGHz <= 40) specificGasAttenDBPerKm = 0.15;
    else if (freqGHz > 40) specificGasAttenDBPerKm = 0.45;
    const atmosphericGasLossDB = specificGasAttenDBPerKm * distanceKm;

    // Rain Attenuation (ITU-R P.838): gamma_R = k * R^alpha
    // Approximate coefficients for vertical/horizontal polarization
    const kRain = polarization === 'vertical' ? 0.015 * Math.pow(freqGHz / 10, 1.8) : 0.018 * Math.pow(freqGHz / 10, 1.85);
    const alphaRain = polarization === 'vertical' ? 1.15 : 1.18;
    const specificRainLossDBPerKm = kRain * Math.pow(rainRateMmHr, alphaRain);
    // Effective path distance reduction factor d_eff
    const rFactor = 1 / (1 + 0.78 * Math.sqrt((distanceKm * specificRainLossDBPerKm) / freqGHz) - 0.38 * (1 - Math.exp(-0.07 * distanceKm)));
    const effectiveDistanceKm = distanceKm * Math.min(Math.max(rFactor, 0.2), 1.0);
    const rainLossDB = specificRainLossDBPerKm * effectiveDistanceKm;

    // EIRP & RSL (Received Signal Level)
    const eirpDBm = txPowerDBm + txDishGainDBi - txWaveguideLossDB;
    const totalClearSkyLossDB = fsplDB + atmosphericGasLossDB;
    const rslClearSkyDBm = eirpDBm + rxDishGainDBi - rxWaveguideLossDB - totalClearSkyLossDB;
    const rslFadedRainDBm = rslClearSkyDBm - rainLossDB;

    // Modulation & Sensitivity Matrix
    const modSensMap: Record<string, { sensDBm: number; snrDB: number; spectralEffBpsHz: number }> = {
      'QPSK':    { sensDBm: -91.0, snrDB: 9.8,  spectralEffBpsHz: 1.8 },
      '16QAM':   { sensDBm: -84.5, snrDB: 16.5, spectralEffBpsHz: 3.6 },
      '64QAM':   { sensDBm: -78.0, snrDB: 22.8, spectralEffBpsHz: 5.4 },
      '128QAM':  { sensDBm: -75.0, snrDB: 25.9, spectralEffBpsHz: 6.3 },
      '256QAM':  { sensDBm: -71.5, snrDB: 29.0, spectralEffBpsHz: 7.2 },
      '512QAM':  { sensDBm: -68.0, snrDB: 32.0, spectralEffBpsHz: 8.1 },
      '1024QAM': { sensDBm: -64.5, snrDB: 35.2, spectralEffBpsHz: 9.0 },
      '2048QAM': { sensDBm: -61.0, snrDB: 38.5, spectralEffBpsHz: 9.9 },
      '4096QAM': { sensDBm: -57.5, snrDB: 41.8, spectralEffBpsHz: 10.8 },
    };

    const currentModSpecs = modSensMap[modulation] || modSensMap['256QAM'];
    const rxThresholdDBm = currentModSpecs.sensDBm;
    const clearSkyFadeMarginDB = rslClearSkyDBm - rxThresholdDBm;
    const rainFadeMarginDB = rslFadedRainDBm - rxThresholdDBm;

    // Capacity / Throughput = Bandwidth * Spectral Efficiency (Mbps)
    const netThroughputMbps = channelBandwidthMHz * currentModSpecs.spectralEffBpsHz * 0.92; // 92% payload after framing & FEC

    // 1st Fresnel Zone Radius at midpoint: F1 = 17.32 * sqrt( (d/2 * d/2) / (f_GHz * d) ) = 8.66 * sqrt(d / f_GHz)
    const midFresnelRadiusM = 8.66 * Math.sqrt(distanceKm / freqGHz);
    const mid60PercentFresnelM = midFresnelRadiusM * 0.6;

    // Vigants-Barnett Multipath Fading Availability Model (ITU-R P.530)
    // P_fade = c * f^a * d^b * 10^(-FadeMargin/10)
    const cFactor = 1.0; // standard temperate climate
    const multipathOutageSecPerYear = 6e-5 * cFactor * (freqGHz / 4) * Math.pow(distanceKm, 3) * Math.pow(10, -Math.max(clearSkyFadeMarginDB, 0) / 10) * 31536000;
    const multipathAvailabilityPct = Math.min(100 - (multipathOutageSecPerYear / 31536000) * 100, 99.9999);

    // Azimuth & Elevation Angles between sites
    let trueAzimuthDeg = 0;
    let elevAngleDeg = 0;
    if (sourceSite && targetSite) {
      trueAzimuthDeg = calculateBearing(sourceSite.lat, sourceSite.lng, targetSite.lat, targetSite.lng);
      const elevDiffM = targetSite.elevation - sourceSite.elevation;
      const distM = distanceKm * 1000;
      elevAngleDeg = (Math.atan2(elevDiffM, distM) * 180) / Math.PI;
    }

    return {
      wavelengthMm,
      txDishGainDBi,
      rxDishGainDBi,
      txBeamwidthDeg,
      rxBeamwidthDeg,
      fsplDB,
      atmosphericGasLossDB,
      rainLossDB,
      eirpDBm,
      rslClearSkyDBm,
      rslFadedRainDBm,
      rxThresholdDBm,
      clearSkyFadeMarginDB,
      rainFadeMarginDB,
      netThroughputMbps,
      midFresnelRadiusM,
      mid60PercentFresnelM,
      multipathAvailabilityPct: Math.max(multipathAvailabilityPct, 90.0),
      trueAzimuthDeg,
      elevAngleDeg
    };
  }, [
    freqGHz, txPowerDBm, txDishDiameterM, rxDishDiameterM, dishEfficiency,
    txWaveguideLossDB, rxWaveguideLossDB, distanceKm, modulation,
    channelBandwidthMHz, rainRateMmHr, polarization, sourceSite, targetSite
  ]);

  // Modulation Step Performance Bar Data
  const modData = [
    { name: 'QPSK', rate: channelBandwidthMHz * 1.8 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-91.0) },
    { name: '16QAM', rate: channelBandwidthMHz * 3.6 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-84.5) },
    { name: '64QAM', rate: channelBandwidthMHz * 5.4 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-78.0) },
    { name: '128QAM', rate: channelBandwidthMHz * 6.3 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-75.0) },
    { name: '256QAM', rate: channelBandwidthMHz * 7.2 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-71.5) },
    { name: '512QAM', rate: channelBandwidthMHz * 8.1 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-68.0) },
    { name: '1024QAM', rate: channelBandwidthMHz * 9.0 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-64.5) },
    { name: '2048QAM', rate: channelBandwidthMHz * 9.9 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-61.0) },
    { name: '4096QAM', rate: channelBandwidthMHz * 10.8 * 0.92, margin: mwCalculations.rslClearSkyDBm - (-57.5) },
  ];

  const isLinkViable = mwCalculations.clearSkyFadeMarginDB >= 20;

  return (
    <div className={`p-4 md:p-6 h-full flex flex-col overflow-y-auto space-y-6 ${
      theme === 'light' ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-100'
    }`}>
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold tracking-tight">Point-to-Point Microwave Backhaul Planning</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ITU-R P.530 Path Reliability, Rain Attenuation & Parabolic Dish Link Engineering
              </p>
            </div>
          </div>
        </div>

        {/* Link Selector */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-bold uppercase text-slate-500">Backhaul Link:</label>
          <select
            value={selectedLinkId}
            onChange={e => setSelectedLinkId(e.target.value)}
            className="text-xs font-semibold p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xs focus:ring-2 focus:ring-amber-500"
          >
            {links.map(l => {
              const src = sites.find(s => s.id === l.sourceSiteId)?.name || l.sourceSiteId;
              const tgt = sites.find(s => s.id === l.targetSiteId)?.name || l.targetSiteId;
              return (
                <option key={l.id} value={l.id}>{src} ↔ {tgt} ({l.distanceKm.toFixed(1)} km)</option>
              );
            })}
          </select>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Availability */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Annual Availability</div>
          <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400">
            {mwCalculations.multipathAvailabilityPct.toFixed(4)}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            ITU-R P.530 Five-Nines
          </div>
        </div>

        {/* Clear Sky Fade Margin */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Fade Margin (Clear Sky)</div>
          <div className={`text-2xl font-mono font-bold ${
            mwCalculations.clearSkyFadeMarginDB >= 25 ? 'text-emerald-600 dark:text-emerald-400' :
            mwCalculations.clearSkyFadeMarginDB >= 15 ? 'text-amber-500' : 'text-rose-600'
          }`}>
            +{mwCalculations.clearSkyFadeMarginDB.toFixed(1)} dB
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            RSL: <b>{mwCalculations.rslClearSkyDBm.toFixed(1)} dBm</b>
          </div>
        </div>

        {/* Net Payload Capacity */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Payload Throughput</div>
          <div className="text-2xl font-mono font-bold text-blue-600 dark:text-blue-400">
            {mwCalculations.netThroughputMbps.toFixed(0)} <span className="text-sm font-normal">Mbps</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {modulation} @ {channelBandwidthMHz} MHz BW
          </div>
        </div>

        {/* Path Distance & F1 */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Hop Distance & F1 Radius</div>
          <div className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-100">
            {distanceKm.toFixed(1)} <span className="text-sm font-normal text-slate-500">km</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            60% Fresnel: <b>{mwCalculations.mid60PercentFresnelM.toFixed(1)} m</b>
          </div>
        </div>
      </div>

      {/* Main Two-Column Control & Diagnostics View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Radio & Antenna Engineering Configuration */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4 text-xs">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-2">
              <Sliders className="w-4 h-4 text-amber-500" />
              Microwave RF Parameters
            </h3>

            {/* Frequency Band */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-bold text-slate-500 uppercase text-[10px]">Carrier Frequency</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{freqGHz} GHz</span>
              </div>
              <select
                value={freqGHz}
                onChange={e => setFreqGHz(Number(e.target.value))}
                className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-semibold"
              >
                <option value="6.0">6 GHz (Long Haul Trunk - 30+ km)</option>
                <option value="7.5">7.5 GHz Band (Regional Backhaul)</option>
                <option value="8.0">8.0 GHz Band</option>
                <option value="11.0">11.0 GHz Standard Mobile Backhaul</option>
                <option value="13.0">13.0 GHz Band</option>
                <option value="15.0">15.0 GHz Band</option>
                <option value="18.0">18.0 GHz Urban Microcell</option>
                <option value="23.0">23.0 GHz Short Hop</option>
                <option value="38.0">38.0 GHz High Density Metro</option>
                <option value="80.0">80.0 GHz E-Band Multi-Gigabit (1-3 km)</option>
              </select>
            </div>

            {/* TX Power & Channel BW */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">TX Power (dBm)</label>
                <input
                  type="number"
                  step="0.5"
                  min="10"
                  max="35"
                  value={txPowerDBm}
                  onChange={e => setTxPowerDBm(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Channel BW (MHz)</label>
                <select
                  value={channelBandwidthMHz}
                  onChange={e => setChannelBandwidthMHz(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold bg-white dark:bg-slate-800"
                >
                  <option value="14">14 MHz</option>
                  <option value="28">28 MHz</option>
                  <option value="40">40 MHz</option>
                  <option value="56">56 MHz</option>
                  <option value="112">112 MHz</option>
                </select>
              </div>
            </div>

            {/* Antenna Dish Sizes */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">TX Dish Diam (m)</label>
                <select
                  value={txDishDiameterM}
                  onChange={e => setTxDishDiameterM(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800"
                >
                  <option value="0.3">0.3 m (1.0 ft)</option>
                  <option value="0.6">0.6 m (2.0 ft)</option>
                  <option value="1.2">1.2 m (4.0 ft)</option>
                  <option value="1.8">1.8 m (6.0 ft)</option>
                  <option value="2.4">2.4 m (8.0 ft)</option>
                </select>
                <span className="text-[9px] text-slate-400 mt-0.5 block font-mono">Gain: +{mwCalculations.txDishGainDBi.toFixed(1)} dBi</span>
              </div>
              <div>
                <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">RX Dish Diam (m)</label>
                <select
                  value={rxDishDiameterM}
                  onChange={e => setRxDishDiameterM(Number(e.target.value))}
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800"
                >
                  <option value="0.3">0.3 m (1.0 ft)</option>
                  <option value="0.6">0.6 m (2.0 ft)</option>
                  <option value="1.2">1.2 m (4.0 ft)</option>
                  <option value="1.8">1.8 m (6.0 ft)</option>
                  <option value="2.4">2.4 m (8.0 ft)</option>
                </select>
                <span className="text-[9px] text-slate-400 mt-0.5 block font-mono">Gain: +{mwCalculations.rxDishGainDBi.toFixed(1)} dBi</span>
              </div>
            </div>

            {/* Modulation Format */}
            <div>
              <label className="block font-bold text-slate-500 uppercase text-[10px] mb-1">Adaptive Modulation & Coding</label>
              <select
                value={modulation}
                onChange={e => setModulation(e.target.value)}
                className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-semibold bg-white dark:bg-slate-800"
              >
                <option value="QPSK">QPSK (Maximum Robustness, Lowest Sens)</option>
                <option value="16QAM">16-QAM</option>
                <option value="64QAM">64-QAM</option>
                <option value="128QAM">128-QAM</option>
                <option value="256QAM">256-QAM (Standard High-Capacity)</option>
                <option value="512QAM">512-QAM</option>
                <option value="1024QAM">1024-QAM (Very High Capacity)</option>
                <option value="2048QAM">2048-QAM</option>
                <option value="4096QAM">4096-QAM (Ultra High Density)</option>
              </select>
            </div>

            {/* Rain Attenuation Zone */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-bold text-slate-500 uppercase text-[10px]">ITU-R Rain Intensity</span>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{rainRateMmHr} mm/hr</span>
              </div>
              <input
                type="range" min="10" max="120" step="5"
                value={rainRateMmHr} onChange={e => setRainRateMmHr(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-0.5">
                <span>10 (Zone A)</span>
                <span>42 (Zone K/M)</span>
                <span>100 (Zone P - Tropical)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Center/Right Columns: Detailed Link Budget Breakdown & Chart */}
        <div className="lg:col-span-2 space-y-4">
          {/* Link Budget Detailed Table */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
            <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-blue-500" />
                Microwave Detailed Link Budget Summary
              </span>
              <span className="text-[10px] font-mono bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-bold">
                {sourceSite.name} ↔ {targetSite.name}
              </span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-slate-400 uppercase font-bold">EIRP</div>
                <div className="text-base font-mono font-bold text-slate-800 dark:text-white mt-0.5">
                  +{mwCalculations.eirpDBm.toFixed(1)} <span className="text-xs font-normal text-slate-500">dBm</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Free Space Loss</div>
                <div className="text-base font-mono font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                  -{mwCalculations.fsplDB.toFixed(1)} <span className="text-xs font-normal text-slate-500">dB</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Atmospheric & Rain</div>
                <div className="text-base font-mono font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  -{(mwCalculations.atmosphericGasLossDB + mwCalculations.rainLossDB).toFixed(1)} <span className="text-xs font-normal text-slate-500">dB</span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-[10px] text-slate-400 uppercase font-bold">RX Sensitivity</div>
                <div className="text-base font-mono font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                  {mwCalculations.rxThresholdDBm.toFixed(1)} <span className="text-xs font-normal text-slate-500">dBm</span>
                </div>
              </div>
            </div>

            {/* Dish Alignment Specifications */}
            <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span className="font-bold text-amber-800 dark:text-amber-200">Antenna Alignment Angles:</span>
              </div>
              <div className="flex items-center gap-4 font-mono text-slate-700 dark:text-slate-300">
                <span>True Azimuth: <b>{mwCalculations.trueAzimuthDeg.toFixed(1)}°</b></span>
                <span>Tilt Angle: <b>{mwCalculations.elevAngleDeg >= 0 ? `+${mwCalculations.elevAngleDeg.toFixed(2)}` : mwCalculations.elevAngleDeg.toFixed(2)}°</b></span>
                <span>3dB Beamwidth: <b>{mwCalculations.txBeamwidthDeg.toFixed(2)}°</b></span>
              </div>
            </div>
          </div>

          {/* Adaptive Modulation Capacity Step Chart */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-blue-600" />
                Capacity vs Fade Margin Across Modulations
              </h3>
              <span className="text-[10px] font-mono text-slate-400">Throughput in Mbps</span>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="M" />
                  <Tooltip
                    contentStyle={{ fontSize: '11px', borderRadius: '6px' }}
                    formatter={(val: any) => [`${Number(val).toFixed(0)} Mbps`, 'Throughput']}
                  />
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                    {modData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.name === modulation ? '#f59e0b' : entry.margin >= 15 ? '#10b981' : '#ef4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
