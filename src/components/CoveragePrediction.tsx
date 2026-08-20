import React, { useState, useEffect, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  MapContainer, TileLayer, Marker, Popup, Circle, Polygon, Polyline, useMap, useMapEvents 
} from 'react-leaflet';
import { 
  Wifi, Target, Activity, Radio, Info, Eye, Layers, Compass, 
  MapPin, Download, ChevronRight, Zap, Shield, Sparkles, Navigation,
  BarChart2, RefreshCw, Sliders, CheckCircle2, AlertTriangle, XCircle
} from 'lucide-react';
import { 
  calculateRealisticRange, calculateRadioHorizon, 
  calculateRSSIAtDistance, calculatePathLossAtDistance,
  calculateDistanceKm, calculateBearing, calculateDestinationPoint
} from '../lib/utils';
import { 
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, 
  ReferenceLine, CartesianGrid 
} from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const BaseStationIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [26, 42],
  iconAnchor: [13, 42],
  popupAnchor: [0, -38],
});

const RepeaterIcon = L.divIcon({
  html: `<div style="background-color: #f59e0b; width: 26px; height: 26px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 13px;">R</div>`,
  className: 'custom-repeater-pin',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  popupAnchor: [0, -15],
});

const ProbeIcon = L.divIcon({
  html: `<div style="background-color: #ec4899; width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 0 12px rgba(236,72,153,0.8); display: flex; align-items: center; justify-content: center; color: white; font-size: 11px;">📍</div>`,
  className: 'custom-probe-pin',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  popupAnchor: [0, -12],
});

// Component to handle map clicks for the RF Test Probe
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Component to adjust map bounds to fit site
function MapPanner({ lat, lng }: { lat: number, lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 11);
  }, [lat, lng, map]);
  return null;
}

