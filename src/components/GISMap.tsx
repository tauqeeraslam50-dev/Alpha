import React, { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { Activity, ArrowRight } from 'lucide-react';
import { calculateDistanceKm, calculateFSPL, calculateEarthBulge } from '../lib/utils';
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

export function GISMap() {
  const { sites, links, addLink } = useAppContext();
  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [analysisFreq, setAnalysisFreq] = useState<number>(155.5);
  const [radioType, setRadioType] = useState<string>('base');
  const [analysisTxPowerW, setAnalysisTxPowerW] = useState<number>(50);
  const [analysisTxGain, setAnalysisTxGain] = useState<number>(6);
  const [analysisRxGain, setAnalysisRxGain] = useState<number>(6);
  const [analysisRxSens, setAnalysisRxSens] = useState<number>(-95);

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

  // Handle case where no sites exist to prevent crash
  const defaultCenter: [number, number] = sites.length > 0 
    ? [sites[0].lat, sites[0].lng] 
    : [30.3753, 69.3451]; // Default to Pakistan if no sites

  return (
    <div className="flex flex-col h-full relative">
      <div className="absolute top-6 right-6 bg-white/95 backdrop-blur border border-slate-200 p-4 rounded-lg z-[1000] shadow-md">
        <h3 className="text-slate-800 font-bold mb-3 text-xs uppercase tracking-widest">GIS Topology</h3>
        <div className="flex flex-col gap-3 text-sm text-slate-700 font-medium">
          <div className="flex items-center"><div className="w-4 h-4 bg-blue-600 rounded-full mr-3 shadow-sm border-2 border-white"></div>Base Station</div>
          <div className="flex items-center"><div className="w-4 h-4 bg-indigo-500 rounded-sm mr-3 shadow-sm border-2 border-white"></div>Repeater</div>
          <div className="flex items-center"><div className="w-4 h-1 bg-emerald-500 mr-3 shadow-sm"></div>Saved Link</div>
          <div className="flex items-center"><div className="w-4 h-1 border-t-2 border-dashed border-blue-500 mr-3 shadow-sm"></div>Analysis Link</div>
        </div>
      </div>

      {selectedSites.length > 0 && (
        <div className="absolute bottom-6 left-6 bg-white/95 backdrop-blur border border-slate-200 p-5 rounded-xl z-[1000] shadow-xl w-80">
          <h3 className="text-slate-800 font-bold mb-3 text-sm flex items-center">
            <Activity className="w-4 h-4 mr-2 text-blue-600" />
            Link Analysis Tool
          </h3>
          
          {selectedSites.length === 1 && (
            <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded border border-slate-100">
              Selected: <strong className="text-slate-700">{sites.find(s => s.id === selectedSites[0])?.name}</strong><br/><br/>
              Select a second site on the map to calculate line of sight and path loss.
            </p>
          )}

          {selectedSites.length === 2 && (
            (() => {
              const site1 = sites.find(s => s.id === selectedSites[0]);
              const site2 = sites.find(s => s.id === selectedSites[1]);
              if (!site1 || !site2) return null;
              
              const distance = calculateDistanceKm(site1.lat, site1.lng, site2.lat, site2.lng);
              const fspl = calculateFSPL(distance, analysisFreq);
              const bulge = calculateEarthBulge(distance);
              
              // Simplistic theoretical clearance mock (assumes terrain is roughly sea-level between sites)
              const avgElev = (site1.elevation + site2.elevation) / 2;
              const losClearance = avgElev - bulge;
              const hasLOS = losClearance > 5;
              
              // Calculate received power using link budget equation
              const txCableLossDB = 1.5;
              const rxCableLossDB = 1.5;
              
              // Convert Watts to dBm (10 * log10(mW))
              const txPowerDBm = analysisTxPowerW > 0 ? 10 * Math.log10(analysisTxPowerW * 1000) : 0;
              const prx = txPowerDBm + analysisTxGain + analysisRxGain - txCableLossDB - rxCableLossDB - fspl;
              
              // Assume a standard receiver sensitivity of -95 dBm
              const isLinkViable = prx >= analysisRxSens;
              
              return (
                <div className="space-y-3 animate-in fade-in zoom-in duration-200">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-slate-700 truncate w-24" title={site1.name}>{site1.name}</span>
                    <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                    <span className="font-semibold text-slate-700 truncate w-24 text-right" title={site2.name}>{site2.name}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Radio Eqpt Type</label>
                      <select 
                        value={radioType}
                        onChange={(e) => handleRadioTypeChange(e.target.value)}
                        className="w-full text-xs p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 bg-white"
                      >
                        <option value="base">Base Station (High Power)</option>
                        <option value="vehicular">Vehicular (Medium Power)</option>
                        <option value="walkie-talkie">Walkie Talkie (Handheld)</option>
                        <option value="custom">Custom Configuration</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Freq (MHz)</label>
                      <input 
                        type="number" 
                        value={analysisFreq} 
                        onChange={(e) => setAnalysisFreq(Number(e.target.value))} 
                        className="w-full text-xs p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tx Pwr (W)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={analysisTxPowerW} 
                        onChange={(e) => {
                          setAnalysisTxPowerW(Number(e.target.value));
                          setRadioType('custom');
                        }} 
                        className="w-full text-xs p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tx Gain (dBi)</label>
                      <input 
                        type="number" 
                        value={analysisTxGain} 
                        onChange={(e) => {
                          setAnalysisTxGain(Number(e.target.value));
                          setRadioType('custom');
                        }} 
                        className="w-full text-xs p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rx Gain (dBi)</label>
                      <input 
                        type="number" 
                        value={analysisRxGain} 
                        onChange={(e) => {
                          setAnalysisRxGain(Number(e.target.value));
                          setRadioType('custom');
                        }} 
                        className="w-full text-xs p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rx Sensitivity (dBm)</label>
                      <input 
                        type="number" 
                        value={analysisRxSens} 
                        onChange={(e) => setAnalysisRxSens(Number(e.target.value))} 
                        className="w-full text-xs p-1.5 border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-mono"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      <div className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Distance</div>
                      <div className="text-sm font-bold text-slate-800">{distance.toFixed(2)} <span className="text-xs font-medium text-slate-500">km</span></div>
                    </div>
                    <div className="bg-slate-50 p-2 rounded border border-slate-100">
                      <div className="text-[10px] text-slate-500 font-bold uppercase mb-0.5">Path Loss</div>
                      <div className="text-sm font-bold text-slate-800">{fspl.toFixed(1)} <span className="text-xs font-medium text-slate-500">dB</span></div>
                    </div>
                    <div className={`p-2 rounded border ${isLinkViable ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className={`text-[10px] font-bold uppercase mb-0.5 ${isLinkViable ? 'text-emerald-600' : 'text-rose-600'}`}>Received Power</div>
                      <div className={`text-sm font-bold ${isLinkViable ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {prx.toFixed(1)} <span className="text-xs font-medium opacity-80">dBm</span>
                      </div>
                    </div>
                    <div className={`p-2 rounded border ${hasLOS && isLinkViable ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                      <div className={`text-[10px] font-bold uppercase mb-0.5 ${hasLOS && isLinkViable ? 'text-emerald-600' : 'text-rose-600'}`}>Link Status</div>
                      <div className={`text-sm font-bold ${hasLOS && isLinkViable ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {hasLOS && isLinkViable ? 'Viable' : (!hasLOS ? 'No LOS' : 'Signal Weak')}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4 pt-2 border-t border-slate-100">
                    <button 
                      onClick={() => setSelectedSites([])}
                      className="flex-1 py-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50 transition"
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
                      Save Link
                    </button>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      <div className="flex-1 w-full h-full">
        <MapContainer 
          center={defaultCenter} 
          zoom={10} 
          className="w-full h-full z-0"
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <MapBounds sites={sites} />

          {/* Draw Saved Links */}
          {links.map(link => {
            const source = sites.find(s => s.id === link.sourceSiteId);
            const target = sites.find(s => s.id === link.targetSiteId);
            if (!source || !target) return null;
            return (
              <Polyline 
                key={link.id} 
                positions={[[source.lat, source.lng], [target.lat, target.lng]]}
                color="#10b981"
                weight={3}
                dashArray="10, 10"
              />
            );
          })}

          {/* Draw Temporary Analysis Link */}
          {selectedSites.length === 2 && (
            (() => {
              const site1 = sites.find(s => s.id === selectedSites[0]);
              const site2 = sites.find(s => s.id === selectedSites[1]);
              if (site1 && site2) {
                return (
                  <Polyline 
                    positions={[[site1.lat, site1.lng], [site2.lat, site2.lng]]}
                    color="#3b82f6"
                    weight={4}
                    dashArray="5, 10"
                    className="animate-pulse"
                  />
                );
              }
              return null;
            })()
          )}

          {/* Draw Sites */}
          {sites.map(site => {
            const isSelected = selectedSites.includes(site.id);
            // Custom icon based on site type and selection
            const bgColor = isSelected ? '#f59e0b' : (site.type === 'repeater' ? '#6366f1' : '#2563eb');
            const borderRadius = site.type === 'repeater' ? '4px' : '50%';
            
            const siteIcon = L.divIcon({
              className: 'custom-div-icon',
              html: `<div style="background-color: ${bgColor}; width: 100%; height: 100%; border-radius: ${borderRadius}; border: ${isSelected ? '3px' : '2px'} solid white; box-shadow: 0 ${isSelected ? '4px 8px' : '2px 5px'} rgba(0,0,0,0.3); transition: all 0.2s;"></div>`,
              iconSize: isSelected ? [20, 20] : [16, 16],
              iconAnchor: isSelected ? [10, 10] : [8, 8]
            });

            return (
              <Marker 
                key={site.id} 
                position={[site.lat, site.lng]}
                icon={siteIcon}
              >
                <Popup>
                  <div className="p-1 min-w-[140px]">
                    <h3 className="font-bold text-slate-800 text-sm mb-1">{site.name}</h3>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-2 pb-2 border-b border-slate-100">{site.type.replace('-', ' ')}</p>
                    <p className="text-xs text-slate-600 mb-1 flex justify-between">
                      <span className="text-slate-400">Elevation:</span> 
                      <span className="font-mono font-medium">{site.elevation}m</span>
                    </p>
                    <p className="text-xs text-slate-600 mb-3 flex justify-between">
                      <span className="text-slate-400">Coords:</span> 
                      <span className="font-mono font-medium">{site.lat.toFixed(3)}, {site.lng.toFixed(3)}</span>
                    </p>
                    
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
                      {isSelected ? 'Deselect Site' : 'Select for Analysis'}
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
