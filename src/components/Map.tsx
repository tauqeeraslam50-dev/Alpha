import React, { useState, useRef, useEffect } from 'react';
import {
  Map as MapIcon,
  Wifi,
  WifiOff,
  Layers,
  Globe,
  Radio,
  MapPin,
  Compass,
  Check,
  ChevronDown,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { cn } from '../lib/utils';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { OfflineMapEngine } from './OfflineMapEngine';
import { MapSearchBar } from './MapSearchBar';
import { ONLINE_MAP_LAYERS, DEFAULT_ONLINE_LAYER_ID, type MapLayerConfig } from '../gis/mapLayers';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Search target icon
const searchTargetIcon = L.divIcon({
  className: 'rnms-search-target-leaflet',
  html: `
    <div style="position: relative; width: 32px; height: 32px; transform: translate(-16px, -32px);">
      <div style="background-color: #ef4444; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">
        <div style="transform: rotate(45deg); width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
      </div>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Site Icons creator
function createSiteIcon(type: string) {
  const typeColors: Record<string, string> = {
    repeater: '#10b981', // green
    'base-station': '#2563eb', // blue
    subscriber: '#f59e0b', // amber
    'microwave-node': '#8b5cf6', // purple
    relay: '#06b6d4', // cyan
  };
  const color = typeColors[type] || '#3b82f6';

  return L.divIcon({
    className: 'rnms-site-leaflet-marker',
    html: `
      <div style="position: relative; width: 26px; height: 26px; transform: translate(-13px, -13px);">
        <div style="background-color: ${color}; width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
          <svg style="width: 14px; height: 14px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20m0-20l7 7m-7-7L5 9m7 13l7-7m-7 7l-7-7"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

type MapMode = 'online' | 'offline';

// Leaflet Map Camera controller
function LeafletMapController({
  targetLoc,
}: {
  targetLoc: { lat: number; lng: number; zoom?: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (targetLoc) {
      map.flyTo([targetLoc.lat, targetLoc.lng], targetLoc.zoom || 13, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    }
  }, [targetLoc, map]);

  return null;
}

export function Map() {
  const { theme, sites } = useAppContext();
  const [mode, setModeState] = useState<MapMode>(() => {
    return (localStorage.getItem('rnms_map_mode') as MapMode) || 'online';
  });
  const [activeLayerId, setActiveLayerId] = useState<string>(() => {
    return localStorage.getItem('rnms_online_layer_id') || DEFAULT_ONLINE_LAYER_ID;
  });
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('Offline GIS engine ready');

  const setMode = (newMode: MapMode) => {
    setModeState(newMode);
    localStorage.setItem('rnms_map_mode', newMode);
  };

  const handleLayerChange = (layerId: string) => {
    setActiveLayerId(layerId);
    localStorage.setItem('rnms_online_layer_id', layerId);
  };

  // Search Pin State
  const [targetLocation, setTargetLocation] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    name: string;
    category?: string;
    elevationM?: number;
  } | null>(null);

  const layerMenuRef = useRef<HTMLDivElement>(null);
  const activeLayer = ONLINE_MAP_LAYERS[activeLayerId] || ONLINE_MAP_LAYERS[DEFAULT_ONLINE_LAYER_ID];

  // Close Layer menu when clicked outside
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (layerMenuRef.current && !layerMenuRef.current.contains(e.target as Node)) {
        setIsLayerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleSelectLocation = (loc: {
    lat: number;
    lng: number;
    zoom?: number;
    name: string;
    category?: string;
    elevationM?: number;
  }) => {
    setTargetLocation(loc);
  };

  const handleClearPin = () => {
    setTargetLocation(null);
  };

  return (
    <section
      className={cn(
        'h-full flex flex-col p-3 sm:p-4 gap-3 select-none',
        theme === 'light' ? 'text-slate-900' : 'text-slate-100'
      )}
    >
      {/* Top Header & Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
            <MapIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <span>GIS Map System</span>
              <span
                className={cn(
                  'text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase',
                  mode === 'online'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                )}
              >
                {mode === 'online' ? 'Online Mode (English)' : 'Offline GIS Engine'}
              </span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {mode === 'online'
                ? 'Global English map baselayers with geocoding search & network overlays'
                : 'Standalone offline PMTiles & PNG tile renderer with tactical tools'}
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <div
          className={cn(
            'flex items-center rounded-xl border p-1 shadow-xs',
            theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          )}
        >
          <button
            type="button"
            onClick={() => setMode('online')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition',
              mode === 'online'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Online Map (English)</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('offline')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition',
              mode === 'offline'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            <WifiOff className="w-3.5 h-3.5" />
            <span>Offline Map Engine</span>
          </button>
        </div>
      </div>

      {/* Main Map Container */}
      <div className="flex-1 min-h-0 rounded-2xl overflow-hidden border border-slate-300 dark:border-slate-800 bg-slate-200 dark:bg-slate-950 relative shadow-inner">
        {/* Online Map Container (Persistent) */}
        <div className={cn('w-full h-full relative', mode === 'online' ? 'block' : 'hidden')}>
          <MapContainer
            center={[30.3753, 69.3451]}
            zoom={6}
            className="w-full h-full z-0"
            zoomControl={false}
          >
            <LeafletMapController targetLoc={targetLocation} />

            {/* Primary Base Tile Layer */}
            <TileLayer
              key={activeLayer.id}
              attribution={activeLayer.attribution}
              url={activeLayer.url}
              subdomains={activeLayer.subdomains || []}
              maxZoom={activeLayer.maxZoom}
            />

            {/* Optional Hybrid English Labels/Boundaries Overlay */}
            {activeLayer.overlayUrl && (
              <TileLayer
                key={`${activeLayer.id}-overlay`}
                attribution={activeLayer.overlayAttribution || ''}
                url={activeLayer.overlayUrl}
                maxZoom={activeLayer.maxZoom}
              />
            )}

            {/* Site Markers */}
            {sites.map((site) => (
              <Marker
                key={site.id}
                position={[site.lat, site.lng]}
                icon={createSiteIcon(site.type)}
              >
                <Popup>
                  <div className="p-1 font-sans">
                    <div className="font-bold text-sm text-slate-800">{site.name}</div>
                    <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">
                      {site.type.replace('-', ' ')}
                    </div>
                    <div className="text-xs text-slate-600 space-y-0.5 font-mono">
                      <div>Elev: {site.elevation}m AMSL</div>
                      <div>
                        Coords: {site.lat.toFixed(4)}°, {site.lng.toFixed(4)}°
                      </div>
                      {site.txFreqMHz && <div>TX: {site.txFreqMHz} MHz</div>}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Interactive Search Pin */}
            {targetLocation && (
              <Marker
                position={[targetLocation.lat, targetLocation.lng]}
                icon={searchTargetIcon}
              >
                <Popup autoPan>
                  <div className="p-1.5 font-sans min-w-[180px]">
                    <div className="font-bold text-sm text-slate-900">{targetLocation.name}</div>
                    <div className="text-[10px] font-bold text-rose-600 uppercase mb-1.5">
                      {targetLocation.category || 'Target Location'}
                    </div>
                    <div className="text-xs text-slate-600 font-mono space-y-1">
                      <div>
                        Lat: <b>{targetLocation.lat.toFixed(5)}°</b>
                      </div>
                      <div>
                        Lng: <b>{targetLocation.lng.toFixed(5)}°</b>
                      </div>
                      {targetLocation.elevationM ? (
                        <div>
                          Elevation: <b>{targetLocation.elevationM}m</b>
                        </div>
                      ) : null}
                    </div>
                    <div className="pt-2 mt-2 border-t border-slate-200 flex justify-between gap-1">
                      <button
                        type="button"
                        onClick={handleClearPin}
                        className="text-[10px] text-rose-600 hover:underline font-bold"
                      >
                        Remove Pin
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `${targetLocation.lat.toFixed(5)}, ${targetLocation.lng.toFixed(5)}`
                          );
                        }}
                        className="text-[10px] text-blue-600 hover:underline font-bold"
                      >
                        Copy Coords
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Floating Top Controls Overlay */}
          <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            {/* Universal Search Bar */}
            <div className="pointer-events-auto w-full max-w-sm sm:max-w-md">
              <MapSearchBar
                isOnline={true}
                hasActivePin={Boolean(targetLocation)}
                onSelectLocation={handleSelectLocation}
                onClearPin={handleClearPin}
                placeholder="Search cities worldwide, Pakistani towns, sites, coordinates..."
              />
            </div>

            {/* English Layer Switcher Menu */}
            <div ref={layerMenuRef} className="relative pointer-events-auto">
              <button
                type="button"
                onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
                className="flex items-center gap-2 px-3 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>{activeLayer.name}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {isLayerMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl p-1.5 z-[500] space-y-1 animate-in fade-in zoom-in-95 duration-100 text-xs">
                  <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    English Map Baselayers
                  </div>
                  {Object.values(ONLINE_MAP_LAYERS).map((layer) => {
                    const isSelected = layer.id === activeLayerId;
                    return (
                      <button
                        key={layer.id}
                        type="button"
                        onClick={() => handleLayerChange(layer.id)}
                        className={cn(
                          'w-full text-left px-2.5 py-2 rounded-lg flex items-center justify-between transition',
                          isSelected
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 font-bold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        )}
                      >
                        <div>
                          <div className="font-semibold">{layer.name}</div>
                          <div className="text-[10px] text-slate-400 font-normal">
                            {layer.description}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Offline Map Container (Persistent) */}
        <div className={cn('w-full h-full relative', mode === 'offline' ? 'block' : 'hidden')}>
          <OfflineMapEngine onStatus={setStatus} />
        </div>
      </div>

      {/* Footer Info / Status */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>{mode === 'online' ? `Online Layer: ${activeLayer.name}` : status}</span>
        </div>
        <div className="text-right hidden sm:block">
          <span>
            {sites.length} Active RF Sites Overlaid · {mode === 'online' ? 'English Base Maps' : 'Offline GIS'}
          </span>
        </div>
      </div>
    </section>
  );
}
