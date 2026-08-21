import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMapEvents } from 'react-leaflet';
import { Mountain, Satellite, Map as MapIcon, Database, WifiOff, RefreshCw, Archive, CheckCircle2, AlertTriangle, Globe2 } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppContext } from '../context/AppContext';
import { getDetailedElevationInfo } from '../lib/offlineDem';
import { hgtTileName, loadDemTile, getLoadedDemTileCount } from '../lib/demRuntime';
import { analyzeLineOfSightWithRuntimeDem, preloadDemForLos } from '../lib/losDemEngine';
import { PMTilesLayer } from './PMTilesLayer';

type LayerMode = 'satellite' | 'terrain' | 'none';

function SiteIcon({ color, square = false }: { color: string; square?: boolean }) {
  return L.divIcon({ className: 'rnms-site-marker', html: `<div style="width:100%;height:100%;background:${color};border:2px solid #fff;border-radius:${square ? '4px' : '50%'};box-shadow:0 2px 7px rgba(0,0,0,.45);box-sizing:border-box"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });
}

function DemInspector({ onSample }: { onSample: (lat: number, lng: number) => void }) {
  useMapEvents({ click: e => onSample(e.latlng.lat, e.latlng.lng) });
  return null;
}

export function OfflineGISMap() {
  const { sites, links, setCurrentView } = useAppContext();
  const [layer, setLayer] = useState<LayerMode>('satellite');
  const [demInfo, setDemInfo] = useState<any>(null);
  const [mapInfo, setMapInfo] = useState<any>(null);
  const [demCount, setDemCount] = useState(0);
  const [demLoading, setDemLoading] = useState(false);
  const [demReady, setDemReady] = useState(false);
  const [onlineMode, setOnlineMode] = useState(false);
  const center: [number, number] = sites.length ? [sites[0].lat, sites[0].lng] : [30.3753, 69.3451];

  const refreshMapInfo = async () => { const info = await window.rnmsOffline?.getMapInfo?.(); setMapInfo(info ?? null); setDemCount(getLoadedDemTileCount()); };
  useEffect(() => { refreshMapInfo(); }, []);

  const sampleElevation = async (lat: number, lng: number) => {
    setDemLoading(true);
    try {
      const loaded = await loadDemTile(hgtTileName(lat, lng));
      setDemInfo(loaded ? getDetailedElevationInfo(lat, lng) : { lat, lng, unavailable: true });
      setDemCount(getLoadedDemTileCount());
    } finally { setDemLoading(false); }
  };

  const analyzeSelectedLink = async (source: any, target: any) => {
    const p = { txLat: source.lat, txLng: source.lng, txElevationM: source.elevation, txTowerHeightM: 30, txName: source.name, rxLat: target.lat, rxLng: target.lng, rxElevationM: target.elevation, rxTowerHeightM: 30, rxName: target.name, frequencyMHz: source.txFreqMHz || 155.5, kFactor: 1.333, clutterHeightM: 0, samplePointsCount: 100 };
    const result = await preloadDemForLos(p, 100);
    setDemReady(result.requested > 0 && result.loaded === result.requested);
    setDemCount(getLoadedDemTileCount());
  };

  const demoLos = useMemo(() => {
    if (sites.length < 2 || !demReady) return null;
    return analyzeLineOfSightWithRuntimeDem({ txLat: sites[0].lat, txLng: sites[0].lng, txElevationM: sites[0].elevation, txTowerHeightM: 30, txName: sites[0].name, rxLat: sites[1].lat, rxLng: sites[1].lng, rxElevationM: sites[1].elevation, rxTowerHeightM: 30, rxName: sites[1].name, frequencyMHz: sites[0].txFreqMHz || 155.5, kFactor: 1.333, clutterHeightM: 0, samplePointsCount: 100 });
  }, [sites, demReady]);

  const satellitePMTiles = mapInfo?.satellitePMTilesAvailable ? 'rnms://pmtiles/pakistan-satellite.pmtiles' : null;
  const terrainPMTiles = mapInfo?.terrainPMTilesAvailable ? 'rnms://pmtiles/pakistan-terrain.pmtiles' : null;
  const satelliteReady = Boolean(satellitePMTiles);
  const terrainReady = Boolean(terrainPMTiles);
  const activeOffline = !onlineMode;

  return <div className="relative h-full w-full overflow-hidden bg-slate-200 dark:bg-slate-950">
    <MapContainer center={center} zoom={6} className="h-full w-full z-0" zoomControl>
      {activeOffline && layer === 'satellite' && satellitePMTiles && <PMTilesLayer url={satellitePMTiles} maxZoom={18} attribution="Offline licensed satellite imagery · PMTiles" />}
      {activeOffline && layer === 'terrain' && terrainPMTiles && <PMTilesLayer url={terrainPMTiles} maxZoom={17} attribution="Offline terrain imagery · PMTiles" />}
      {!activeOffline && layer === 'satellite' && <TileLayer attribution="Esri World Imagery" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />}
      {!activeOffline && layer === 'terrain' && <TileLayer attribution="OpenTopoMap" url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png" maxZoom={17} />}
      {!activeOffline && layer === 'none' && null}
      <DemInspector onSample={sampleElevation} />
      {links.map(link => { const a = sites.find(s => s.id === link.sourceSiteId); const b = sites.find(s => s.id === link.targetSiteId); return a && b ? <Polyline key={link.id} positions={[[a.lat, a.lng], [b.lat, b.lng]]} pathOptions={{ color: '#10b981', weight: 3, dashArray: '8 6' }} /> : null; })}
      {sites.map(site => <Marker key={site.id} position={[site.lat, site.lng]} icon={SiteIcon({ color: site.type === 'repeater' ? '#eab308' : '#2563eb', square: site.type === 'repeater' })}>
        <Popup><div className="text-xs min-w-[190px]"><strong>{site.name}</strong><div className="font-mono mt-1">{site.lat.toFixed(5)}, {site.lng.toFixed(5)}</div><div className="mt-1">Ground elevation: {site.elevation ?? '—'} m</div>{sites.length > 1 && site.id === sites[0].id && <button onClick={() => analyzeSelectedLink(site, sites[1])} className="mt-2 px-2 py-1.5 rounded bg-blue-600 text-white font-bold w-full">Load real DEM for LOS</button>}</div></Popup>
      </Marker>)}
    </MapContainer>

    <div className="absolute top-4 left-4 z-[1000] flex flex-wrap gap-2 max-w-[calc(100%-2rem)]">
      <div className="bg-slate-950/95 text-white rounded-xl shadow-xl border border-emerald-500/40 px-3 py-2 text-xs"><div className="font-bold flex items-center gap-2"><WifiOff className="w-4 h-4 text-emerald-400" /> OFFLINE-FIRST GIS</div><div className="text-[10px] text-slate-400 mt-1">Leaflet + PMTiles + real DEM</div></div>
      <button onClick={() => { setOnlineMode(false); setLayer('satellite'); }} className={`px-3 py-2 rounded-xl text-xs font-bold shadow border ${activeOffline ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-white text-slate-700 border-slate-200'}`}><WifiOff className="inline w-3.5 h-3.5 mr-1" />Offline</button>
      <button onClick={() => setOnlineMode(true)} className={`px-3 py-2 rounded-xl text-xs font-bold shadow border ${onlineMode ? 'bg-slate-700 text-white border-slate-600' : 'bg-white text-slate-700 border-slate-200'}`}><Globe2 className="inline w-3.5 h-3.5 mr-1" />Online fallback</button>
      <button disabled={!activeOffline} onClick={() => setLayer('satellite')} className={`px-3 py-2 rounded-xl text-xs font-bold shadow ${layer === 'satellite' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}><Satellite className="inline w-3.5 h-3.5 mr-1" />Satellite</button>
      <button disabled={!activeOffline} onClick={() => setLayer('terrain')} className={`px-3 py-2 rounded-xl text-xs font-bold shadow ${layer === 'terrain' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700'}`}><Mountain className="inline w-3.5 h-3.5 mr-1" />Terrain</button>
      <button onClick={() => setLayer('none')} className={`px-3 py-2 rounded-xl text-xs font-bold shadow ${layer === 'none' ? 'bg-slate-700 text-white' : 'bg-white text-slate-700'}`}><MapIcon className="inline w-3.5 h-3.5 mr-1" />None</button>
    </div>

    <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl p-3 w-96 max-w-[calc(100%-2rem)] text-xs">
      <div className="flex items-center justify-between mb-3"><strong className="flex items-center gap-1.5"><Database className="w-4 h-4 text-blue-600" /> Offline GIS Status</strong><button onClick={refreshMapInfo} title="Refresh GIS status"><RefreshCw className="w-3.5 h-3.5" /></button></div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-2"><div className="text-[10px] uppercase text-slate-400 font-bold">Satellite PMTiles</div><b className={satelliteReady ? 'text-emerald-600' : 'text-rose-600'}>{satelliteReady ? 'READY' : 'MISSING'}</b></div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-2"><div className="text-[10px] uppercase text-slate-400 font-bold">Terrain PMTiles</div><b className={terrainReady ? 'text-emerald-600' : 'text-rose-600'}>{terrainReady ? 'READY' : 'MISSING'}</b></div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-2"><div className="text-[10px] uppercase text-slate-400 font-bold">DEM files</div><b>{mapInfo?.demTileCount ?? 0}</b></div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/70 p-2"><div className="text-[10px] uppercase text-slate-400 font-bold">DEM loaded</div><b>{demCount}</b></div>
      </div>
      <div className={`mt-3 rounded-lg border p-2 ${mapInfo?.demTileCount ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/30'}`}>{mapInfo?.demTileCount ? <CheckCircle2 className="inline w-4 h-4 mr-1 text-emerald-600" /> : <AlertTriangle className="inline w-4 h-4 mr-1 text-amber-600" />}<b>Elevation source:</b> {mapInfo?.demTileCount ? 'REAL HGT DEM' : 'NO REAL DEM DATA INSTALLED'}</div>
      {demLoading && <div className="mt-2 text-amber-600 font-bold">Loading DEM tile…</div>}
      {demoLos && <div className="mt-2 border-t pt-2"><b>LOS terrain source:</b> <span className="text-emerald-600">{demoLos.terrainSource}</span><br /><b>LOS:</b> {demoLos.status} · {demoLos.worstPoint.clearanceM.toFixed(1)} m clearance</div>}
      {demInfo && !demInfo.unavailable && <div className="mt-2 border-t pt-2"><b>Sample:</b> {demInfo.elevationM} m ({demInfo.source})<br />Slope: {demInfo.slopeDeg}° · {demInfo.aspectCompass}</div>}
      {demInfo?.unavailable && <div className="mt-2 border-t pt-2 text-amber-700 dark:text-amber-300">No real DEM tile covers this coordinate. Install the corresponding HGT tile to sample elevation.</div>}
      {!satelliteReady && <div className="mt-2 border-t pt-2 text-amber-700 dark:text-amber-300"><Archive className="inline w-3.5 h-3.5 mr-1" />Install <code>rnms-data/maps/pakistan-satellite.pmtiles</code> to activate offline satellite imagery.</div>}
      {!mapInfo?.demTileCount && <div className="mt-2 text-amber-700 dark:text-amber-300">Install real HGT files under <code>rnms-data/dem/</code>. No simulated elevation is presented as real DEM.</div>}
      {sites.length > 1 && !demReady && <button onClick={() => analyzeSelectedLink(sites[0], sites[1])} className="mt-3 w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold">Load all DEM tiles for LOS test</button>}
      {sites.length > 1 && demReady && <div className="mt-3 text-emerald-700 dark:text-emerald-300 font-bold">✓ Required DEM tiles loaded for this LOS test.</div>}
      <button onClick={() => setCurrentView('los')} className="mt-2 w-full py-2 rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-bold">Open LOS Profiler</button>
    </div>
  </div>;
}
