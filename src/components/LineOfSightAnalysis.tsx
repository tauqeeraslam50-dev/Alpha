import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  Mountain, Eye, CheckCircle2, AlertTriangle, XCircle, Compass, 
  Sliders, Activity, Download, FileText, Share2, Layers, RefreshCw,
  Radio, ArrowRight, Zap, Target, BarChart2, ChevronRight, Info, MapPin
} from 'lucide-react';
import { 
  analyzeLineOfSight, calculateRadialViewshed, LOSAnalysisResult, estimateElevation 
} from '../lib/losUtils';
import { searchOfflineLocations } from '../lib/offlineGeo';
import { 
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, 
  CartesianGrid, Tooltip as RechartsTooltip, ReferenceLine, RadarChart, 
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar 
} from 'recharts';

export function LineOfSightAnalysis() {
  const { sites, links, theme, setCurrentView } = useAppContext();

  // Active view tab
  const [activeTab, setActiveTab] = useState<'profile' | 'viewshed' | 'matrix' | 'tower'>('profile');

  // Link Selection & Mode
  const [selectedLinkId, setSelectedLinkId] = useState<string>(links[0]?.id || 'custom');
  const [selectedTxSiteId, setSelectedTxSiteId] = useState<string>(sites[0]?.id || '');
  const [selectedRxSiteId, setSelectedRxSiteId] = useState<string>(sites[1]?.id || sites[0]?.id || '');

  // Custom Coordinates Mode
  const [isCustomMode, setIsCustomMode] = useState<boolean>(links.length === 0);
  const [customTx, setCustomTx] = useState({ name: 'Tactical Base Alpha', lat: 33.6844, lng: 73.0479, elev: 508 });
  const [customRx, setCustomRx] = useState({ name: 'Hill Outpost Bravo', lat: 33.9070, lng: 73.3943, elev: 2291 });

  // Engineering Parameters
  const [txTowerHeightM, setTxTowerHeightM] = useState<number>(30);
  const [rxTowerHeightM, setRxTowerHeightM] = useState<number>(30);
  const [frequencyMHz, setFrequencyMHz] = useState<number>(155.5);
  const [kFactor, setKFactor] = useState<number>(1.333); // 4/3 earth standard
  const [clutterHeightM, setClutterHeightM] = useState<number>(0);
  const [samplePointsCount, setSamplePointsCount] = useState<number>(100);

  // Search input for custom sites
  const [searchTxQuery, setSearchTxQuery] = useState('');
  const [searchRxQuery, setSearchRxQuery] = useState('');
  const [showTxResults, setShowTxResults] = useState(false);
  const [showRxResults, setShowRxResults] = useState(false);

  // Sync parameters when link is selected from dropdown
  const handleLinkSelect = (linkId: string) => {
    setSelectedLinkId(linkId);
    if (linkId === 'custom') {
      setIsCustomMode(true);
      return;
    }
    setIsCustomMode(false);
    const link = links.find(l => l.id === linkId);
    if (link) {
      setSelectedTxSiteId(link.sourceSiteId);
      setSelectedRxSiteId(link.targetSiteId);
      if (link.frequencyMHz) setFrequencyMHz(link.frequencyMHz);
    }
  };

  // Determine TX and RX Sites
  const currentTxSite = useMemo(() => {
    if (isCustomMode) return customTx;
    const site = sites.find(s => s.id === selectedTxSiteId) || sites[0];
    return site ? { name: site.name, lat: site.lat, lng: site.lng, elev: site.elevation } : customTx;
  }, [isCustomMode, selectedTxSiteId, sites, customTx]);

  const currentRxSite = useMemo(() => {
    if (isCustomMode) return customRx;
    const site = sites.find(s => s.id === selectedRxSiteId) || sites[1] || sites[0];
    return site ? { name: site.name, lat: site.lat, lng: site.lng, elev: site.elevation } : customRx;
  }, [isCustomMode, selectedRxSiteId, sites, customRx]);

  // Execute Core Line-of-Sight & Fresnel Analysis
  const losAnalysis = useMemo<LOSAnalysisResult>(() => {
    return analyzeLineOfSight({
      txLat: currentTxSite.lat,
      txLng: currentTxSite.lng,
      txElevationM: currentTxSite.elev,
      txTowerHeightM,
      txName: currentTxSite.name,
      
      rxLat: currentRxSite.lat,
      rxLng: currentRxSite.lng,
      rxElevationM: currentRxSite.elev,
      rxTowerHeightM,
      rxName: currentRxSite.name,
      
      frequencyMHz,
      kFactor,
      clutterHeightM,
      samplePointsCount
    });
  }, [currentTxSite, currentRxSite, txTowerHeightM, rxTowerHeightM, frequencyMHz, kFactor, clutterHeightM, samplePointsCount]);

  // Execute 360° Viewshed analysis for TX site
  const viewshedData = useMemo(() => {
    return calculateRadialViewshed(
      currentTxSite.lat,
      currentTxSite.lng,
      txTowerHeightM,
      2, // target at 2m height (manpack/mobile)
      frequencyMHz,
      losAnalysis.distanceKm > 0 ? Math.max(losAnalysis.distanceKm * 1.3, 30) : 40,
      10 // 10 degree steps (36 radials)
    );
  }, [currentTxSite, txTowerHeightM, frequencyMHz, losAnalysis.distanceKm]);

  // Multi-Site Network Clearance Matrix
  const networkMatrix = useMemo(() => {
    if (sites.length < 2) return [];
    const matrix: Array<{
      id: string;
      source: string;
      target: string;
      distanceKm: number;
      status: 'CLEAR' | 'MARGINAL' | 'OBSTRUCTED';
      clearanceM: number;
      diffractionLossDB: number;
      sourceId: string;
      targetId: string;
    }> = [];

    for (let i = 0; i < sites.length; i++) {
      for (let j = i + 1; j < sites.length; j++) {
        const s1 = sites[i];
        const s2 = sites[j];
        const res = analyzeLineOfSight({
          txLat: s1.lat,
          txLng: s1.lng,
          txElevationM: s1.elevation,
          txTowerHeightM: 30,
          rxLat: s2.lat,
          rxLng: s2.lng,
          rxElevationM: s2.elevation,
          rxTowerHeightM: 30,
          frequencyMHz,
          kFactor,
          clutterHeightM,
          samplePointsCount: 40
        });

        matrix.push({
          id: `${s1.id}-${s2.id}`,
          source: s1.name,
          target: s2.name,
          distanceKm: res.distanceKm,
          status: res.status,
          clearanceM: res.worstPoint.clearanceM,
          diffractionLossDB: res.diffractionLossDB,
          sourceId: s1.id,
          targetId: s2.id
        });
      }
    }
    return matrix;
  }, [sites, frequencyMHz, kFactor, clutterHeightM]);

  // Apply Recommended Tower Heights
  const applyRecommendedHeights = () => {
    if (losAnalysis.optimization) {
      setTxTowerHeightM(losAnalysis.optimization.recommendedTxTowerM);
      setRxTowerHeightM(losAnalysis.optimization.recommendedRxTowerM);
    }
  };

  // Export Detailed CSV Dossier
  const exportDossierCSV = () => {
    const rows = [
      ['LINE OF SIGHT (LOS) & PATH PROFILE DOSSIER'],
      ['Analysis Timestamp', new Date().toISOString()],
      ['Status', losAnalysis.status],
      ['Distance (km)', losAnalysis.distanceKm],
      ['Azimuth / Bearing (deg)', losAnalysis.bearingDeg],
      ['Operating Frequency (MHz)', losAnalysis.frequencyMHz],
      ['Atmospheric K-Factor', losAnalysis.kFactor],
      ['Clutter Height (m)', losAnalysis.clutterHeightM],
      [],
      ['TRANSMITTER (TX) SITE'],
      ['Name', losAnalysis.txSite.name],
      ['Latitude', losAnalysis.txSite.lat],
      ['Longitude', losAnalysis.txSite.lng],
      ['Ground Elevation (m)', losAnalysis.txSite.groundElevationM],
      ['Tower Height (m)', losAnalysis.txSite.towerHeightM],
      ['Total Antenna Altitude (m)', losAnalysis.txSite.totalElevationM],
      [],
      ['RECEIVER (RX) SITE'],
      ['Name', losAnalysis.rxSite.name],
      ['Latitude', losAnalysis.rxSite.lat],
      ['Longitude', losAnalysis.rxSite.lng],
      ['Ground Elevation (m)', losAnalysis.rxSite.groundElevationM],
      ['Tower Height (m)', losAnalysis.rxSite.towerHeightM],
      ['Total Antenna Altitude (m)', losAnalysis.rxSite.totalElevationM],
      [],
      ['CLEARANCE & PROPAGATION TELEMETRY'],
      ['Minimum Clearance (m)', losAnalysis.worstPoint.clearanceM],
      ['Clearance Percentage (1st Fresnel)', `${losAnalysis.worstPoint.clearancePercentF1}%`],
      ['Worst Obstacle Distance from TX (km)', losAnalysis.worstPoint.distanceKm],
      ['Worst Obstacle Elevation (m)', losAnalysis.worstPoint.obstacleElevationM],
      ['Max Earth Bulge at Midpoint (m)', losAnalysis.maxEarthBulgeM],
      ['Max Fresnel Radius at Midpoint (m)', losAnalysis.maxFresnelRadiusM],
      ['Optical Horizon (km)', losAnalysis.opticalHorizonKm],
      ['Radio Horizon (km)', losAnalysis.radioHorizonKm],
      ['Free Space Path Loss (dB)', losAnalysis.fsplDB],
      ['Knife-Edge Diffraction Loss (dB)', losAnalysis.diffractionLossDB],
      ['Total Calculated Path Loss (dB)', losAnalysis.totalPathLossDB],
      [],
      ['SAMPLE POINTS ELEVATION PROFILE'],
      ['Distance (km)', 'Latitude', 'Longitude', 'Ground Elev (m)', 'Earth Bulge (m)', 'Effective Obstacle (m)', 'LOS Ray Elev (m)', 'Fresnel-1 Radius (m)', 'Clearance (m)', 'Optical Obstructed', '60% Fresnel Obstructed']
    ];

    losAnalysis.pathPoints.forEach(p => {
      rows.push([
        p.distanceKm.toString(),
        p.lat.toFixed(6),
        p.lng.toFixed(6),
        p.groundElevationM.toString(),
        p.earthBulgeM.toString(),
        p.effectiveObstacleElevationM.toString(),
        p.losRayElevationM.toString(),
        p.fresnelRadius1M.toString(),
        p.clearanceM.toString(),
        p.isObstructedOptical ? 'YES' : 'NO',
        p.isObstructedFresnel60 ? 'YES' : 'NO'
      ]);
    });

    const csvContent = rows.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `LOS_Analysis_${losAnalysis.txSite.name.replace(/\s+/g, '_')}_to_${losAnalysis.rxSite.name.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 sm:p-6 h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-sm">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                Line of Sight (LOS) Analysis
                <span className="text-[11px] px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-mono font-bold rounded">
                  ITU-R P.526
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Topographic path profiling, Earth curvature (K-factor), 1st Fresnel zone clearance & Knife-edge diffraction.
              </p>
            </div>
          </div>
        </div>

        {/* View Tabs & Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-slate-200/80 dark:bg-slate-800 p-1 rounded-lg flex items-center text-xs font-semibold">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'profile'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Path Profile
            </button>
            <button
              onClick={() => setActiveTab('tower')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'tower'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Tower Analysis
            </button>
            <button
              onClick={() => setActiveTab('viewshed')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'viewshed'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              360° Viewshed Radar
            </button>
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-3 py-1.5 rounded-md transition ${
                activeTab === 'matrix'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Network Matrix ({sites.length} Sites)
            </button>
          </div>

          <button
            onClick={exportDossierCSV}
            className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg shadow-xs transition flex items-center gap-1.5"
            title="Download full engineering CSV dossier"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Export Dossier</span>
          </button>
        </div>
      </div>

      {/* Main Content Layout */}
      {activeTab === 'profile' && (
        <div className="flex flex-col gap-6">
          {/* Top Control Bar: Link / Station Selector & Presets */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase">Target Path:</span>
                <select
                  value={isCustomMode ? 'custom' : selectedLinkId}
                  onChange={(e) => handleLinkSelect(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-lg p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {links.map(l => {
                    const s = sites.find(site => site.id === l.sourceSiteId)?.name;
                    const t = sites.find(site => site.id === l.targetSiteId)?.name;
                    return <option key={l.id} value={l.id}>Link: {s} ↔ {t} ({l.distanceKm} km)</option>;
                  })}
                  <option value="custom">-- Custom Site / Coordinate Pair --</option>
                </select>
              </div>

              {isCustomMode && (
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-slate-400">TX:</span>
                  <input 
                    type="text"
                    value={customTx.name}
                    onChange={(e) => setCustomTx(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="TX Name"
                    className="p-1.5 border border-slate-300 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-36 text-xs"
                  />
                  <span className="text-slate-400">RX:</span>
                  <input 
                    type="text"
                    value={customRx.name}
                    onChange={(e) => setCustomRx(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="RX Name"
                    className="p-1.5 border border-slate-300 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 w-36 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Quick Frequency Presets */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase text-slate-400">Band Presets:</span>
              <button 
                onClick={() => setFrequencyMHz(155.5)}
                className={`px-2 py-1 text-[11px] font-semibold rounded border transition ${
                  frequencyMHz === 155.5 
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300 font-bold' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                VHF (155 MHz)
              </button>
              <button 
                onClick={() => setFrequencyMHz(450.0)}
                className={`px-2 py-1 text-[11px] font-semibold rounded border transition ${
                  frequencyMHz === 450.0 
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300 font-bold' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                UHF (450 MHz)
              </button>
              <button 
                onClick={() => setFrequencyMHz(2400.0)}
                className={`px-2 py-1 text-[11px] font-semibold rounded border transition ${
                  frequencyMHz === 2400.0 
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300 font-bold' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                ISM (2.4 GHz)
              </button>
              <button 
                onClick={() => setFrequencyMHz(11000.0)}
                className={`px-2 py-1 text-[11px] font-semibold rounded border transition ${
                  frequencyMHz === 11000.0 
                    ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 text-blue-700 dark:text-blue-300 font-bold' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                Microwave (11 GHz)
              </button>
            </div>
          </div>

          {/* Status & Recommendation Banner */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
            losAnalysis.status === 'CLEAR' 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
              : losAnalysis.status === 'MARGINAL'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-100'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
          }`}>
            <div className="flex items-start gap-3.5">
              {losAnalysis.status === 'CLEAR' && <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />}
              {losAnalysis.status === 'MARGINAL' && <AlertTriangle className="w-7 h-7 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />}
              {losAnalysis.status === 'OBSTRUCTED' && <XCircle className="w-7 h-7 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />}

              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    losAnalysis.status === 'CLEAR'
                      ? 'bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
                      : losAnalysis.status === 'MARGINAL'
                      ? 'bg-amber-200 dark:bg-amber-900 text-amber-800 dark:text-amber-200'
                      : 'bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200'
                  }`}>
                    {losAnalysis.status === 'CLEAR' ? 'CLEAR LINE OF SIGHT' : losAnalysis.status === 'MARGINAL' ? 'MARGINAL CLEARANCE (GRAZING)' : 'OBSTRUCTED PATH (NON-LOS)'}
                  </span>
                  <span className="text-xs font-bold font-mono">
                    Min Clearance: {losAnalysis.worstPoint.clearanceM > 0 ? `+${losAnalysis.worstPoint.clearanceM}m` : `${losAnalysis.worstPoint.clearanceM}m`} ({losAnalysis.worstPoint.clearancePercentF1}% of F₁)
                  </span>
                </div>
                <p className="text-xs mt-1 opacity-90">
                  {losAnalysis.optimization.message} (Worst obstruction at <strong>{losAnalysis.worstPoint.distanceKm} km</strong> from {losAnalysis.txSite.name}).
                </p>
              </div>
            </div>

          </div>

          {/* KPI Dashboard Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Distance</span>
              <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100 mt-1">
                {losAnalysis.distanceKm} <span className="text-xs font-normal text-slate-400">km</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Bearing: {losAnalysis.bearingDeg}°</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Radio Horizon</span>
              <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 mt-1">
                {losAnalysis.radioHorizonKm} <span className="text-xs font-normal text-slate-400">km</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Optical: {losAnalysis.opticalHorizonKm} km</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Max Fresnel (F₁)</span>
              <div className="text-lg font-bold font-mono text-amber-600 dark:text-amber-400 mt-1">
                {losAnalysis.maxFresnelRadiusM} <span className="text-xs font-normal text-slate-400">m</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">60% F₁: {(losAnalysis.maxFresnelRadiusM * 0.6).toFixed(1)} m</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Earth Bulge</span>
              <div className="text-lg font-bold font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                {losAnalysis.maxEarthBulgeM} <span className="text-xs font-normal text-slate-400">m</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">K-factor: {kFactor}</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Diffraction Loss</span>
              <div className={`text-lg font-bold font-mono mt-1 ${
                losAnalysis.diffractionLossDB > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {losAnalysis.diffractionLossDB} <span className="text-xs font-normal text-slate-400">dB</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">FSPL: {losAnalysis.fsplDB} dB</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-[10px] font-bold uppercase text-slate-400">Total Path Loss</span>
              <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-100 mt-1">
                {losAnalysis.totalPathLossDB} <span className="text-xs font-normal text-slate-400">dB</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Freq: {losAnalysis.frequencyMHz} MHz</div>
            </div>
          </div>

          {/* Interactive 2D Terrain & Ray-Tracing Canvas */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 flex flex-col">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <Mountain className="w-4 h-4 text-blue-600" />
                  Topographic Path Cross-Section & Fresnel Ellipsoid
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Raypath: {losAnalysis.txSite.name} ({losAnalysis.txSite.groundElevationM}m + {losAnalysis.txSite.towerHeightM}m) ➔ {losAnalysis.rxSite.name} ({losAnalysis.rxSite.groundElevationM}m + {losAnalysis.rxSite.towerHeightM}m)
                </p>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center gap-3 text-[11px] font-semibold flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-2 bg-slate-400 rounded-xs"></div>
                  <span className="text-slate-600 dark:text-slate-300">Terrain</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 bg-amber-500"></div>
                  <span className="text-amber-600 dark:text-amber-400">60% Fresnel Zone</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-3 h-0.5 ${losAnalysis.status === 'CLEAR' ? 'bg-emerald-500' : losAnalysis.status === 'MARGINAL' ? 'bg-amber-500' : 'bg-rose-500'}`}></div>
                  <span className="text-slate-700 dark:text-slate-200">Optical LOS Ray</span>
                </div>
              </div>
            </div>

            {/* Recharts Area Profile */}
            <div className="h-80 sm:h-96 w-full relative bg-slate-50/70 dark:bg-slate-950/40 rounded-lg p-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={losAnalysis.pathPoints} margin={{ top: 25, right: 30, left: 10, bottom: 10 }}>
                  <defs>
                    <linearGradient id="terrainFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.7} />
                      <stop offset="95%" stopColor="#475569" stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="fresnelFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" className="dark:stroke-slate-800" vertical={false} />
                  
                  <XAxis 
                    dataKey="distanceKm" 
                    unit=" km" 
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    stroke="#94a3b8"
                  />
                  <YAxis 
                    unit=" m" 
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    stroke="#94a3b8"
                  />

                  <RechartsTooltip 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur p-3 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 text-xs font-sans space-y-1">
                            <div className="font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-1">
                              Distance: {data.distanceKm} km from TX
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 text-[11px]">
                              <span className="text-slate-500">Ground Elevation:</span>
                              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{data.groundElevationM} m</span>
                              
                              <span className="text-slate-500">Earth Bulge:</span>
                              <span className="font-mono text-indigo-600 dark:text-indigo-400">+{data.earthBulgeM} m</span>
                              
                              <span className="text-slate-500">Obstacle Altitude:</span>
                              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{data.effectiveObstacleElevationM} m</span>

                              <span className="text-slate-500">LOS Ray Altitude:</span>
                              <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{data.losRayElevationM} m</span>

                              <span className="text-slate-500">Fresnel-1 Radius:</span>
                              <span className="font-mono text-sky-600 dark:text-sky-400">±{data.fresnelRadius1M} m</span>

                              <span className="text-slate-500">Clearance:</span>
                              <span className={`font-mono font-bold ${data.clearanceM >= data.fresnelRadius60M ? 'text-emerald-600' : data.clearanceM >= 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                                {data.clearanceM > 0 ? `+${data.clearanceM}m` : `${data.clearanceM}m`} ({data.clearancePercentF1}%)
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {/* 1. Terrain Area */}
                  <Area 
                    type="monotone" 
                    dataKey="effectiveObstacleElevationM" 
                    stroke="#475569" 
                    fill="url(#terrainFill)" 
                    name="Effective Terrain & Clutter" 
                  />

                  {/* 2. Fresnel Zone 100% Upper & Lower Bounds */}
                  <Line 
                    type="monotone" 
                    dataKey="fresnelUpperM" 
                    stroke="#38bdf8" 
                    strokeDasharray="4 4" 
                    strokeWidth={1}
                    dot={false}
                    name="Fresnel 100% Upper"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="fresnelLowerM" 
                    stroke="#38bdf8" 
                    strokeDasharray="4 4" 
                    strokeWidth={1}
                    dot={false}
                    name="Fresnel 100% Lower"
                  />

                  {/* 3. 60% Fresnel Zone Clearance Boundary */}
                  <Line 
                    type="monotone" 
                    dataKey="fresnel60LowerM" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={false}
                    name="60% Fresnel Critical Boundary"
                  />

                  {/* 4. Direct Optical Line of Sight Ray */}
                  <Line 
                    type="monotone" 
                    dataKey="losRayElevationM" 
                    stroke={losAnalysis.status === 'CLEAR' ? '#10b981' : losAnalysis.status === 'MARGINAL' ? '#f59e0b' : '#ef4444'} 
                    strokeWidth={2.5}
                    dot={false}
                    name="Optical Line of Sight Ray"
                  />

                  {/* Reference line for worst obstruction point */}
                  <ReferenceLine 
                    x={losAnalysis.worstPoint.distanceKm} 
                    stroke="#ef4444" 
                    strokeDasharray="3 3"
                    label={{ 
                      value: `Critical Peak (${losAnalysis.worstPoint.distanceKm}km)`, 
                      fill: '#ef4444', 
                      fontSize: 10,
                      position: 'top' 
                    }} 
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Tuning Controls (Tower heights, K-factor, clutter) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* TX Tower Slider */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-blue-600" />
                  TX Tower Height ({losAnalysis.txSite.name.slice(0, 14)})
                </span>
                <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded">
                  {txTowerHeightM} m
                </span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="120" 
                value={txTowerHeightM} 
                onChange={(e) => setTxTowerHeightM(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>1 m</span>
                <span>Ground: {losAnalysis.txSite.groundElevationM}m</span>
                <span>120 m</span>
              </div>
            </div>

            {/* RX Tower Slider */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-600" />
                  RX Tower Height ({losAnalysis.rxSite.name.slice(0, 14)})
                </span>
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded">
                  {rxTowerHeightM} m
                </span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="120" 
                value={rxTowerHeightM} 
                onChange={(e) => setRxTowerHeightM(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                <span>1 m</span>
                <span>Ground: {losAnalysis.rxSite.groundElevationM}m</span>
                <span>120 m</span>
              </div>
            </div>

            {/* Refraction K-Factor */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                Earth Curvature K-Factor
              </label>
              <select
                value={kFactor}
                onChange={(e) => setKFactor(Number(e.target.value))}
                className="w-full text-xs font-bold p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 outline-none"
              >
                <option value={1.333}>K = 1.333 (4/3 Standard Atmosphere)</option>
                <option value={1.0}>K = 1.000 (True Geometric Earth)</option>
                <option value={0.667}>K = 0.667 (2/3 Sub-refraction / Ducting)</option>
                <option value={2.0}>K = 2.000 (Super-refraction / Inversion)</option>
              </select>
              <div className="text-[10px] text-slate-400 mt-1.5">
                Controls optical vs radio ray bending curvature
              </div>
            </div>

            {/* Environmental Clutter Height */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">
                Tree / Clutter Canopy
              </label>
              <select
                value={clutterHeightM}
                onChange={(e) => setClutterHeightM(Number(e.target.value))}
                className="w-full text-xs font-bold p-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 outline-none"
              >
                <option value={0}>0m (Open Plain / Bare Rock)</option>
                <option value={10}>10m (Light Vegetation / Sparse Trees)</option>
                <option value={18}>18m (Dense Pine / Hill Forest)</option>
                <option value={25}>25m (Urban Buildings & Clutter)</option>
              </select>
              <div className="text-[10px] text-slate-400 mt-1.5">
                Adds surface obstacle allowance over raw DEM
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tower Recommendation Tab */}
      {activeTab === 'tower' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Radio className="w-4 h-4 text-indigo-600" />
                  Tower Height Optimization
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Automatic recommendation for optimal tower heights to clear terrain obstructions and 60% of the first Fresnel zone.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                losAnalysis.optimization.isOptimal 
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-900'
                  : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-900'
              }`}>
                <div className="flex items-start gap-3">
                  {losAnalysis.optimization.isOptimal ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                  )}
                  <div>
                    <div className="text-sm font-bold">
                      {losAnalysis.optimization.isOptimal ? 'Current Heights are Optimal' : 'Tower Adjustments Recommended'}
                    </div>
                    <div className="text-xs mt-1">
                      {losAnalysis.optimization.message}
                    </div>
                  </div>
                </div>

                {!losAnalysis.optimization.isOptimal && (
                  <button
                    onClick={applyRecommendedHeights}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-2 flex-shrink-0"
                  >
                    <Sliders className="w-4 h-4" />
                    Apply Recommended Heights
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">TX Site: {losAnalysis.txSite.name}</div>
                  <div className="text-3xl font-mono font-bold text-slate-800 dark:text-slate-100">
                    {losAnalysis.optimization.recommendedTxTowerM} <span className="text-sm font-normal text-slate-500">m</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Recommended Tower Height</div>
                  <div className="text-xs text-slate-500 font-medium mt-2">Current: {txTowerHeightM} m</div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-center">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">RX Site: {losAnalysis.rxSite.name}</div>
                  <div className="text-3xl font-mono font-bold text-slate-800 dark:text-slate-100">
                    {losAnalysis.optimization.recommendedRxTowerM} <span className="text-sm font-normal text-slate-500">m</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">Recommended Tower Height</div>
                  <div className="text-xs text-slate-500 font-medium mt-2">Current: {rxTowerHeightM} m</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 360° Radial Viewshed Tab */}
      {activeTab === 'viewshed' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Compass className="w-4 h-4 text-blue-600" />
                  360° Radial Line-of-Sight & Horizon Scanner
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Evaluates radial optical/radio horizons and terrain shadow sectors at 10° azimuth intervals around <strong>{losAnalysis.txSite.name}</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-bold uppercase">Tower:</span>
                <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-mono font-bold text-xs rounded border border-blue-200 dark:border-blue-800">
                  {txTowerHeightM} m
                </span>
              </div>
            </div>

            {/* Viewshed Radar Polar Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              <div className="lg:col-span-2 h-96 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={viewshedData}>
                    <PolarGrid stroke="#cbd5e1" className="dark:stroke-slate-800" />
                    <PolarAngleAxis 
                      dataKey="azimuthDeg" 
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      unit="°"
                    />
                    <PolarRadiusAxis 
                      angle={30} 
                      domain={[0, 'auto']} 
                      unit=" km"
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                    />
                    <Radar 
                      name="Max LOS Horizon" 
                      dataKey="maxLOSDistanceKm" 
                      stroke="#2563eb" 
                      fill="#3b82f6" 
                      fillOpacity={0.4} 
                    />
                    <RechartsTooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Radial Statistics Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4 text-xs">
                <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                  Viewshed Coverage Metrics
                </h4>

                <div className="space-y-2">
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500">Peak Horizon Distance:</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {Math.max(...viewshedData.map(v => v.maxLOSDistanceKm))} km
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500">Minimum Shadow Distance:</span>
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      {Math.min(...viewshedData.map(v => v.maxLOSDistanceKm))} km
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-500">Mean Optical Horizon:</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {(viewshedData.reduce((acc, v) => acc + v.maxLOSDistanceKm, 0) / viewshedData.length).toFixed(1)} km
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Unobstructed Radial Sectors:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {viewshedData.filter(v => v.horizonType === 'curvature').length} / {viewshedData.length}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300">
                  💡 <strong>Tactical Tip:</strong> In mountainous terrain like Murree and Margalla, elevating the tower from 30m to 45m expands radial sightlines across the northern passes by up to <strong>35%</strong>.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Network Matrix Tab */}
      {activeTab === 'matrix' && (
        <div className="flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  All-Pair Line of Sight Viability Matrix
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Calculates topographic clearance and knife-edge diffraction loss across all {sites.length} nodes in the network.
                </p>
              </div>

              <div className="text-xs font-mono font-bold text-slate-400">
                {networkMatrix.length} Link Combinations
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-y border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Link Path</th>
                    <th className="py-2.5 px-3">Distance</th>
                    <th className="py-2.5 px-3">LOS Status</th>
                    <th className="py-2.5 px-3">Worst Clearance</th>
                    <th className="py-2.5 px-3">Diffraction Loss</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {networkMatrix.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200">
                        {item.source} <span className="text-slate-400 mx-1">↔</span> {item.target}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-slate-600 dark:text-slate-300">
                        {item.distanceKm} km
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${
                          item.status === 'CLEAR'
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                            : item.status === 'MARGINAL'
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                            : 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        <span className={item.clearanceM >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                          {item.clearanceM > 0 ? `+${item.clearanceM}m` : `${item.clearanceM}m`}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono">
                        {item.diffractionLossDB > 0 ? (
                          <span className="text-rose-600 font-bold">-{item.diffractionLossDB} dB</span>
                        ) : (
                          <span className="text-emerald-600 font-bold">0.0 dB</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => {
                            setSelectedTxSiteId(item.sourceId);
                            setSelectedRxSiteId(item.targetId);
                            setIsCustomMode(false);
                            setActiveTab('profile');
                          }}
                          className="px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 rounded transition"
                        >
                          Analyze Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
