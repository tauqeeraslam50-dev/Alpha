import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { Activity, ArrowRight, Search, MapPin, Layers, Globe, Mountain, WifiOff, Eye } from 'lucide-react';
import { calculateDistanceKm, calculateFSPL, calculateEarthBulge, calculatePathLossAtDistance, calculateRadioHorizon, calculateReceivedPower } from '../lib/utils';
import { searchOfflineLocations } from '../lib/offlineGeo';
import { getDetailedElevationInfo, ElevationPointInfo } from '../lib/offlineDem';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Component to adjust map bounds to fit all sites
function MapBounds({ sites }: { sites: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (sites.length > 0) {
      const bounds = L.latLngBounds(sites.map(site => [site.lat, site.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [sites, map]);
  return null;
}

// Component to fly to searched location
function MapFlyTo({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 13, { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

// Component to track map cursor and clicks for DEM elevation telemetry
function MapTelemetryHandler({ 
  onCursorMove, 
  onClickPoint 
}: { 
  onCursorMove?: (lat: number, lng: number) => void; 
  onClickPoint?: (lat: number, lng: number) => void; 
}) {
  useMapEvents({
    mousemove(e) {
      if (onCursorMove) onCursorMove(e.latlng.lat, e.latlng.lng);
    },
    click(e) {
      if (onClickPoint) onClickPoint(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

import { MapManagerModal } from './MapManagerModal';

export function GISMap() {
  const { sites, links, addLink, equipmentDB, theme, setCurrentView, updateSite } = useAppContext();
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [analysisFreq, setAnalysisFreq] = useState<number>(155.5);
  const [radioType, setRadioType] = useState<string>('base');
  const [analysisTxPowerW, setAnalysisTxPowerW] = useState<number>(50);
  const [analysisTxGain, setAnalysisTxGain] = useState<number>(6);
  const [analysisRxGain, setAnalysisRxGain] = useState<number>(6);
  const [analysisRxSens, setAnalysisRxSens] = useState<number>(-95);
  const [isMapManagerOpen, setIsMapManagerOpen] = useState<boolean>(false);

  // DEM Terrain & Satellite Telemetry State
  const [isElevationInspectorActive, setIsElevationInspectorActive] = useState<boolean>(false);
  const [cursorElevInfo, setCursorElevInfo] = useState<ElevationPointInfo | null>(null);
  const [clickedElevInfo, setClickedElevInfo] = useState<ElevationPointInfo | null>(null);
  const [showDEMLegend, setShowDEMLegend] = useState<boolean>(true);

  // Online Base Layer selection
  const [mapLayerType, setMapLayerType] = useState<'osm' | 'satellite' | 'topo' | 'carto-light' | 'carto-dark'>('osm');
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // Monitor network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Search State with 100% Offline Gazetteer & Coordinate Engine
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchedPosition, setSearchedPosition] = useState<[number, number] | null>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // 1. Perform 100% Offline Search first (Gazetteer & GPS Coordinates)
    const offlineMatches = searchOfflineLocations(searchQuery);
    if (offlineMatches.length > 0) {
      setSearchResults(offlineMatches.map(m => ({
        display_name: m.displayName,
        lat: m.lat,
        lon: m.lng,
        isOffline: true
      })));
      setShowSearchResults(true);
      return;
    }

    // 2. If online is available, attempt fallback fetch
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        setShowSearchResults(true);
      }
    } catch {
      // Offline fallback
      setSearchResults([{
        display_name: `Location not found in offline DB: "${searchQuery}"`,
        lat: sites[0]?.lat || 33.6844,
        lon: sites[0]?.lng || 73.0479,
        isError: true
      }]);
      setShowSearchResults(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: any) => {
    if (result.isError) return;
    const pos: [number, number] = [parseFloat(result.lat), parseFloat(result.lon)];
    setSearchedPosition(pos);
    setShowSearchResults(false);
    setSearchQuery(result.display_name.split(' (')[0]);
  };

  const handleRadioTypeChange = (type: string) => {
    setRadioType(type);
    if (type === 'base') {
      setAnalysisTxPowerW(50);
      setAnalysisTxGain(6);
      setAnalysisRxGain(6);
    } else if (type === 'vehicular') {
      setAnalysisTxPowerW(25);
      setAnalysisTxGain(3);
      setAnalysisRxGain(3);
    } else if (type === 'walkie-talkie') {
      setAnalysisTxPowerW(5);
      setAnalysisTxGain(0);
      setAnalysisRxGain(0);
    }
  };

  const toggleSiteSelection = (id: string) => {
    setSelectedSites(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const defaultCenter: [number, number] = sites.length > 0 
    ? [sites[0].lat, sites[0].lng] 
    : [33.6844, 73.0479];

  return (
    <div className="flex flex-col h-full relative">
      {/* Search Bar & Layer Switcher Top Bar */}
      <div className="absolute top-4 left-14 flex items-center gap-2 z-[1000] max-w-[calc(100vw-120px)] flex-wrap">
        {/* Search Input */}
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 rounded-lg shadow-md w-72 md:w-80">
          <form onSubmit={handleSearch} className="flex items-center p-1">
            <input 
              type="text" 
              placeholder="Search city, base, or lat,lng..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value === '') {
                  setShowSearchResults(false);
                }
              }}
              className="w-full text-xs p-1.5 outline-none bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400"
            />
            <button type="submit" className="p-1.5 text-slate-500 hover:text-blue-600 transition" disabled={isSearching}>
              {isSearching ? <Activity className="w-4 h-4 animate-spin text-blue-600" /> : <Search className="w-4 h-4" />}
            </button>
          </form>
          
          {/* Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="border-t border-slate-100 dark:border-slate-800 max-h-64 overflow-y-auto">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectSearchResult(result)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800/50 last:border-0 truncate flex items-start"
                >
                  <MapPin className="w-3.5 h-3.5 mr-1.5 mt-0.5 text-blue-500 flex-shrink-0" />
                  <div className="truncate">
                    <span className="text-slate-800 dark:text-slate-200 font-medium">{result.display_name}</span>
                    {result.isOffline && (
                      <span className="ml-1.5 text-[9px] px-1 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded font-mono">
                        OFFLINE
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Online Map Style Selector */}
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 rounded-lg shadow-md px-2 py-1 flex items-center gap-1.5 text-xs">
          <Globe className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[10px] font-bold text-slate-400 uppercase hidden sm:inline">Online Map:</span>
          <select
            value={mapLayerType}
            onChange={(e) => setMapLayerType(e.target.value as any)}
            className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value="osm" className="dark:bg-slate-900 text-slate-800 dark:text-slate-100">🌍 OpenStreetMap (Standard)</option>
            <option value="satellite" className="dark:bg-slate-900 text-slate-800 dark:text-slate-100">🛰️ Esri Satellite (Online)</option>
            <option value="topo" className="dark:bg-slate-900 text-slate-800 dark:text-slate-100">⛰️ OpenTopoMap (Topographic)</option>
            <option value="carto-light" className="dark:bg-slate-900 text-slate-800 dark:text-slate-100">🏙️ CartoDB Voyager (Light)</option>
            <option value="carto-dark" className="dark:bg-slate-900 text-slate-800 dark:text-slate-100">🎯 CartoDB Dark Matter (Dark)</option>
          </select>
        </div>

        {/* DEM Elevation Inspector Button */}
        <button
          onClick={() => {
            setIsElevationInspectorActive(!isElevationInspectorActive);
            if (isElevationInspectorActive) {
              setClickedElevInfo(null);
            }
          }}
          className={`backdrop-blur border rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-1.5 text-xs font-bold transition-colors ${
            isElevationInspectorActive
              ? 'bg-amber-600 border-amber-400 text-white shadow-amber-500/20'
              : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
          title="Click to activate DEM Elevation & Slope Inspector on the map"
        >
          <Mountain className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">DEM Inspector</span>
        </button>

        {/* Online Map Status Indicator */}
        <div className="bg-slate-900/95 border border-emerald-500/50 backdrop-blur rounded-lg shadow-md px-2.5 py-1.5 flex items-center gap-2 text-xs font-bold text-emerald-400">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
          <span className="tracking-widest">ONLINE MAP</span>
        </div>
      </div>

      {/* Legend Top-Right */}
      <div className="absolute top-4 right-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 p-3 rounded-lg z-[1000] shadow-md text-xs">
        <h3 className="text-slate-800 dark:text-slate-200 font-bold mb-2 text-[10px] uppercase tracking-widest flex items-center justify-between gap-2">
          <span>GIS Network Legend</span>
          <span className="text-[9px] px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 rounded font-mono flex items-center gap-1">
            <WifiOff className="w-2.5 h-2.5" /> Standalone
          </span>
        </h3>
        <div className="flex flex-col gap-2 text-slate-700 dark:text-slate-300 font-medium">
          <div className="flex items-center"><div className="w-3.5 h-3.5 bg-blue-600 rounded-full mr-2.5 shadow-xs border-2 border-white"></div>Base Station (Blue)</div>
          <div className="flex items-center"><div className="w-3.5 h-3.5 bg-amber-500 rounded-xs mr-2.5 shadow-xs border-2 border-white"></div>Repeater (Yellow)</div>
          <div className="flex items-center"><div className="w-4 h-1 bg-emerald-500 mr-2.5"></div>Active RF Link</div>
          <div className="flex items-center"><div className="w-4 h-1 border-t-2 border-dashed border-blue-500 mr-2.5"></div>Analysis Path</div>
        </div>
      </div>

      {/* Interactive Link Analysis Panel */}
      {selectedSites.length > 0 && (
        <div className="absolute bottom-6 left-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 p-4 rounded-xl z-[1000] shadow-xl w-84 max-h-[80vh] overflow-y-auto">
          <h3 className="text-slate-800 dark:text-slate-100 font-bold mb-2 text-xs flex items-center">
            <Activity className="w-4 h-4 mr-2 text-blue-600" />
            Line of Sight & Path Loss Tool
          </h3>
          
          {selectedSites.length === 1 && (
            <p className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
              Selected TX: <strong className="text-slate-700 dark:text-slate-200">{sites.find(s => s.id === selectedSites[0])?.name}</strong><br/><br/>
              Click a second station/repeater on the map to calculate distance, Line of Sight, and link budget.
            </p>
          )}

          {selectedSites.length === 2 && (
            (() => {
              const site1 = sites.find(s => s.id === selectedSites[0]);
              const site2 = sites.find(s => s.id === selectedSites[1]);
              if (!site1 || !site2) return null;
              
              const distance = calculateDistanceKm(site1.lat, site1.lng, site2.lat, site2.lng);
              const pathLoss = calculatePathLossAtDistance(distance, analysisFreq, 30, 30, 'los');
              const radioHorizon = calculateRadioHorizon(30, 30);
              const hasLOS = distance <= radioHorizon;
              
              const txCableLossDB = 1.5;
              const rxCableLossDB = 1.5;
              const txPowerDBm = analysisTxPowerW > 0 ? 10 * Math.log10(analysisTxPowerW * 1000) : 0;
              const prx = txPowerDBm + analysisTxGain + analysisRxGain - txCableLossDB - rxCableLossDB - pathLoss;
              const isLinkViable = prx >= analysisRxSens;
              
              return (
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-800 p-2 rounded-lg">
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate w-24" title={site1.name}>{site1.name}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate w-24 text-right" title={site2.name}>{site2.name}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Equipment Type</label>
                      <select 
                        value={radioType}
                        onChange={(e) => handleRadioTypeChange(e.target.value)}
                        className="w-full text-xs p-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                      >
                        <option value="base">Base Station (50W)</option>
                        <option value="vehicular">Vehicular Radio (25W)</option>
                        <option value="walkie-talkie">Walkie Talkie (5W)</option>
                        <option value="custom">Custom Power</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Freq (MHz)</label>
                      <input 
                        type="number" 
                        value={analysisFreq} 
                        onChange={(e) => setAnalysisFreq(Number(e.target.value))} 
                        className="w-full text-xs p-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 font-mono text-slate-800 dark:text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Tx Power (W)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={analysisTxPowerW} 
                        onChange={(e) => {
                          setAnalysisTxPowerW(Number(e.target.value));
                          setRadioType('custom');
                        }} 
                        className="w-full text-xs p-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 font-mono text-slate-800 dark:text-slate-200"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded border border-slate-100 dark:border-slate-700">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Distance</div>
                      <div className="text-sm font-bold font-mono text-slate-800 dark:text-slate-100">{distance.toFixed(1)} km</div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded border border-slate-100 dark:border-slate-700">
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Path Loss</div>
                      <div className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400">-{pathLoss.toFixed(1)} dB</div>
                    </div>
                    <div className={`p-2 rounded border ${isLinkViable ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200'}`}>
                      <div className={`text-[10px] font-bold uppercase ${isLinkViable ? 'text-emerald-600' : 'text-rose-600'}`}>Rx Signal</div>
                      <div className={`text-sm font-bold font-mono ${isLinkViable ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700'}`}>
                        {prx.toFixed(1)} dBm
                      </div>
                    </div>
                    <div className={`p-2 rounded border ${hasLOS && isLinkViable ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200'}`}>
                      <div className={`text-[10px] font-bold uppercase ${hasLOS && isLinkViable ? 'text-emerald-600' : 'text-rose-600'}`}>Viability</div>
                      <div className={`text-xs font-bold ${hasLOS && isLinkViable ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700'}`}>
                        {hasLOS && isLinkViable ? 'PASS (Clear)' : 'ATTENTION'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <button 
                      onClick={() => setCurrentView('los')}
                      className="w-full py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-100 dark:hover:bg-blue-900 transition flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                      Deep Line of Sight (LOS) Studio
                    </button>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setSelectedSites([])}
                        className="flex-1 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 transition"
                      >
                        Clear
                      </button>
                      <button 
                        onClick={() => {
                          addLink({
                            id: `l${Date.now()}`,
                            sourceSiteId: site1.id,
                            targetSiteId: site2.id,
                            equipmentId: 'e1',
                            distanceKm: distance,
                            frequencyMHz: analysisFreq,
                            txPowerDBm: txPowerDBm,
                            txAntennaGainDBi: analysisTxGain,
                            rxAntennaGainDBi: analysisRxGain,
                            txCableLossDB: 1.5,
                            rxCableLossDB: 1.5,
                            fadeMarginDB: Math.round(prx - analysisRxSens)
                          });
                          setSelectedSites([]);
                        }}
                        className="flex-1 py-1.5 text-xs font-bold text-white bg-blue-600 rounded hover:bg-blue-700 transition"
                      >
                        Save Path
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Leaflet Map Canvas */}
      <div className="flex-1 w-full h-full">
        <MapContainer 
          center={defaultCenter} 
          zoom={10} 
          className="w-full h-full z-0"
          zoomControl={true}
        >
          {/* Pure Online Tile Layers */}
          {mapLayerType === 'osm' && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          )}
          {mapLayerType === 'satellite' && (
            <>
              <TileLayer
                attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
              <TileLayer
                url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
                maxZoom={19}
              />
            </>
          )}
          {mapLayerType === 'topo' && (
            <TileLayer
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              maxZoom={17}
            />
          )}
          {mapLayerType === 'carto-light' && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              maxZoom={19}
            />
          )}
          {mapLayerType === 'carto-dark' && (
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              maxZoom={19}
            />
          )}
          
          <MapBounds sites={sites} />
          <MapFlyTo position={searchedPosition} />
          
          {/* DEM Telemetry & Click Inspection Handler */}
          <MapTelemetryHandler
            onCursorMove={(lat, lng) => {
              if (isElevationInspectorActive || selectedSites.length === 1) {
                const info = getDetailedElevationInfo(lat, lng);
                setCursorElevInfo(info);
              }
            }}
            onClickPoint={(lat, lng) => {
              if (selectedSites.length === 1) {
                const siteToMove = sites.find(s => s.id === selectedSites[0]);
                if (siteToMove && updateSite) {
                  updateSite({ ...siteToMove, lat, lng });
                }
              }
              const info = getDetailedElevationInfo(lat, lng);
              setClickedElevInfo(info);
            }}
          />

          {/* Searched Location Marker */}
          {searchedPosition && (
            <Marker position={searchedPosition}>
              <Popup>
                <div className="text-xs font-bold">Search Target</div>
                <div className="text-[11px] text-slate-500 font-mono">{searchedPosition[0].toFixed(4)}°, {searchedPosition[1].toFixed(4)}°</div>
              </Popup>
            </Marker>
          )}

          {/* Draw Saved Links */}
          {links.map(link => {
            const source = sites.find(s => s.id === link.sourceSiteId);
            const target = sites.find(s => s.id === link.targetSiteId);
            if (!source || !target) return null;
            
            // Re-evaluate viability dynamically based on latest realistic physics
            const pathLoss = calculatePathLossAtDistance(link.distanceKm, link.frequencyMHz, 30, 30, 'los');
            const rxSens = equipmentDB?.find(e => e.id === link.equipmentId)?.rxSensitivityDBm || -110;
            const prx = link.txPowerDBm + link.txAntennaGainDBi + link.rxAntennaGainDBi - link.txCableLossDB - link.rxCableLossDB - pathLoss;
            const isViable = prx >= rxSens;

            const bandwidthHz = (link.channelBandwidthKHz || 12.5) * 1000;
            const thermalNoiseDBm = -174 + 10 * Math.log10(bandwidthHz);
            const snr = prx - thermalNoiseDBm;

            return (
              <Polyline 
                key={link.id} 
                positions={[[source.lat, source.lng], [target.lat, target.lng]]}
                color={isViable ? "#10b981" : "#ef4444"}
                weight={3}
                dashArray={isViable ? "10, 10" : "4, 8"}
              >
                <Tooltip permanent direction="center" className="bg-white/90 backdrop-blur-sm border border-slate-200 shadow-sm text-center px-2 py-1 rounded">
                  <div className="text-[10px] font-mono leading-tight flex flex-col items-center">
                    <span className="font-bold text-slate-800">{link.distanceKm} km</span>
                    <span className={isViable ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>{isViable ? 'GOOD' : 'FAIL'}</span>
                    <span className="text-slate-600">{prx.toFixed(1)} dBm</span>
                    <span className="text-blue-600 font-bold mt-0.5">SNR: {snr.toFixed(1)} dB</span>
                  </div>
                </Tooltip>
              </Polyline>
            );
          })}

          {/* Draw Temporary Analysis Link */}
          {(selectedSites.length === 2 || (selectedSites.length === 1 && cursorElevInfo)) && (
            (() => {
              const site1 = sites.find(s => s.id === selectedSites[0]);
              let site2Lat, site2Lng;
              
              if (selectedSites.length === 2) {
                const site2 = sites.find(s => s.id === selectedSites[1]);
                if (!site2) return null;
                site2Lat = site2.lat;
                site2Lng = site2.lng;
              } else if (cursorElevInfo) {
                site2Lat = cursorElevInfo.lat;
                site2Lng = cursorElevInfo.lng;
              } else {
                return null;
              }
              
              if (site1 && site2Lat && site2Lng) {
                const distanceKm = calculateDistanceKm(site1.lat, site1.lng, site2Lat, site2Lng);
                const pathLoss = calculatePathLossAtDistance(distanceKm, analysisFreq, 30, 30, 'los');
                const prx = analysisTxPowerW > 0 ? (10 * Math.log10(analysisTxPowerW * 1000)) + analysisTxGain + analysisRxGain - pathLoss : -150;
                const isViable = prx >= analysisRxSens;
                
                const bandwidthHz = 12.5 * 1000;
                const thermalNoiseDBm = -174 + 10 * Math.log10(bandwidthHz);
                const snr = prx - thermalNoiseDBm;

                return (
                  <Polyline 
                    positions={[[site1.lat, site1.lng], [site2Lat, site2Lng]]}
                    color="#3b82f6"
                    weight={4}
                    dashArray="5, 10"
                    className="animate-pulse"
                  >
                    <Tooltip permanent direction="center" className="bg-blue-50/90 backdrop-blur-sm border border-blue-200 shadow-sm text-center px-2 py-1 rounded">
                      <div className="text-[10px] font-mono leading-tight flex flex-col items-center">
                        <span className="font-bold text-blue-800">{distanceKm.toFixed(1)} km</span>
                        <span className={isViable ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>{isViable ? 'TEST: GOOD' : 'TEST: FAIL'}</span>
                        <span className="text-blue-600">{prx.toFixed(1)} dBm</span>
                        <span className="text-indigo-600 font-bold mt-0.5">SNR: {snr.toFixed(1)} dB</span>
                      </div>
                    </Tooltip>
                  </Polyline>
                );
              }
              return null;
            })()
          )}

          {/* Draw Sites */}
          {sites.map(site => {
            const isSelected = selectedSites.includes(site.id);
            const bgColor = isSelected ? '#f59e0b' : (site.type === 'repeater' ? '#eab308' : '#2563eb');
            const borderRadius = site.type === 'repeater' ? '4px' : '50%';
            
            const siteIcon = L.divIcon({
              className: 'custom-div-icon',
              html: `<div style="background-color: ${bgColor}; width: 100%; height: 100%; border-radius: ${borderRadius}; border: ${isSelected ? '3px' : '2px'} solid white; box-shadow: 0 ${isSelected ? '4px 8px' : '2px 5px'} rgba(0,0,0,0.4); transition: all 0.2s;"></div>`,
              iconSize: isSelected ? [22, 22] : [18, 18],
              iconAnchor: isSelected ? [11, 11] : [9, 9]
            });

            return (
              <Marker 
                key={site.id} 
                position={[site.lat, site.lng]}
                icon={siteIcon}
                draggable={isSelected}
                eventHandlers={{
                  dragend: (e) => {
                    const marker = e.target;
                    const position = marker.getLatLng();
                    if (updateSite) {
                      updateSite({
                        ...site,
                        lat: position.lat,
                        lng: position.lng
                      });
                    }
                  }
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[190px]">
                    <h3 className="font-bold text-slate-800 text-sm mb-0.5">{site.name}</h3>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2 pb-1.5 border-b border-slate-100">
                      {site.radioType ? site.radioType.replace('-', ' ') : site.type.replace('-', ' ')}
                    </p>
                    
                    <div className="space-y-1 mb-3 text-xs text-slate-600">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Power:</span> 
                        <span className="font-mono font-medium text-slate-800">{site.txPowerW ? `${site.txPowerW} W` : '50 W'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">TX Freq:</span> 
                        <span className="font-mono font-medium text-blue-600">{site.txFreqMHz ? `${site.txFreqMHz} MHz` : '155.5 MHz'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">RX Freq:</span> 
                        <span className="font-mono font-medium text-blue-600">{site.rxFreqMHz ? `${site.rxFreqMHz} MHz` : '150.5 MHz'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Coords:</span> 
                        <span className="font-mono font-medium text-slate-700">{site.lat.toFixed(3)}°, {site.lng.toFixed(3)}°</span>
                      </div>
                    </div>
                    
                    {isSelected && (
                      <div className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] p-1.5 rounded mb-3 flex flex-col items-center justify-center border border-amber-200 dark:border-amber-800/50 text-center">
                        <MapPin className="w-3 h-3 mb-1" />
                        <span>Move cursor to test links.</span>
                        <span className="font-bold mt-1">Click anywhere on map to move site!</span>
                      </div>
                    )}
                    
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleSiteSelection(site.id);
                      }}
                      className={`w-full py-1.5 text-xs font-bold text-white rounded transition ${
                        isSelected 
                          ? 'bg-amber-500 hover:bg-amber-600' 
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {isSelected ? 'Deselect Station' : 'Select for Analysis'}
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Floating Hypsometric Elevation Legend (Bottom Right) */}
      {(mapLayerType === 'topo' || isElevationInspectorActive) && showDEMLegend && (
        <div className="absolute bottom-6 right-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-800 p-3 rounded-xl z-[1000] shadow-xl text-xs w-64">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-slate-800 dark:text-slate-200 text-[11px] flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-amber-600" />
              Hypsometric Elevation Scale
            </span>
            <button 
              onClick={() => setShowDEMLegend(false)}
              className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              ✕
            </button>
          </div>

          <div>
            <div className="h-3.5 w-full rounded-md shadow-inner bg-gradient-to-r from-[#228b22] via-[#ffeb3b] via-[#e65100] via-[#57534e] to-[#f8fafc] mb-1.5"></div>
            <div className="flex justify-between text-[9px] font-mono text-slate-500 dark:text-slate-400">
              <span>0m</span>
              <span>500m</span>
              <span>1500m</span>
              <span>3500m</span>
              <span>&gt;6000m</span>
            </div>
          </div>
        </div>
      )}

      {/* Floating DEM Elevation & Slope Inspector Telemetry (Bottom Center / Left) */}
      {(clickedElevInfo || (isElevationInspectorActive && cursorElevInfo)) && (
        <div className="absolute top-16 right-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-amber-500/50 p-3.5 rounded-xl z-[1000] shadow-2xl w-80 text-xs animate-fadeIn">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400">
                <Mountain className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                  {clickedElevInfo ? 'Sampled Terrain Point' : 'Live Terrain Cursor'}
                </h4>
                <p className="text-[10px] text-slate-500 font-mono">
                  {(clickedElevInfo || cursorElevInfo)?.lat.toFixed(4)}°N, {(clickedElevInfo || cursorElevInfo)?.lng.toFixed(4)}°E
                </p>
              </div>
            </div>
            {clickedElevInfo && (
              <button 
                onClick={() => setClickedElevInfo(null)}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>

          {(() => {
            const info = clickedElevInfo || cursorElevInfo;
            if (!info) return null;
            return (
              <div className="space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Elevation</span>
                    <span className="text-base font-extrabold text-blue-600 dark:text-blue-400 font-mono">
                      {info.elevationM} <span className="text-xs font-normal">m</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono">({info.elevationFt} ft)</span>
                  </div>

                  <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Slope & Aspect</span>
                    <span className="text-base font-extrabold text-amber-600 dark:text-amber-400 font-mono">
                      {info.slopeDeg}° <span className="text-xs font-normal">({info.slopePercent}%)</span>
                    </span>
                    <span className="text-[10px] text-slate-500 block font-mono">Facing {info.aspectCompass} ({info.aspectDeg}°)</span>
                  </div>
                </div>

                <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 rounded-lg">
                  <span className="text-[9px] font-bold uppercase text-emerald-700 dark:text-emerald-300 block mb-0.5">Topographic Classification</span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 text-xs">{info.terrainCategory}</p>
                  <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-1">
                    Radio Clutter Height: <strong className="font-mono">{info.recommendedClutterM}m</strong>
                  </p>
                </div>

                <div className="flex gap-1.5 pt-1">
                  <button
                    onClick={() => {
                      setCurrentView('los');
                    }}
                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold transition flex items-center justify-center gap-1"
                  >
                    <Activity className="w-3 h-3" />
                    Open LOS Profiler
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      
      <MapManagerModal 
        isOpen={isMapManagerOpen} 
        onClose={() => setIsMapManagerOpen(false)} 
        isOnline={isOnline && !mapLayerType.startsWith('offline')} 
      />
    </div>
  );
}
