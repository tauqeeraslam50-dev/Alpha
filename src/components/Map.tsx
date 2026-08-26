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
  Download,
  Cable,
  Zap,
  X,
  Activity,
  Trash2,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Mountain,
  Link2,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { cn, calculateDistanceKm, calculateFSPL, calculateBearing } from '../lib/utils';
import { analyzeLOS, type LOSAnalysisResult } from '../lib/losUtils';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { OfflineMapEngine } from './OfflineMapEngine';
import { MapSearchBar } from './MapSearchBar';
import { MapDownloadModal } from './MapDownloadModal';
import { ONLINE_MAP_LAYERS, DEFAULT_ONLINE_LAYER_ID, type MapLayerConfig } from '../gis/mapLayers';
import { type Site, type RFLink } from '../types';

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

// Site Icons creator with Cisco Packet Tracer selection animation
function createSiteIcon(type: string, isConnectingSource = false) {
  const typeColors: Record<string, string> = {
    repeater: '#10b981', // green
    'base-station': '#2563eb', // blue
    subscriber: '#f59e0b', // amber
    'microwave-node': '#8b5cf6', // purple
    relay: '#06b6d4', // cyan
  };
  const color = typeColors[type] || '#3b82f6';

  const pulseRing = isConnectingSource
    ? `<div style="position: absolute; top: -8px; left: -8px; width: 42px; height: 42px; border-radius: 50%; border: 2.5px solid #06b6d4; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite; box-shadow: 0 0 12px #06b6d4;"></div>`
    : '';

  return L.divIcon({
    className: 'rnms-site-leaflet-marker',
    html: `
      <div style="position: relative; width: 26px; height: 26px; transform: translate(-13px, -13px);">
        ${pulseRing}
        <div style="background-color: ${color}; width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
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

// RF Link Midpoint Badge creator with Terrain Blocked indicator
function createLinkBadgeIcon(
  distanceKm: number,
  snr: number,
  status: string,
  color: string,
  isBlocked = false
) {
  const iconEmoji = isBlocked ? '🔴' : color === '#f59e0b' ? '🟡' : '🟢';
  const label = isBlocked ? 'BLOCKED (NO LOS)' : `${snr.toFixed(1)} dB SNR`;
  return L.divIcon({
    className: 'rnms-link-leaflet-badge',
    html: `
      <div style="transform: translate(-50%, -50%); background: rgba(15, 23, 42, 0.95); border: 1.5px solid ${color}; border-radius: 6px; padding: 2px 7px; color: #f8fafc; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.5); backdrop-filter: blur(4px); white-space: nowrap; cursor: pointer;">
        <span>${iconEmoji}</span>
        <span>${distanceKm.toFixed(1)} km</span>
        <span style="color: #64748b;">•</span>
        <span style="color: ${color}; font-weight: 800;">${label}</span>
      </div>
    `,
    iconSize: [160, 24],
    iconAnchor: [80, 12],
  });
}

// Terrain Obstruction Peak Marker creator
function createObstructionIcon(deficitM: number, distanceKm: number) {
  return L.divIcon({
    className: 'rnms-obstruction-leaflet-badge',
    html: `
      <div style="transform: translate(-50%, -50%); background: rgba(220, 38, 38, 0.95); border: 2px solid #ffffff; border-radius: 9999px; padding: 2px 8px; color: #ffffff; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 4px; box-shadow: 0 0 16px rgba(239, 68, 68, 0.9), 0 4px 8px rgba(0,0,0,0.5); backdrop-filter: blur(4px); white-space: nowrap; cursor: pointer;">
        <span>⚠️</span>
        <span>BLOCK +${deficitM.toFixed(0)}m</span>
      </div>
    `,
    iconSize: [130, 24],
    iconAnchor: [65, 12],
  });
}

type MapMode = 'online' | 'offline';

// Cisco Packet Tracer Live Wire Component with Real-Time Terrain Obstacle Preview
function createLiveWireBadgeIcon(
  distanceKm: number,
  isBlocked: boolean,
  deficitM: number,
  targetName?: string
) {
  const color = isBlocked ? '#ef4444' : '#06b6d4';
  const label = isBlocked
    ? `🔴 BLOCKED (+${deficitM.toFixed(0)}m Peak)`
    : `🟢 CLEAR LOS ${targetName ? `➔ ${targetName}` : ''}`;

  return L.divIcon({
    className: 'rnms-live-wire-badge',
    html: `
      <div style="transform: translate(-50%, -50%); background: rgba(15, 23, 42, 0.96); border: 2px solid ${color}; border-radius: 8px; padding: 3px 9px; color: #f8fafc; font-family: ui-monospace, monospace; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 6px; box-shadow: 0 0 16px ${color}80, 0 4px 10px rgba(0,0,0,0.6); backdrop-filter: blur(6px); white-space: nowrap; pointer-events: none; animation: pulse 1.5s infinite;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${color}; box-shadow: 0 0 8px ${color};"></span>
        <span>${distanceKm.toFixed(1)} km</span>
        <span style="color: #64748b;">•</span>
        <span style="color: ${color};">${label}</span>
      </div>
    `,
    iconSize: [230, 28],
    iconAnchor: [115, 14],
  });
}

function LiveWireLayer({
  isConnecting,
  source,
  sites,
}: {
  isConnecting: boolean;
  source: Site | null;
  sites: Site[];
}) {
  const [mousePos, setMousePos] = useState<[number, number] | null>(null);

  useMapEvents({
    mousemove: (e) => {
      if (isConnecting && source) {
        setMousePos([e.latlng.lat, e.latlng.lng]);
      }
    },
  });

  if (!isConnecting || !source || !mousePos) return null;

  // Snap to candidate target site if cursor is within ~12km
  const candidateSite = sites.find((s) => {
    if (s.id === source.id) return false;
    const d = calculateDistanceKm(mousePos[0], mousePos[1], s.lat, s.lng);
    return d < 12;
  });

  const targetCoords: [number, number] = candidateSite
    ? [candidateSite.lat, candidateSite.lng]
    : mousePos;
  const distanceKm = Math.max(
    0.1,
    calculateDistanceKm(source.lat, source.lng, targetCoords[0], targetCoords[1])
  );
  const freqMHz = source.txFreqMHz || (candidateSite ? candidateSite.txFreqMHz : 400) || 400;

  // Live real DEM Line-of-Sight analysis while wiring
  const losResult = analyzeLOS({
    txLat: source.lat,
    txLng: source.lng,
    rxLat: targetCoords[0],
    rxLng: targetCoords[1],
    txElevationM: source.elevation,
    rxElevationM: candidateSite?.elevation,
    txTowerHeightM: source.antennaHeightM || 20,
    rxTowerHeightM: candidateSite?.antennaHeightM || 20,
    frequencyMHz: freqMHz,
    samplePointsCount: 20,
  });

  const isBlocked =
    losResult.status === 'OBSTRUCTED' ||
    (losResult.worstPoint && losResult.worstPoint.clearanceM < 0);
  const deficitM = Math.abs(losResult.worstPoint?.clearanceM || 0);
  const wireColor = isBlocked ? '#ef4444' : '#06b6d4';

  const midLat = (source.lat + targetCoords[0]) / 2;
  const midLng = (source.lng + targetCoords[1]) / 2;

  return (
    <>
      {/* Outer Halo Glow */}
      <Polyline
        positions={[
          [source.lat, source.lng],
          targetCoords,
        ]}
        pathOptions={{
          color: wireColor,
          weight: 10,
          opacity: 0.35,
        }}
      />

      {/* Core Dynamic Wire */}
      <Polyline
        positions={[
          [source.lat, source.lng],
          targetCoords,
        ]}
        pathOptions={{
          color: wireColor,
          weight: 4,
          dashArray: isBlocked ? '5, 5' : '8, 8',
          opacity: 0.95,
        }}
      />

      {/* Midpoint Live Terrain Status Badge */}
      <Marker
        position={[midLat, midLng]}
        icon={createLiveWireBadgeIcon(
          distanceKm,
          isBlocked,
          deficitM,
          candidateSite?.name
        )}
        interactive={false}
      />

      {/* Live Peak Obstacle Marker if blocked */}
      {isBlocked && losResult.worstPoint && (
        <Marker
          position={[losResult.worstPoint.lat, losResult.worstPoint.lng]}
          icon={createObstructionIcon(deficitM, losResult.worstPoint.distanceKm)}
          interactive={false}
        />
      )}
    </>
  );
}

// Leaflet Map Camera controller
function LeafletMapController({
  targetLoc,
  isActive,
}: {
  targetLoc: { lat: number; lng: number; zoom?: number } | null;
  isActive: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (isActive) {
      map.invalidateSize();
      const t1 = setTimeout(() => map.invalidateSize(), 50);
      const t2 = setTimeout(() => map.invalidateSize(), 200);
      const t3 = setTimeout(() => map.invalidateSize(), 500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [isActive, map]);

  useEffect(() => {
    const container = map.getContainer();
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [map]);

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
  const { theme, sites, links, addLink, removeLink, setCurrentView } = useAppContext();
  const [mode, setModeState] = useState<MapMode>(() => {
    return (localStorage.getItem('rnms_map_mode') as MapMode) || 'online';
  });
  const [activeLayerId, setActiveLayerId] = useState<string>(() => {
    return localStorage.getItem('rnms_online_layer_id') || DEFAULT_ONLINE_LAYER_ID;
  });
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState<boolean>(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('Offline GIS engine ready');

  // Cisco Packet Tracer Link Wiring Mode State
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingSource, setConnectingSource] = useState<Site | null>(null);
  const [showLinks, setShowLinks] = useState<boolean>(true);
  const [showLinkMetrics, setShowLinkMetrics] = useState<boolean>(true);
  const [connectToast, setConnectToast] = useState<string | null>(null);
  const [selectedLinkInfo, setSelectedLinkInfo] = useState<{
    link: RFLink;
    source: Site;
    target: Site;
    distanceKm: number;
    snr: number;
    rsl: number;
    fspl: number;
    diffractionLossDB: number;
    status: 'CLEAR' | 'MARGINAL' | 'TERRAIN BLOCKED' | 'OFFLINE';
    color: string;
    bearingAtoB: number;
    bearingBtoA: number;
    losResult: LOSAnalysisResult;
    isTerrainBlocked: boolean;
  } | null>(null);

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

  // Cisco Packet Tracer Site-to-Site click handler
  const handleSiteClickForConnection = (clickedSite: Site) => {
    if (!isConnecting) return;

    if (!connectingSource) {
      setConnectingSource(clickedSite);
      setConnectToast(`🔌 Source: ${clickedSite.name} selected. Now click the Target Station.`);
    } else {
      if (connectingSource.id === clickedSite.id) {
        setConnectToast(`⚠️ Cannot connect a station to itself.`);
        return;
      }

      // Check if link already exists
      const existing = links.find(
        (l) =>
          (l.sourceSiteId === connectingSource.id && l.targetSiteId === clickedSite.id) ||
          (l.sourceSiteId === clickedSite.id && l.targetSiteId === connectingSource.id)
      );

      if (existing) {
        setConnectToast(`⚠️ Link already exists between ${connectingSource.name} and ${clickedSite.name}.`);
        setConnectingSource(null);
        setIsConnecting(false);
        return;
      }

      // Create new link
      const distanceKm = calculateDistanceKm(
        connectingSource.lat,
        connectingSource.lng,
        clickedSite.lat,
        clickedSite.lng
      );
      const freqMHz = connectingSource.txFreqMHz || clickedSite.txFreqMHz || 435.0;
      const txPower = connectingSource.txPowerW
        ? Number((10 * Math.log10(connectingSource.txPowerW * 1000)).toFixed(1))
        : 43;

      const newLink: RFLink = {
        id: `link-${Date.now()}`,
        sourceSiteId: connectingSource.id,
        targetSiteId: clickedSite.id,
        equipmentId: null,
        distanceKm: Number(distanceKm.toFixed(2)),
        frequencyMHz: freqMHz,
        txPowerDBm: txPower,
        txAntennaGainDBi: 6,
        rxAntennaGainDBi: 6,
        txCableLossDB: 1.5,
        rxCableLossDB: 1.5,
        fadeMarginDB: 15,
      };

      addLink(newLink);
      setConnectToast(
        `✅ RF Link Established: ${connectingSource.name} ➔ ${clickedSite.name} (${distanceKm.toFixed(1)} km)`
      );
      setConnectingSource(null);
      setIsConnecting(false);
    }
  };

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
            <LeafletMapController targetLoc={targetLocation} isActive={mode === 'online'} />

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

            {/* Cisco Packet Tracer Live Wire Preview while dragging */}
            <LiveWireLayer isConnecting={isConnecting} source={connectingSource} sites={sites} />

            {/* Site-to-Site RF Links (Packet Tracer Colored & Terrain Blocked Links) */}
            {showLinks &&
              links.map((link) => {
                const s = sites.find((site) => site.id === link.sourceSiteId);
                const t = sites.find((site) => site.id === link.targetSiteId);
                if (!s || !t || isNaN(s.lat) || isNaN(s.lng) || isNaN(t.lat) || isNaN(t.lng)) return null;

                const distanceKm = calculateDistanceKm(s.lat, s.lng, t.lat, t.lng);
                const freqMHz = link.frequencyMHz || 400;
                const fspl = calculateFSPL(distanceKm, freqMHz);
                const txTowerM = s.antennaHeightM || 20;
                const rxTowerM = t.antennaHeightM || 20;

                // High-precision terrain LOS profile calculation
                const losResult = analyzeLOS({
                  txLat: s.lat,
                  txLng: s.lng,
                  rxLat: t.lat,
                  rxLng: t.lng,
                  txElevationM: s.elevation,
                  rxElevationM: t.elevation,
                  txTowerHeightM: txTowerM,
                  rxTowerHeightM: rxTowerM,
                  frequencyMHz: freqMHz,
                  samplePointsCount: 30,
                });

                const isTerrainBlocked =
                  losResult.status === 'OBSTRUCTED' ||
                  (losResult.worstPoint && losResult.worstPoint.clearanceM < 0);
                const diffractionLossDB = losResult.diffractionLossDB || 0;

                const txPower = link.txPowerDBm ?? 43;
                const txGain = link.txAntennaGainDBi ?? 6;
                const rxGain = link.rxAntennaGainDBi ?? 6;
                const txLoss = link.txCableLossDB ?? 1.5;
                const rxLoss = link.rxCableLossDB ?? 1.5;
                const effectiveRsl =
                  txPower + txGain + rxGain - txLoss - rxLoss - (fspl + diffractionLossDB);
                const bandwidthHz = (link.channelBandwidthKHz || 12.5) * 1000;
                const noiseFloor = -174 + 10 * Math.log10(bandwidthHz);
                const effectiveSnr = effectiveRsl - noiseFloor;
                const bearingAtoB = calculateBearing(s.lat, s.lng, t.lat, t.lng);
                const bearingBtoA = (bearingAtoB + 180) % 360;

                let status: 'CLEAR' | 'MARGINAL' | 'TERRAIN BLOCKED' | 'OFFLINE' = 'CLEAR';
                let color = '#22c55e'; // green

                if (s.status === 'offline' || t.status === 'offline') {
                  status = 'OFFLINE';
                  color = '#94a3b8'; // gray
                } else if (isTerrainBlocked) {
                  status = 'TERRAIN BLOCKED';
                  color = '#ef4444'; // vibrant red for terrain blocked
                } else if (losResult.status === 'MARGINAL' || effectiveSnr < 22) {
                  status = 'MARGINAL';
                  color = '#f59e0b'; // amber
                } else {
                  status = 'CLEAR';
                  color = effectiveSnr >= 35 ? '#10b981' : '#22c55e'; // emerald / green
                }

                const linkInfo = {
                  link,
                  source: s,
                  target: t,
                  distanceKm,
                  snr: effectiveSnr,
                  rsl: effectiveRsl,
                  fspl,
                  diffractionLossDB,
                  status,
                  color,
                  bearingAtoB,
                  bearingBtoA,
                  losResult,
                  isTerrainBlocked,
                };

                return (
                  <React.Fragment key={link.id}>
                    {/* Outer Ambient Glow Line */}
                    <Polyline
                      positions={[
                        [s.lat, s.lng],
                        [t.lat, t.lng],
                      ]}
                      pathOptions={{
                        color,
                        weight: isTerrainBlocked ? 10 : 8,
                        opacity: isTerrainBlocked ? 0.4 : 0.25,
                      }}
                      eventHandlers={{
                        click: (e) => {
                          L.DomEvent.stopPropagation(e);
                          setSelectedLinkInfo(linkInfo);
                        },
                      }}
                    />

                    {/* Core Link Ray Line */}
                    <Polyline
                      positions={[
                        [s.lat, s.lng],
                        [t.lat, t.lng],
                      ]}
                      pathOptions={{
                        color,
                        weight: isTerrainBlocked ? 4 : 3.5,
                        opacity: 0.95,
                        dashArray:
                          status === 'OFFLINE'
                            ? '6, 6'
                            : isTerrainBlocked
                            ? '4, 4'
                            : undefined,
                      }}
                      eventHandlers={{
                        click: (e) => {
                          L.DomEvent.stopPropagation(e);
                          setSelectedLinkInfo(linkInfo);
                        },
                      }}
                    />

                    {/* Midpoint Metric Badge */}
                    {showLinkMetrics && (
                      <Marker
                        position={[(s.lat + t.lat) / 2, (s.lng + t.lng) / 2]}
                        icon={createLinkBadgeIcon(
                          distanceKm,
                          effectiveSnr,
                          status,
                          color,
                          isTerrainBlocked
                        )}
                        eventHandlers={{
                          click: (e) => {
                            L.DomEvent.stopPropagation(e);
                            setSelectedLinkInfo(linkInfo);
                          },
                        }}
                      />
                    )}

                    {/* Peak Obstruction Point Marker (if terrain blocks ray) */}
                    {isTerrainBlocked && losResult.worstPoint && (
                      <Marker
                        position={[losResult.worstPoint.lat, losResult.worstPoint.lng]}
                        icon={createObstructionIcon(
                          Math.abs(losResult.worstPoint.clearanceM),
                          losResult.worstPoint.distanceKm
                        )}
                        eventHandlers={{
                          click: (e) => {
                            L.DomEvent.stopPropagation(e);
                            setSelectedLinkInfo(linkInfo);
                          },
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}

            {/* Site Markers */}
            {sites.map((site) => (
              <Marker
                key={site.id}
                position={[site.lat, site.lng]}
                icon={createSiteIcon(site.type, connectingSource?.id === site.id)}
                eventHandlers={{
                  click: (e) => {
                    if (isConnecting) {
                      L.DomEvent.stopPropagation(e);
                      handleSiteClickForConnection(site);
                    }
                  },
                }}
              >
                {!isConnecting && (
                  <Popup>
                    <div className="p-1 font-sans min-w-[180px]">
                      <div className="font-bold text-sm text-slate-800 dark:text-slate-100">{site.name}</div>
                      <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">
                        {site.type.replace('-', ' ')}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5 font-mono">
                        <div>Elev: {site.elevation}m AMSL</div>
                        <div>
                          Coords: {site.lat.toFixed(4)}°, {site.lng.toFixed(4)}°
                        </div>
                        {site.txFreqMHz && <div>TX: {site.txFreqMHz} MHz</div>}
                      </div>

                      {/* Quick Connect Link Action */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsConnecting(true);
                          setConnectingSource(site);
                          setConnectToast(`🔌 Source: ${site.name} selected. Now click Target Station.`);
                        }}
                        className="w-full mt-2.5 py-1.5 px-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                      >
                        <Cable className="w-3.5 h-3.5" />
                        <span>Connect Link (Packet Tracer Wire)</span>
                      </button>
                    </div>
                  </Popup>
                )}
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

          {/* Cisco Packet Tracer Connection Mode HUD Banner */}
          {isConnecting && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[450] bg-slate-900/95 text-white border border-cyan-500/80 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs animate-in slide-in-from-top-3">
              <Cable className="w-4 h-4 text-cyan-400 animate-pulse" />
              <div>
                {!connectingSource ? (
                  <span>
                    <b>Step 1:</b> Click on the <b>Source RF Station</b> to start link wiring
                  </span>
                ) : (
                  <span>
                    <b>Step 2:</b> Source: <b className="text-cyan-400">{connectingSource.name}</b> ➔ Now click the <b>Target RF Station</b>
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsConnecting(false);
                  setConnectingSource(null);
                  setConnectToast(null);
                }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-[10px] border border-slate-700 transition ml-2"
              >
                Cancel
              </button>
            </div>
          )}

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

            {/* Top Toolbar Actions: Connect Sites, Links, Layers, Download */}
            <div className="flex flex-wrap items-center gap-1.5 pointer-events-auto">
              {/* Cisco Packet Tracer Wiring Button */}
              <button
                type="button"
                onClick={() => {
                  if (isConnecting) {
                    setIsConnecting(false);
                    setConnectingSource(null);
                    setConnectToast(null);
                  } else {
                    setIsConnecting(true);
                    setConnectingSource(null);
                    setConnectToast('🔌 Packet Tracer Wire Tool: Click 1st RF Station (Source)');
                  }
                }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-lg text-xs font-bold transition',
                  isConnecting
                    ? 'bg-cyan-600 hover:bg-cyan-700 text-white ring-2 ring-cyan-400'
                    : 'bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                )}
                title="Cisco Packet Tracer style RF Link Wiring Tool"
              >
                <Cable className="w-4 h-4 text-cyan-500" />
                <span>{isConnecting ? 'Wiring Mode' : 'Connect Stations'}</span>
              </button>

              {/* Toggle Links Button */}
              <button
                type="button"
                onClick={() => setShowLinks(!showLinks)}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-2 font-semibold rounded-xl border text-xs shadow-lg transition',
                  showLinks
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300'
                    : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50'
                )}
                title="Toggle RF Links overlay"
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Links ({links.length})</span>
              </button>

              {/* Toggle Metrics Button */}
              {showLinks && links.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLinkMetrics(!showLinkMetrics)}
                  className={cn(
                    'flex items-center gap-1 px-2.5 py-2 font-semibold rounded-xl border text-xs shadow-lg transition',
                    showLinkMetrics
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300'
                      : 'bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50'
                  )}
                  title="Toggle Air Distance & SNR labels"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>SNR & Dist</span>
                </button>
              )}

              {/* Download Map Button */}
              <button
                type="button"
                onClick={() => setIsDownloadModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg text-xs font-bold transition"
                title="Download map area for offline use"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Download</span>
              </button>

              {/* English Layer Switcher Menu */}
              <div ref={layerMenuRef} className="relative">
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

          {/* Selected RF Link Details Inspector Card */}
          {selectedLinkInfo && (
            <div className="absolute bottom-6 left-3 z-[450] w-84 sm:w-[420px] bg-slate-900/95 text-white rounded-2xl border border-slate-700 shadow-2xl p-4 backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full animate-pulse shadow-sm"
                    style={{ backgroundColor: selectedLinkInfo.color }}
                  />
                  <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                    RF Link Connectivity & LOS
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase"
                    style={{
                      backgroundColor: `${selectedLinkInfo.color}25`,
                      color: selectedLinkInfo.color,
                      border: `1px solid ${selectedLinkInfo.color}60`,
                    }}
                  >
                    {selectedLinkInfo.isTerrainBlocked
                      ? '🔴 BLOCKED (NO LOS)'
                      : selectedLinkInfo.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedLinkInfo(null)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Terrain Blockage Alert Banner */}
              {selectedLinkInfo.isTerrainBlocked ? (
                <div className="bg-red-950/70 border border-red-500/80 rounded-xl p-2.5 mb-3 flex items-start gap-2 text-xs text-red-200 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-red-300">
                      Terrain Blocked — Line of Sight Severed
                    </div>
                    <div className="text-[11px] text-red-300/80 mt-0.5">
                      Mountain peak at{' '}
                      <b>{selectedLinkInfo.losResult.worstPoint?.distanceKm.toFixed(1)} km</b> rises{' '}
                      <b>
                        +{Math.abs(selectedLinkInfo.losResult.worstPoint?.clearanceM || 0).toFixed(0)}m
                      </b>{' '}
                      into direct optical ray. Link cannot close without repeater or higher towers.
                    </div>
                  </div>
                </div>
              ) : selectedLinkInfo.status === 'MARGINAL' ? (
                <div className="bg-amber-950/70 border border-amber-500/80 rounded-xl p-2 mb-3 flex items-center gap-2 text-xs text-amber-200 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="text-[11px]">
                    <b>Fresnel Zone Encroached:</b> Terrain incurs{' '}
                    <b>+{selectedLinkInfo.diffractionLossDB.toFixed(1)} dB</b> knife-edge diffraction loss.
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-950/60 border border-emerald-500/60 rounded-xl p-2 mb-3 flex items-center gap-2 text-xs text-emerald-200 animate-in fade-in">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="text-[11px]">
                    <b>Clear Line of Sight:</b> Full optical & 60% Fresnel clearance verified (+
                    {selectedLinkInfo.losResult.worstPoint?.clearanceM.toFixed(0)}m margin).
                  </div>
                </div>
              )}

              {/* Site-to-Site Nodes */}
              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 mb-3 flex items-center justify-between text-xs">
                <div className="min-w-0">
                  <div className="font-bold text-blue-400 truncate">{selectedLinkInfo.source.name}</div>
                  <div className="text-[10px] text-slate-400">{selectedLinkInfo.source.elevation}m AMSL</div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 mx-2 shrink-0" />
                <div className="text-right min-w-0">
                  <div className="font-bold text-emerald-400 truncate">{selectedLinkInfo.target.name}</div>
                  <div className="text-[10px] text-slate-400">{selectedLinkInfo.target.elevation}m AMSL</div>
                </div>
              </div>

              {/* Key RF & Terrain Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-sans">Air Distance</div>
                  <div className="font-bold text-white text-sm">
                    {selectedLinkInfo.distanceKm.toFixed(2)} km
                  </div>
                  <div className="text-[9px] text-slate-500 font-sans">
                    {(selectedLinkInfo.distanceKm * 0.621371).toFixed(2)} miles
                  </div>
                </div>

                <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-sans">SNR Value</div>
                  <div className="font-bold text-sm" style={{ color: selectedLinkInfo.color }}>
                    {selectedLinkInfo.isTerrainBlocked ? 'BLOCKED' : `${selectedLinkInfo.snr.toFixed(1)} dB`}
                  </div>
                  <div className="text-[9px] text-slate-500 font-sans">
                    {selectedLinkInfo.isTerrainBlocked ? 'Path Deficit' : 'Signal-to-Noise'}
                  </div>
                </div>

                <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-sans">Received Power (RSL)</div>
                  <div className="font-bold text-white text-xs">
                    {selectedLinkInfo.rsl.toFixed(1)} dBm
                  </div>
                  <div className="text-[9px] text-slate-500 font-sans">
                    Diffraction: +{selectedLinkInfo.diffractionLossDB.toFixed(1)} dB
                  </div>
                </div>

                <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
                  <div className="text-[10px] text-slate-400 font-sans">Terrain Clearance</div>
                  <div
                    className={cn(
                      'font-bold text-xs',
                      selectedLinkInfo.isTerrainBlocked
                        ? 'text-red-400'
                        : selectedLinkInfo.status === 'MARGINAL'
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    )}
                  >
                    {selectedLinkInfo.losResult.worstPoint
                      ? `${selectedLinkInfo.losResult.worstPoint.clearanceM >= 0 ? '+' : ''}${selectedLinkInfo.losResult.worstPoint.clearanceM.toFixed(1)} m`
                      : 'N/A'}
                  </div>
                  <div className="text-[9px] text-slate-500 font-sans">
                    Worst at {selectedLinkInfo.losResult.worstPoint?.distanceKm.toFixed(1)} km
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentView('los');
                  }}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg"
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Real DEM LOS Profiler</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    removeLink(selectedLinkInfo.link.id);
                    setSelectedLinkInfo(null);
                    setConnectToast('🗑️ RF Link Disconnected');
                  }}
                  className="px-2.5 py-2 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition"
                  title="Delete/Disconnect this RF Link"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Connect Toast Notice */}
          {connectToast && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[460] bg-slate-900/95 text-white border border-cyan-500/80 rounded-xl px-4 py-2 shadow-2xl backdrop-blur-md text-xs flex items-center gap-2 animate-in fade-in">
              <span>{connectToast}</span>
              <button
                type="button"
                onClick={() => setConnectToast(null)}
                className="text-slate-400 hover:text-white ml-2 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Download Modal */}
        <MapDownloadModal
          isOpen={isDownloadModalOpen}
          onClose={() => setIsDownloadModalOpen(false)}
          onApplyToOfflineEngine={(count, labelName) => {
            setIsDownloadModalOpen(false);
            setMode('offline');
            setStatus(`Loaded ${count.toLocaleString()} downloaded tiles: "${labelName}"`);
          }}
        />

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
