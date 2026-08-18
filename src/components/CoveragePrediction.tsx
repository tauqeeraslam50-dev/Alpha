import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import { Wifi, Target, Activity, Settings, Radio } from 'lucide-react';
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
});
L.Marker.prototype.options.icon = DefaultIcon;

// Component to adjust map bounds to fit site
function MapPanner({ lat, lng }: { lat: number, lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], 11);
  }, [lat, lng, map]);
  return null;
}

export function CoveragePrediction() {
  const { sites } = useAppContext();
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites.length > 0 ? sites[0].id : '');
  const [frequency, setFrequency] = useState<number>(155.5);
  const [txPowerW, setTxPowerW] = useState<number>(50);
  const [txGain, setTxGain] = useState<number>(6);
  const [rxSens, setRxSens] = useState<number>(-95);
  const [environment, setEnvironment] = useState<string>('suburban');

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  // Auto-populate when site changes if it has radio properties
  useEffect(() => {
    if (selectedSite) {
      if (selectedSite.txPowerW) setTxPowerW(selectedSite.txPowerW);
      if (selectedSite.radioType === 'base') setTxGain(6);
      else if (selectedSite.radioType === 'vehicular') setTxGain(3);
      else if (selectedSite.radioType === 'walkie-talkie') setTxGain(0);
    }
  }, [selectedSiteId]);

  // Calculate coverage radii
  const calculateRadiusKm = (targetRxDbm: number) => {
    if (!selectedSite || txPowerW <= 0) return 0;
    
    // 1. Calculate EIRP
    const txPowerDBm = 10 * Math.log10(txPowerW * 1000);
    const eirp = txPowerDBm + txGain;
    
    // 2. Allowable path loss
    const allowedLoss = eirp - targetRxDbm;
    
    // 3. Subtract environment clutter/terrain loss
    let envLoss = 0;
    if (environment === 'rural') envLoss = 15;
    else if (environment === 'suburban') envLoss = 25;
    else if (environment === 'urban') envLoss = 35;
    else if (environment === 'dense-urban') envLoss = 45;
    
    const maxFspl = allowedLoss - envLoss;
    
    // 4. Reverse FSPL: 20*log10(d) = maxFspl - 20*log10(f) - 32.44
    // log10(d) = (maxFspl - 20*log10(f) - 32.44) / 20
    const log10d = (maxFspl - 20 * Math.log10(frequency) - 32.44) / 20;
    const distanceKm = Math.pow(10, log10d);
    
    // Cap at 200km for map sanity
    return Math.min(Math.max(distanceKm, 0.1), 200); 
  };

  // Signal tiers
  const radiusEdge = calculateRadiusKm(rxSens); // Edge of coverage (-95 dBm)
  const radiusGood = calculateRadiusKm(rxSens + 10); // Good coverage (-85 dBm)
  const radiusStrong = calculateRadiusKm(rxSens + 25); // Strong coverage (-70 dBm)

  return (
    <div className="flex h-full w-full">
      {/* Sidebar Panel */}
      <div className="w-80 bg-white border-r border-slate-200 flex flex-col z-10 shadow-[4px_0_15px_rgba(0,0,0,0.05)]">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center">
          <div className="w-8 h-8 rounded bg-blue-100 text-blue-600 flex items-center justify-center mr-3 shadow-sm">
            <Wifi className="w-4 h-4" />
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-sm">Coverage Prediction</h2>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">RF Heatmap Engine</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Site Selection */}
          <div className="space-y-2">
            <label className="flex items-center text-xs font-bold text-slate-600 uppercase tracking-wider">
              <Target className="w-3.5 h-3.5 mr-1.5" />
              Target Site
            </label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="w-full text-sm p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 bg-slate-50 font-medium"
            >
              {sites.length === 0 && <option value="">No sites available</option>}
              {sites.map(site => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
            {selectedSite && (
              <div className="text-xs text-slate-500 font-mono mt-1 px-1">
                {selectedSite.lat.toFixed(4)}, {selectedSite.lng.toFixed(4)}
              </div>
            )}
          </div>

          {/* RF Parameters */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="flex items-center text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              <Radio className="w-3.5 h-3.5 mr-1.5" />
              Transmitter Details
            </label>
            
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Frequency (MHz)</span>
                <span className="text-[10px] font-bold text-blue-600">{frequency}</span>
              </div>
              <input 
                type="range" min="30" max="5000" step="0.1" 
                value={frequency} onChange={e => setFrequency(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tx Power (W)</label>
                <input 
                  type="number" step="0.1"
                  value={txPowerW} onChange={e => setTxPowerW(Number(e.target.value))}
                  className="w-full text-sm p-1.5 border border-slate-300 rounded font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tx Gain (dBi)</label>
                <input 
                  type="number" step="0.1"
                  value={txGain} onChange={e => setTxGain(Number(e.target.value))}
                  className="w-full text-sm p-1.5 border border-slate-300 rounded font-mono"
                />
              </div>
            </div>
          </div>

          {/* Environment & Receiver */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <label className="flex items-center text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              <Activity className="w-3.5 h-3.5 mr-1.5" />
              Propagation Model
            </label>
            
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Environment Clutter</label>
              <select
                value={environment}
                onChange={e => setEnvironment(e.target.value)}
                className="w-full text-sm p-1.5 border border-slate-300 rounded font-medium bg-white"
              >
                <option value="los">Line of Sight (Free Space)</option>
                <option value="rural">Rural / Open Area</option>
                <option value="suburban">Suburban</option>
                <option value="urban">Urban</option>
                <option value="dense-urban">Dense Urban</option>
              </select>
            </div>
            
            <div className="pt-2">
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rx Sensitivity (dBm)</label>
              <input 
                type="number"
                value={rxSens} onChange={e => setRxSens(Number(e.target.value))}
                className="w-full text-sm p-1.5 border border-slate-300 rounded font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                The minimum signal strength required for the receiver to decode the transmission.
              </p>
            </div>
          </div>
        </div>
        
        {/* Statistics Panel */}
        <div className="p-4 bg-slate-900 text-white mt-auto">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center">
            <Target className="w-3 h-3 mr-1" />
            Estimated Radius
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
                <span className="text-xs text-slate-300">Strong (&gt;{rxSens + 25} dBm)</span>
              </div>
              <span className="font-mono text-sm font-bold">{radiusStrong.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
                <span className="text-xs text-slate-300">Good (&gt;{rxSens + 10} dBm)</span>
              </div>
              <span className="font-mono text-sm font-bold">{radiusGood.toFixed(1)} km</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-700 mt-1">
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-rose-500/50 border border-rose-500 mr-2"></div>
                <span className="text-xs font-bold text-rose-400">Edge ({rxSens} dBm)</span>
              </div>
              <span className="font-mono text-sm font-bold text-rose-400">{radiusEdge.toFixed(1)} km</span>
            </div>
          </div>
        </div>
      </div>

      {/* Map Area */}
      <div className="flex-1 bg-slate-200 relative">
        <MapContainer 
          center={selectedSite ? [selectedSite.lat, selectedSite.lng] : [33.6844, 73.0479]} 
          zoom={11} 
          className="w-full h-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          
          {selectedSite && <MapPanner lat={selectedSite.lat} lng={selectedSite.lng} />}
          
          {selectedSite && radiusEdge > 0 && (
            <>
              {/* Edge Coverage */}
              <Circle 
                center={[selectedSite.lat, selectedSite.lng]}
                radius={radiusEdge * 1000} // meters
                pathOptions={{ 
                  color: '#f43f5e', 
                  fillColor: '#f43f5e', 
                  fillOpacity: 0.1,
                  weight: 1,
                  dashArray: '5, 10'
                }}
              />
              
              {/* Good Coverage */}
              <Circle 
                center={[selectedSite.lat, selectedSite.lng]}
                radius={radiusGood * 1000}
                pathOptions={{ 
                  color: '#f59e0b', 
                  fillColor: '#f59e0b', 
                  fillOpacity: 0.15,
                  weight: 1
                }}
              />
              
              {/* Strong Coverage */}
              <Circle 
                center={[selectedSite.lat, selectedSite.lng]}
                radius={radiusStrong * 1000}
                pathOptions={{ 
                  color: '#10b981', 
                  fillColor: '#10b981', 
                  fillOpacity: 0.25,
                  weight: 2
                }}
              />
              
              {/* Site Marker */}
              <Marker position={[selectedSite.lat, selectedSite.lng]}>
                <Popup>
                  <div className="text-sm font-bold text-slate-800">{selectedSite.name}</div>
                  <div className="text-xs text-slate-500">Max Radius: {radiusEdge.toFixed(1)} km</div>
                </Popup>
              </Marker>
            </>
          )}
        </MapContainer>
      </div>
    </div>
  );
}