export function CoveragePrediction() {
  const { sites, theme } = useAppContext();
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites.length > 0 ? sites[0].id : '');
  
  // RF Engine Parameters
  const [frequency, setFrequency] = useState<number>(155.5);
  const [txPowerW, setTxPowerW] = useState<number>(50);
  const [txGain, setTxGain] = useState<number>(6);
  const [txAntennaHeight, setTxAntennaHeight] = useState<number>(30); // Tower height (m)
  const [rxAntennaHeight, setRxAntennaHeight] = useState<number>(2); // Mobile/handheld height (m)
  const [rxSens, setRxSens] = useState<number>(-105);
  const [environment, setEnvironment] = useState<string>('suburban');

  // Antenna Radiation & Sector Pattern
  const [antennaPattern, setAntennaPattern] = useState<'omni' | 'directional'>('omni');
  const [azimuthDeg, setAzimuthDeg] = useState<number>(90);
  const [beamwidthDeg, setBeamwidthDeg] = useState<number>(90);
  const [frontToBackDB, setFrontToBackDB] = useState<number>(18);

  // Display & Layer Controls
  const [viewMode, setViewMode] = useState<'contours' | 'heatmap' | 'multi-site'>('contours');
  const [mapTileStyle, setMapTileStyle] = useState<'osm' | 'satellite' | 'topo' | 'light' | 'dark'>('osm');
  const [showHorizon, setShowHorizon] = useState<boolean>(true);
  const [showProbe, setShowProbe] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'parameters' | 'antenna' | 'probe' | 'analysis'>('parameters');

  // Interactive Test Probe (Field Receiver)
  const [probeLocation, setProbeLocation] = useState<{ lat: number; lng: number } | null>(null);

  const selectedSite = sites.find(s => s.id === selectedSiteId) || sites[0];

  // Auto-populate initial defaults when site selection changes
  useEffect(() => {
    if (selectedSite) {
      if (selectedSite.txPowerW) setTxPowerW(selectedSite.txPowerW);
      if (selectedSite.txFreqMHz) setFrequency(selectedSite.txFreqMHz);
      
      if (selectedSite.type === 'repeater') {
        setTxAntennaHeight(45);
        setTxGain(6);
      } else if (selectedSite.radioType === 'base') {
        setTxAntennaHeight(30);
        setTxGain(6);
      } else if (selectedSite.radioType === 'vehicular') {
        setTxAntennaHeight(2);
        setTxGain(3);
      } else if (selectedSite.radioType === 'walkie-talkie') {
        setTxAntennaHeight(1.5);
        setTxGain(0);
      }

      // Default probe location slightly offset from transmitter
      if (!probeLocation) {
        const offset = calculateDestinationPoint(selectedSite.lat, selectedSite.lng, 8.5, 45);
        setProbeLocation(offset);
      }
    }
  }, [selectedSiteId]);

  // Conversion
  const txPowerDBm = txPowerW > 0 ? 10 * Math.log10(txPowerW * 1000) : 0;
  const rxGain = rxAntennaHeight <= 2 ? 0 : 2;

  // Calculate standard communication boundaries
  const edgeResult = useMemo(() => calculateRealisticRange({
    txPowerDBm,
    txGainDBi: txGain,
    rxGainDBi: rxGain,
    txLossDB: 1.5,
    rxLossDB: 0.5,
    rxSensDBm: rxSens,
    fadeMarginDB: 0,
    freqMHz: frequency,
    ht_m: txAntennaHeight,
    hr_m: rxAntennaHeight,
    environment
  }), [txPowerDBm, txGain, rxGain, rxSens, frequency, txAntennaHeight, rxAntennaHeight, environment]);

  const goodResult = useMemo(() => calculateRealisticRange({
    txPowerDBm,
    txGainDBi: txGain,
    rxGainDBi: rxGain,
    txLossDB: 1.5,
    rxLossDB: 0.5,
    rxSensDBm: rxSens,
    fadeMarginDB: 10,
    freqMHz: frequency,
    ht_m: txAntennaHeight,
    hr_m: rxAntennaHeight,
    environment
  }), [txPowerDBm, txGain, rxGain, rxSens, frequency, txAntennaHeight, rxAntennaHeight, environment]);

  const strongResult = useMemo(() => calculateRealisticRange({
    txPowerDBm,
    txGainDBi: txGain,
    rxGainDBi: rxGain,
    txLossDB: 1.5,
    rxLossDB: 0.5,
    rxSensDBm: rxSens,
    fadeMarginDB: 20,
    freqMHz: frequency,
    ht_m: txAntennaHeight,
    hr_m: rxAntennaHeight,
    environment
  }), [txPowerDBm, txGain, rxGain, rxSens, frequency, txAntennaHeight, rxAntennaHeight, environment]);

  const radiusEdge = edgeResult.maxRangeKm;
  const radiusGood = goodResult.reliableRangeKm;
  const radiusStrong = strongResult.reliableRangeKm;
  const radioHorizon = calculateRadioHorizon(txAntennaHeight, rxAntennaHeight);

  // Area Calculations (km²)
  const areaStrongKm2 = Math.PI * Math.pow(radiusStrong, 2);
  const areaGoodKm2 = Math.PI * Math.pow(radiusGood, 2);
  const areaMaxKm2 = Math.PI * Math.pow(radiusEdge, 2);

  // Compute Probe Diagnostics
  const probeData = useMemo(() => {
    if (!selectedSite || !probeLocation) return null;

    const distanceKm = calculateDistanceKm(
      selectedSite.lat, selectedSite.lng,
      probeLocation.lat, probeLocation.lng
    );

    const bearing = calculateBearing(
      selectedSite.lat, selectedSite.lng,
      probeLocation.lat, probeLocation.lng
    );

    // Calculate antenna directivity factor if directional
    let patternLoss = 0;
    if (antennaPattern === 'directional') {
      const angleDiff = Math.abs((bearing - azimuthDeg + 540) % 360 - 180);
      const halfBeam = beamwidthDeg / 2;
      if (angleDiff > halfBeam) {
        // Off-boresight attenuation
        const excess = angleDiff - halfBeam;
        patternLoss = Math.min(frontToBackDB, (excess / (180 - halfBeam)) * frontToBackDB);
      }
    }

    const pathLoss = calculatePathLossAtDistance(
      distanceKm, frequency, txAntennaHeight, rxAntennaHeight, environment
    );

    const rssiDBm = calculateRSSIAtDistance(
      distanceKm, txPowerDBm, txGain, rxGain, 1.5, 0.5,
      frequency, txAntennaHeight, rxAntennaHeight, environment
    ) - patternLoss;

    const marginDB = rssiDBm - rxSens;
    const isLOS = distanceKm <= radioHorizon;

    let quality: 'excellent' | 'good' | 'fair' | 'marginal' | 'unreachable' = 'unreachable';
    let qualityStars = 0;

    if (marginDB >= 20) {
      quality = 'excellent';
      qualityStars = 5;
    } else if (marginDB >= 10) {
      quality = 'good';
      qualityStars = 4;
    } else if (marginDB >= 5) {
      quality = 'fair';
      qualityStars = 3;
    } else if (marginDB >= 0) {
      quality = 'marginal';
      qualityStars = 2;
    } else {
      quality = 'unreachable';
      qualityStars = 0;
    }

    return {
      distanceKm,
      bearing,
      pathLoss,
      rssiDBm,
      marginDB,
      isLOS,
      quality,
      qualityStars
    };
  }, [
    selectedSite, probeLocation, frequency, txPowerDBm, txGain, rxGain,
    txAntennaHeight, rxAntennaHeight, environment, rxSens,
    antennaPattern, azimuthDeg, beamwidthDeg, frontToBackDB, radioHorizon
  ]);

  // Signal Profile Chart Data
  const chartData = useMemo(() => {
    const data = [];
    const maxD = Math.max(radiusEdge * 1.25, 25);
    const step = maxD / 35;

    for (let d = 0.5; d <= maxD; d += step) {
      const dist = Number(d.toFixed(1));
      const rssi = calculateRSSIAtDistance(
        dist, txPowerDBm, txGain, rxGain, 1.5, 0.5,
        frequency, txAntennaHeight, rxAntennaHeight, environment
      );
      data.push({
        distance: dist,
        rssi: Number(rssi.toFixed(1)),
        sensitivity: rxSens,
        reliableThreshold: rxSens + 10,
        strongThreshold: rxSens + 20,
      });
    }
    return data;
  }, [txPowerDBm, txGain, rxGain, frequency, txAntennaHeight, rxAntennaHeight, environment, rxSens, radiusEdge]);

  // Directional Sector Polygon Generator
  const sectorPolygonCoords = useMemo(() => {
    if (antennaPattern !== 'directional' || !selectedSite) return [];

    const coords: [number, number][] = [[selectedSite.lat, selectedSite.lng]];
    const startAngle = azimuthDeg - beamwidthDeg / 2;
    const endAngle = azimuthDeg + beamwidthDeg / 2;
    const steps = 24;

    for (let i = 0; i <= steps; i++) {
      const currentAngle = startAngle + (i / steps) * (endAngle - startAngle);
      const pt = calculateDestinationPoint(selectedSite.lat, selectedSite.lng, radiusEdge, currentAngle);
      coords.push([pt.lat, pt.lng]);
    }
    coords.push([selectedSite.lat, selectedSite.lng]);
    return coords;
  }, [antennaPattern, selectedSite, azimuthDeg, beamwidthDeg, radiusEdge]);

  // Heatmap Iso-Signal Rings Generator
  const heatmapRings = useMemo(() => {
    if (!selectedSite || radiusEdge <= 0) return [];
    
    // Gradient decibel tiers from strong down to sensitivity limit
    const tiers = [
      { color: '#10b981', margin: 25, opacity: 0.45, label: '> -80 dBm (Ultra Strong)' },
      { color: '#059669', margin: 18, opacity: 0.35, label: '-80 to -87 dBm (Strong)' },
      { color: '#3b82f6', margin: 12, opacity: 0.28, label: '-87 to -93 dBm (Good)' },
      { color: '#f59e0b', margin: 6,  opacity: 0.22, label: '-93 to -99 dBm (Fair)' },
      { color: '#f97316', margin: 2,  opacity: 0.16, label: '-99 to -103 dBm (Weak)' },
      { color: '#ef4444', margin: 0,  opacity: 0.10, label: '-103 to -105 dBm (Limit)' },
    ];

    return tiers.map(tier => {
      const res = calculateRealisticRange({
        txPowerDBm,
        txGainDBi: txGain,
        rxGainDBi: rxGain,
        txLossDB: 1.5,
        rxLossDB: 0.5,
        rxSensDBm: rxSens,
        fadeMarginDB: tier.margin,
        freqMHz: frequency,
        ht_m: txAntennaHeight,
        hr_m: rxAntennaHeight,
        environment
      });
      return {
        ...tier,
        radiusKm: res.reliableRangeKm
      };
    });
  }, [selectedSite, txPowerDBm, txGain, rxGain, rxSens, frequency, txAntennaHeight, rxAntennaHeight, environment, radiusEdge]);

  // Export Coverage Report JSON
  const handleExportCoverageReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      site: selectedSite,
      parameters: {
        frequencyMHz: frequency,
        txPowerWatts: txPowerW,
        txPowerDBm: Number(txPowerDBm.toFixed(1)),
        txGainDBi: txGain,
        txMastHeightM: txAntennaHeight,
        rxAntennaHeightM: rxAntennaHeight,
        rxSensitivityDBm: rxSens,
        environmentModel: environment,
        antennaPattern,
        azimuthDeg: antennaPattern === 'directional' ? azimuthDeg : 'Omni (360°)',
        beamwidthDeg: antennaPattern === 'directional' ? beamwidthDeg : 360,
      },
      propagationAnalysis: {
        model: edgeResult.modelUsed,
        radioHorizonKm: Number(radioHorizon.toFixed(2)),
        strongCoverageKm: Number(radiusStrong.toFixed(2)),
        goodCoverageKm: Number(radiusGood.toFixed(2)),
        maxCoverageKm: Number(radiusEdge.toFixed(2)),
        areaStrongKm2: Number(areaStrongKm2.toFixed(1)),
        areaGoodKm2: Number(areaGoodKm2.toFixed(1)),
        areaMaxKm2: Number(areaMaxKm2.toFixed(1)),
      },
      probeDiagnostics: probeData ? {
        testPointLat: probeLocation?.lat,
        testPointLng: probeLocation?.lng,
        distanceKm: Number(probeData.distanceKm.toFixed(2)),
        bearingDeg: Number(probeData.bearing.toFixed(1)),
        rssiDBm: Number(probeData.rssiDBm.toFixed(1)),
        fadeMarginDB: Number(probeData.marginDB.toFixed(1)),
        linkQuality: probeData.quality,
      } : null
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coverage_analysis_${selectedSite?.name.replace(/[^a-zA-Z0-9]/g, '_') || 'site'}_v1.0.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const tileUrls = {
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  };

  return (
    <div className="flex h-full w-full flex-col lg:flex-row overflow-hidden">
      {/* Control Sidebar */}
      <div className={`w-full lg:w-96 flex flex-col z-20 border-r flex-shrink-0 transition-colors shadow-sm ${
        theme === 'light' ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Module Header */}
        <div className={`p-3.5 border-b flex items-center justify-between ${
          theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Wifi className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-xs sm:text-sm tracking-tight">Coverage & Propagation Engine</h2>
              <div className="text-[10px] text-blue-600 dark:text-blue-400 font-mono font-semibold">
                ITU-R / Okumura-Hata • v1.0
              </div>
            </div>
          </div>

          <button
            onClick={handleExportCoverageReport}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
            title="Export Coverage Report JSON"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 p-1.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('parameters')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-bold transition text-center ${
              activeTab === 'parameters' 
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            RF Setup
          </button>
          <button
            onClick={() => setActiveTab('antenna')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-bold transition text-center ${
              activeTab === 'antenna' 
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Antenna
          </button>
          <button
            onClick={() => setActiveTab('probe')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-bold transition text-center flex items-center justify-center gap-1 ${
              activeTab === 'probe' 
                ? 'bg-white dark:bg-slate-900 text-pink-600 dark:text-pink-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <MapPin className="w-3 h-3 text-pink-500" />
            Probe
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`py-1.5 px-1 rounded-md text-[11px] font-bold transition text-center ${
              activeTab === 'analysis' 
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Curve Profile
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Site Selector */}
          <div className="space-y-1">
            <label className="flex items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <Target className="w-3.5 h-3.5 mr-1 text-blue-600" />
              Target Transmission Node
            </label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full text-xs p-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 font-semibold focus:ring-2 focus:ring-blue-500"
            >
              {sites.map(site => (
                <option key={site.id} value={site.id}>
                  {site.name} ({site.type.toUpperCase()})
                </option>
              ))}
            </select>
            {selectedSite && (
              <div className="text-[10px] font-mono text-slate-500 flex justify-between px-1">
                <span>Elev: {selectedSite.elevation}m</span>
                <span>{selectedSite.lat.toFixed(4)}°, {selectedSite.lng.toFixed(4)}°</span>
              </div>
            )}
          </div>

          {/* TAB 1: RF PARAMETERS */}
          {activeTab === 'parameters' && (
            <div className="space-y-3.5 pt-1 animate-in fade-in">
              {/* Frequency */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Carrier Frequency</span>
                  <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{frequency} MHz</span>
                </div>
                <input 
                  type="range" min="30" max="1000" step="0.5" 
                  value={frequency} onChange={e => setFrequency(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-0.5">
                  <span>30 (VHF Low)</span>
                  <span>155 (VHF Hi)</span>
                  <span>450 (UHF)</span>
                  <span>1000 MHz</span>
                </div>
              </div>

              {/* Power & Gain */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">TX Power (Watts)</label>
                  <input 
                    type="number" step="1" min="1" max="500"
                    value={txPowerW} onChange={e => setTxPowerW(Math.max(1, Number(e.target.value)))}
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800"
                  />
                  <span className="text-[9px] text-slate-400 font-mono mt-0.5 block">{txPowerDBm.toFixed(1)} dBm EIRP</span>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">TX Gain (dBi)</label>
                  <input 
                    type="number" step="0.5"
                    value={txGain} onChange={e => setTxGain(Number(e.target.value))}
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Mast & Receiver Heights */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Tower Mast ($h_{'{'}tx{'}'}$) m</label>
                  <input 
                    type="number" step="1" min="3" max="250"
                    value={txAntennaHeight} onChange={e => setTxAntennaHeight(Math.max(3, Number(e.target.value)))}
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Mobile Rx ($h_{'{'}rx{'}'}$) m</label>
                  <input 
                    type="number" step="0.5" min="0.5" max="30"
                    value={rxAntennaHeight} onChange={e => setRxAntennaHeight(Math.max(0.5, Number(e.target.value)))}
                    className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-mono bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Environment / Clutter Selection */}
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Propagation Clutter Environment</label>
                <select
                  value={environment}
                  onChange={e => setEnvironment(e.target.value)}
                  className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium bg-white dark:bg-slate-800"
                >
                  <option value="suburban">Suburban Area (Standard Clutter)</option>
                  <option value="rural">Rural / Open Terrain (Minimum Clutter)</option>
                  <option value="urban">Urban City (Medium Obstructions)</option>
                  <option value="dense-urban">Dense Urban (High Multi-Path & Canyon)</option>
                  <option value="los">Free Space Line-of-Sight (No Obstructions)</option>
                </select>
              </div>

              {/* Sensitivity */}
              <div>
                <div className="flex justify-between mb-1">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Receiver Sensitivity</label>
                  <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{rxSens} dBm</span>
                </div>
                <input 
                  type="range" min="-125" max="-85" step="1"
                  value={rxSens} onChange={e => setRxSens(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </div>
          )}

          {/* TAB 2: ANTENNA RADIATION & SECTORS */}
          {activeTab === 'antenna' && (
            <div className="space-y-4 pt-1 animate-in fade-in">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">Antenna Radiation Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setAntennaPattern('omni')}
                    className={`py-2 px-3 rounded-lg border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                      antennaPattern === 'omni'
                        ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-600 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    Omni (360°)
                  </button>
                  <button
                    onClick={() => setAntennaPattern('directional')}
                    className={`py-2 px-3 rounded-lg border font-bold text-xs flex items-center justify-center gap-1.5 transition ${
                      antennaPattern === 'directional'
                        ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-600 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    Directional Sector
                  </button>
                </div>
              </div>

              {antennaPattern === 'directional' && (
                <div className="space-y-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Azimuth Heading</span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{azimuthDeg}°</span>
                    </div>
                    <input 
                      type="range" min="0" max="360" step="5"
                      value={azimuthDeg} onChange={e => setAzimuthDeg(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-0.5">
                      <span>N (0°)</span>
                      <span>E (90°)</span>
                      <span>S (180°)</span>
                      <span>W (270°)</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Horizontal Beamwidth (3dB)</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{beamwidthDeg}°</span>
                    </div>
                    <select
                      value={beamwidthDeg}
                      onChange={e => setBeamwidthDeg(Number(e.target.value))}
                      className="w-full p-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium bg-white dark:bg-slate-800"
                    >
                      <option value="60">60° Narrow Sector Panel</option>
                      <option value="90">90° Standard Sector Panel</option>
                      <option value="120">120° Wide Tri-Sector Panel</option>
                      <option value="180">180° Bi-Directional Hemispheric</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-[10px] font-bold uppercase text-slate-500">Front-to-Back Ratio</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{frontToBackDB} dB</span>
                    </div>
                    <input 
                      type="range" min="10" max="35" step="1"
                      value={frontToBackDB} onChange={e => setFrontToBackDB(Number(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 text-slate-600 dark:text-slate-400 space-y-1">
                <div className="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  Antenna Directivity Notes
                </div>
                <p className="text-[11px] leading-relaxed">
                  Directional sector modeling projects concentrated power along the boresight azimuth angle, attenuating side and back lobes realistically.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: FIELD TEST PROBE */}
          {activeTab === 'probe' && (
            <div className="space-y-3.5 pt-1 animate-in fade-in">
              <div className="p-3 rounded-xl bg-pink-50/70 dark:bg-pink-950/40 border border-pink-100 dark:border-pink-900/60 text-slate-700 dark:text-slate-300">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-bold text-pink-700 dark:text-pink-400">
                    <MapPin className="w-4 h-4" />
                    Interactive RF Test Probe
                  </div>
                  <span className="px-1.5 py-0.5 bg-pink-600 text-white rounded text-[9px] font-bold">
                    CLICK MAP
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Click anywhere on the map to place or drag the field station and diagnose point-to-point signal levels.
                </p>
              </div>

              {probeData && probeLocation ? (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Distance to TX</div>
                      <div className="text-base font-mono font-bold text-slate-800 dark:text-white">
                        {probeData.distanceKm.toFixed(2)} km
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Bearing Angle</div>
                      <div className="text-base font-mono font-bold text-slate-800 dark:text-white">
                        {probeData.bearing.toFixed(1)}°
                      </div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-semibold">Predicted RSSI:</span>
                      <span className={`text-base font-mono font-bold ${
                        probeData.rssiDBm >= rxSens + 10 ? 'text-emerald-600 dark:text-emerald-400' :
                        probeData.rssiDBm >= rxSens ? 'text-amber-500' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {probeData.rssiDBm.toFixed(1)} dBm
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">Path Loss ($PL$):</span>
                      <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                        {probeData.pathLoss.toFixed(1)} dB
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-slate-500">Fade Margin ($\Delta$):</span>
                      <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        {probeData.marginDB > 0 ? `+${probeData.marginDB.toFixed(1)}` : probeData.marginDB.toFixed(1)} dB
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-slate-100 dark:border-slate-700">
                      <span className="text-slate-500">Radio Horizon LOS:</span>
                      <span className={`font-bold ${probeData.isLOS ? 'text-emerald-600' : 'text-amber-500'}`}>
                        {probeData.isLOS ? 'Direct LOS (Cleared)' : 'Diffraction Path'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-1.5 border-t border-slate-100 dark:border-slate-700">
                      <span className="text-slate-500 font-semibold">Link Reliability:</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        probeData.quality === 'excellent' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                        probeData.quality === 'good' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                        probeData.quality === 'fair' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' :
                        probeData.quality === 'marginal' ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' :
                        'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                      }`}>
                        {probeData.quality}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 text-center text-slate-400 border border-dashed rounded-xl">
                  Click anywhere on the map to drop the diagnostic probe.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SIGNAL CURVE PROFILE */}
          {activeTab === 'analysis' && (
            <div className="space-y-3.5 pt-1 animate-in fade-in">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">
                  $P_{'{'}rx{'}'}$ Signal Strength vs Distance (km)
                </div>
                <div className="h-44 w-full bg-slate-50 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.6} />
                      <XAxis dataKey="distance" tick={{ fontSize: 9 }} unit="km" />
                      <YAxis tick={{ fontSize: 9 }} domain={[-125, -40]} unit="dBm" />
                      <RechartsTooltip 
                        contentStyle={{ fontSize: '11px', borderRadius: '6px' }} 
                        formatter={(val: any) => [`${val} dBm`, 'Signal']}
                      />
                      <ReferenceLine y={rxSens} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Sens', position: 'insideRight', fill: '#ef4444', fontSize: 9 }} />
                      <ReferenceLine y={rxSens + 10} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Reliable', position: 'insideRight', fill: '#f59e0b', fontSize: 9 }} />
                      <Line type="monotone" dataKey="rssi" stroke="#2563eb" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Coverage Area Metrics */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-slate-500">Service Footprint Area</div>
                <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                    <div className="text-[9px] font-bold text-emerald-600 uppercase">Strong</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{areaStrongKm2.toFixed(0)} km²</div>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900">
                    <div className="text-[9px] font-bold text-amber-600 uppercase">Good</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{areaGoodKm2.toFixed(0)} km²</div>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900">
                    <div className="text-[9px] font-bold text-rose-600 uppercase">Total</div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{areaMaxKm2.toFixed(0)} km²</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Statistics Card */}
        <div className={`p-3.5 border-t mt-auto ${
          theme === 'light' ? 'bg-slate-900 text-white' : 'bg-slate-950 text-white border-slate-800'
        }`}>
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            <span>Predicted Range Radii</span>
            <span className="text-emerald-400 font-mono">{edgeResult.modelUsed}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-1.5 rounded bg-slate-800 border border-slate-700">
              <div className="text-[9px] font-bold text-emerald-400">STRONG (+20dB)</div>
              <div className="text-xs font-mono font-bold text-white mt-0.5">{radiusStrong.toFixed(1)} km</div>
            </div>
            <div className="p-1.5 rounded bg-slate-800 border border-slate-700">
              <div className="text-[9px] font-bold text-amber-400">GOOD (+10dB)</div>
              <div className="text-xs font-mono font-bold text-white mt-0.5">{radiusGood.toFixed(1)} km</div>
            </div>
            <div className="p-1.5 rounded bg-slate-800 border border-slate-700">
              <div className="text-[9px] font-bold text-rose-400">MAX (0dB)</div>
              <div className="text-xs font-mono font-bold text-white mt-0.5">{radiusEdge.toFixed(1)} km</div>
            </div>
          </div>

          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2.5 pt-2 border-t border-slate-800">
            <span>Radio Horizon ($d_{'{'}h{'}'}$): <b>{radioHorizon.toFixed(1)} km</b></span>
            <span>TX Tower: <b>{txAntennaHeight}m</b></span>
          </div>
        </div>
      </div>

      {/* Map Area with Overlay Controls */}
      <div className="flex-1 relative bg-slate-200 dark:bg-slate-950 min-h-[400px]">
        {/* Floating Top-Right Map Controls */}
        <div className="absolute top-3 right-3 z-[400] flex flex-wrap items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 text-xs">
          {/* Layer View Mode */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 font-semibold text-[11px]">
            <button
              onClick={() => setViewMode('contours')}
              className={`px-2.5 py-1 rounded-md transition ${viewMode === 'contours' ? 'bg-white dark:bg-slate-700 shadow-xs font-bold text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
            >
              Contours
            </button>
            <button
              onClick={() => setViewMode('heatmap')}
              className={`px-2.5 py-1 rounded-md transition ${viewMode === 'heatmap' ? 'bg-white dark:bg-slate-700 shadow-xs font-bold text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
            >
              RSSI Heatmap
            </button>
            <button
              onClick={() => setViewMode('multi-site')}
              className={`px-2.5 py-1 rounded-md transition ${viewMode === 'multi-site' ? 'bg-white dark:bg-slate-700 shadow-xs font-bold text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
            >
              All Sites
            </button>
          </div>

          {/* Online Map Style Picker */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-[11px] font-semibold">
            <button
              onClick={() => setMapTileStyle('osm')}
              className={`px-2 py-1 rounded-md transition ${mapTileStyle === 'osm' ? 'bg-white dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-500'}`}
            >
              🌍 OSM
            </button>
            <button
              onClick={() => setMapTileStyle('satellite')}
              className={`px-2 py-1 rounded-md transition ${mapTileStyle === 'satellite' ? 'bg-white dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-500'}`}
            >
              🛰️ Sat
            </button>
            <button
              onClick={() => setMapTileStyle('topo')}
              className={`px-2 py-1 rounded-md transition ${mapTileStyle === 'topo' ? 'bg-white dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400 shadow-xs' : 'text-slate-500'}`}
            >
              ⛰️ Topo
            </button>
            <button
              onClick={() => setMapTileStyle('light')}
              className={`px-2 py-1 rounded-md transition ${mapTileStyle === 'light' ? 'bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white' : 'text-slate-500'}`}
            >
              Street
            </button>
            <button
              onClick={() => setMapTileStyle('dark')}
              className={`px-2 py-1 rounded-md transition ${mapTileStyle === 'dark' ? 'bg-white dark:bg-slate-700 font-bold text-slate-900 dark:text-white' : 'text-slate-500'}`}
            >
              Dark
            </button>
          </div>
        </div>

        {/* Map Legend Overlay */}
        <div className="absolute bottom-4 left-4 z-[400] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 text-[11px] max-w-xs space-y-1.5 pointer-events-auto">
          <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
            <span>Signal Legend</span>
            <span className="text-[9px] font-mono text-blue-600 dark:text-blue-400">{frequency} MHz</span>
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-slate-600 dark:text-slate-300">&gt; -85 dBm (Strong)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-slate-600 dark:text-slate-300">&gt; -95 dBm (Good)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="text-slate-600 dark:text-slate-300">&gt; -105 dBm (Edge)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-1 border-t-2 border-dashed border-slate-400"></span>
              <span className="text-slate-600 dark:text-slate-300">Horizon ({radioHorizon.toFixed(0)}km)</span>
            </div>
          </div>
        </div>

        {/* Leaflet Map Canvas */}
        <MapContainer 
          center={selectedSite ? [selectedSite.lat, selectedSite.lng] : [33.6844, 73.0479]} 
          zoom={11} 
          className="w-full h-full z-0"
        >
          {/* Pure Online Tile Layers */}
          {mapTileStyle === 'osm' && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          )}
          {mapTileStyle === 'satellite' && (
            <>
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            </>
          )}
          {mapTileStyle === 'topo' && (
            <TileLayer
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              maxZoom={17}
            />
          )}
          {mapTileStyle === 'light' && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              maxZoom={19}
            />
          )}
          {mapTileStyle === 'dark' && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              maxZoom={19}
            />
          )}
          
          <MapClickHandler onMapClick={(lat, lng) => setProbeLocation({ lat, lng })} />
          {selectedSite && <MapPanner lat={selectedSite.lat} lng={selectedSite.lng} />}
          
          {/* RENDER ALL SITES MULTI-COVERAGE VIEW */}
          {viewMode === 'multi-site' && sites.map(site => {
            const siteParams = {
              txPowerDBm: site.txPowerW ? 10 * Math.log10(site.txPowerW * 1000) : 47,
              txGainDBi: site.type === 'repeater' ? 6 : 3,
              rxGainDBi: 0,
              txLossDB: 1.5,
              rxLossDB: 0.5,
              rxSensDBm: -105,
              freqMHz: site.txFreqMHz || 155.5,
              ht_m: site.type === 'repeater' ? 45 : 30,
              hr_m: 2,
              environment
            };

            const normalRange = calculateRealisticRange({
              ...siteParams,
              fadeMarginDB: 0 // Max Edge
            });

            const goodRange = calculateRealisticRange({
              ...siteParams,
              fadeMarginDB: 10 // Reliable Zone
            });

            return (
              <React.Fragment key={`multi-${site.id}`}>
                {/* Normal Health Zone (Max Range) */}
                <Circle
                  center={[site.lat, site.lng]}
                  radius={normalRange.maxRangeKm * 1000}
                  pathOptions={{
                    color: '#3b82f6', // Blue for normal edge
                    fillColor: '#3b82f6',
                    fillOpacity: 0.08,
                    weight: 1,
                    dashArray: '4, 4'
                  }}
                />
                
                {/* Good Signal Health Zone (Reliable Range) */}
                <Circle
                  center={[site.lat, site.lng]}
                  radius={goodRange.reliableRangeKm * 1000}
                  pathOptions={{
                    color: '#10b981', // Emerald for good health zone
                    fillColor: '#10b981',
                    fillOpacity: 0.22,
                    weight: 2
                  }}
                />

                <Marker 
                  position={[site.lat, site.lng]}
                  icon={site.type === 'repeater' ? RepeaterIcon : BaseStationIcon}
                  eventHandlers={{
                    click: () => setSelectedSiteId(site.id)
                  }}
                >
                  <Popup>
                    <div className="p-1 min-w-[150px] text-xs">
                      <div className="font-bold text-slate-800">{site.name}</div>
                      <div className="text-slate-500 uppercase text-[10px]">{site.type}</div>
                      <div className="mt-2 text-[11px] font-mono space-y-1">
                        <div className="flex items-center text-emerald-700">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full mr-1.5"></div>
                          Good Health: <b>{goodRange.reliableRangeKm.toFixed(1)} km</b>
                        </div>
                        <div className="flex items-center text-blue-700">
                          <div className="w-2 h-2 border border-blue-500 bg-blue-100 rounded-full mr-1.5"></div>
                          Normal Health: <b>{normalRange.maxRangeKm.toFixed(1)} km</b>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}

          {/* SINGLE SITE DETAILED COVERAGE (Contours / Heatmap / Sectors) */}
          {viewMode !== 'multi-site' && selectedSite && radiusEdge > 0 && (
            <>
              {/* Radio Horizon Limit Circle */}
              {showHorizon && (
                <Circle 
                  center={[selectedSite.lat, selectedSite.lng]}
                  radius={radioHorizon * 1000}
                  pathOptions={{ 
                    color: '#64748b', 
                    fillColor: '#64748b', 
                    fillOpacity: 0.02,
                    weight: 1.5,
                    dashArray: '5, 8'
                  }}
                />
              )}

              {/* VIEW 1: CONTOUR ZONES */}
              {viewMode === 'contours' && antennaPattern === 'omni' && (
                <>
                  {/* Max Edge (0dB margin) */}
                  <Circle 
                    center={[selectedSite.lat, selectedSite.lng]}
                    radius={radiusEdge * 1000}
                    pathOptions={{ 
                      color: '#ef4444', 
                      fillColor: '#ef4444', 
                      fillOpacity: 0.12,
                      weight: 1.5,
                      dashArray: '6, 6'
                    }}
                  />
                  
                  {/* Good Coverage (+10dB margin) */}
                  <Circle 
                    center={[selectedSite.lat, selectedSite.lng]}
                    radius={radiusGood * 1000}
                    pathOptions={{ 
                      color: '#f59e0b', 
                      fillColor: '#f59e0b', 
                      fillOpacity: 0.22,
                      weight: 2
                    }}
                  />
                  
                  {/* Strong Coverage (+20dB margin) */}
                  <Circle 
                    center={[selectedSite.lat, selectedSite.lng]}
                    radius={radiusStrong * 1000}
                    pathOptions={{ 
                      color: '#10b981', 
                      fillColor: '#10b981', 
                      fillOpacity: 0.38,
                      weight: 2.5
                    }}
                  />
                </>
              )}

              {/* VIEW 2: RSSI HEATMAP GRADIENT RINGS */}
              {viewMode === 'heatmap' && antennaPattern === 'omni' && heatmapRings.map((ring, idx) => (
                <Circle
                  key={`heat-ring-${idx}`}
                  center={[selectedSite.lat, selectedSite.lng]}
                  radius={ring.radiusKm * 1000}
                  pathOptions={{
                    color: ring.color,
                    fillColor: ring.color,
                    fillOpacity: ring.opacity,
                    weight: 1
                  }}
                />
              ))}

              {/* DIRECTIONAL SECTOR BEAM POLYGON */}
              {antennaPattern === 'directional' && sectorPolygonCoords.length > 0 && (
                <Polygon
                  positions={sectorPolygonCoords}
                  pathOptions={{
                    color: '#3b82f6',
                    fillColor: '#3b82f6',
                    fillOpacity: 0.35,
                    weight: 2
                  }}
                />
              )}

              {/* SELECTED SITE MARKER */}
              <Marker 
                position={[selectedSite.lat, selectedSite.lng]}
                icon={selectedSite.type === 'repeater' ? RepeaterIcon : BaseStationIcon}
              >
                <Popup>
                  <div className="p-1 min-w-[160px] text-xs">
                    <div className="font-bold text-slate-900">{selectedSite.name}</div>
                    <div className="text-slate-500 uppercase font-semibold text-[10px] mb-1.5">{selectedSite.type}</div>
                    <div className="space-y-1 text-[11px] border-t pt-1.5 text-slate-600">
                      <div className="flex justify-between">
                        <span>Max Comm Reach:</span>
                        <strong className="text-rose-600 font-mono">{radiusEdge.toFixed(1)} km</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Reliable Reach:</span>
                        <strong className="text-emerald-600 font-mono">{radiusGood.toFixed(1)} km</strong>
                      </div>
                      <div className="flex justify-between">
                        <span>Radio Horizon:</span>
                        <strong className="text-slate-700 font-mono">{radioHorizon.toFixed(1)} km</strong>
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            </>
          )}

          {/* INTERACTIVE RF TEST PROBE PIN & CONNECTING RAY */}
          {showProbe && probeLocation && selectedSite && (
            <>
              <Polyline
                positions={[
                  [selectedSite.lat, selectedSite.lng],
                  [probeLocation.lat, probeLocation.lng]
                ]}
                pathOptions={{
                  color: '#ec4899',
                  weight: 2,
                  dashArray: '4, 6'
                }}
              />
              <Marker position={[probeLocation.lat, probeLocation.lng]} icon={ProbeIcon}>
                <Popup>
                  <div className="p-1 text-xs min-w-[150px]">
                    <div className="font-bold text-pink-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      Field Test Probe
                    </div>
                    {probeData && (
                      <div className="space-y-1 mt-1 text-[11px] text-slate-700 border-t pt-1">
                        <div className="flex justify-between">
                          <span>Distance:</span>
                          <b className="font-mono">{probeData.distanceKm.toFixed(2)} km</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Signal ($P_{'{'}rx{'}'}$):</span>
                          <b className="font-mono text-blue-600">{probeData.rssiDBm.toFixed(1)} dBm</b>
                        </div>
                        <div className="flex justify-between">
                          <span>Status:</span>
                          <b className="uppercase text-emerald-600">{probeData.quality}</b>
                        </div>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
