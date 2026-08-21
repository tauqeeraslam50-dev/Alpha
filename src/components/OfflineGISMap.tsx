import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import { Mountain, Satellite, Map as MapIcon, Database, WifiOff, RefreshCw, Archive } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppContext } from '../context/AppContext';
import { getDetailedElevationInfo } from '../lib/offlineDem';
import { hgtTileName, loadDemTile, getLoadedDemTileCount } from '../lib/demRuntime';
import { analyzeLineOfSightWithRuntimeDem, preloadDemForLos } from '../lib/losDemEngine';
import { PMTilesLayer } from './PMTilesLayer';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34] });
L.Marker.prototype.options.icon = DefaultIcon;
type LayerMode = 'satellite' | 'terrain' | 'none';
function DemInspector({ onSample }: { onSample: (lat: number, lng: number) => void }) { useMapEvents({ click: e => onSample(e.latlng.lat, e.latlng.lng) }); return null; }

export function OfflineGISMap() {
  const { sites, links } = useAppContext();
  const [layer, setLayer] = useState<LayerMode>('satellite');
  const [demInfo, setDemInfo] = useState<any>(null), [mapInfo, setMapInfo] = useState<any>(null);
  const [demCount, setDemCount] = useState(0), [demLoading, setDemLoading] = useState(false), [demReady, setDemReady] = useState(false);
  const center: [number, number] = sites.length ? [sites[0].lat, sites[0].lng] : [30.3753, 69.3451];
  const refreshMapInfo = async () => { const info = await window.rnmsOffline?.getMapInfo?.(); setMapInfo(info ?? null); setDemCount(getLoadedDemTileCount()); };
  useEffect(() => { refreshMapInfo(); }, []);
  const sampleElevation = async (lat: number, lng: number) => { setDemLoading(true); try { await loadDemTile(hgtTileName(lat, lng)); setDemInfo(getDetailedElevationInfo(lat, lng)); setDemCount(getLoadedDemTileCount()); } finally { setDemLoading(false); } };
  const analyzeSelectedLink = async (source: any, target: any) => { const p = { txLat: source.lat, txLng: source.lng, txElevationM: source.elevation, txTowerHeightM: 30, txName: source.name, rxLat: target.lat, rxLng: target.lng, rxElevationM: target.elevation, rxTowerHeightM: 30, rxName: target.name, frequencyMHz: source.txFreqMHz || 155.5, kFactor: 1.333, clutterHeightM: 0, samplePointsCount: 100 }; await preloadDemForLos(p, 100); setDemReady(true); setDemCount(getLoadedDemTileCount()); };
  const demoLos = useMemo(() => sites.length < 2 || !demReady ? null : analyzeLineOfSightWithRuntimeDem({ txLat: sites[0].lat, txLng: sites[0].lng, txElevationM: sites[0].elevation, txTowerHeightM: 30, txName: sites[0].name, rxLat: sites[1].lat, rxLng: sites[1].lng, rxElevationM: sites[1].elevation, rxTowerHeightM: 30, rxName: sites[1].name, frequencyMHz: sites[0].txFreqMHz || 155.5, kFactor: 1.333, clutterHeightM: 0, samplePointsCount: 100 }), [sites, demReady]);
  const satellitePMTiles = mapInfo?.satellitePMTilesAvailable ? 'rnms://pmtiles/pakistan-satellite.pmtiles' : null;
  const terrainPMTiles = mapInfo?.terrainPMTilesAvailable ? 'rnms://pmtiles/pakistan-terrain.pmtiles' : null;

  return <div className="relative h-full w-full overflow-hidden">
    <MapContainer center={center} zoom={6} className="h-full w-full z-0" zoomControl>
      {layer === 'satellite' && satellitePMTiles && <PMTilesLayer url={satellitePMTiles} maxZoom={18} attribution="Offline licensed satellite imagery · PMTiles" />}
      {layer === 'terrain' && terrainPMTiles && <PMTilesLayer url={terrainPMTiles} maxZoom={17} attribution="Offline terrain imagery · PMTiles" />}
      <DemInspector onSample={sampleElevation} />
      {links.map(link => { const a = sites.find(s => s.id === link.sourceSiteId), b = sites.find(s => s.id === link.targetSiteId); return a && b ? <Polyline key={link.id} positions={[[a.lat, a.lng], [b.lat, b.lng]]} pathOptions={{ color: '#10b981', weight: 3, dashArray: '8 6' }} /> : null; })}
      {sites.map(site => <Marker key={site.id} position={[site.lat, site.lng]}><Popup><div className="text-xs min-w-[180px]"><strong>{site.name}</strong><div className="font-mono mt-1">{site.lat.toFixed(5)}, {site.lng.toFixed(5)}</div><div className="mt-1">Ground: {site.elevation ?? '—'} m</div>{sites.length > 1 && site.id === sites[0].id && <button onClick={() => analyzeSelectedLink(site, sites[1])} className="mt-2 px-2 py-1 rounded bg-blue-600 text-white font-bold">Load DEM for LOS</button>}</div></Popup></Marker>)}
    </MapContainer>
    <div className="absolute top-4 left-4 z-[1000] flex flex-wrap gap-2">
      <div className="bg-slate-900/95 text-white rounded-xl shadow-xl border border-slate-700 px-3 py-2 text-xs"><div className="font-bold flex items-center gap-2"><WifiOff className="w-4 h-4 text-emerald-400" /> REAL OFFLINE GIS</div><div className="text-[10px] text-slate-400 mt-1">PMTiles archives are read locally with byte-range requests.</div></div>
      <button onClick={() => setLayer('satellite')} className={`px-3 py-2 rounded-xl text-xs font-bold shadow ${layer === 'satellite' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'}`}><Satellite className="inline w-3.5 h-3.5 mr-1" />Satellite</button>
      <button onClick={() => setLayer('terrain')} className={`px-3 py-2 rounded-xl text-xs font-bold shadow ${layer === 'terrain' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700'}`}><Mountain className="inline w-3.5 h-3.5 mr-1" />Terrain</button>
      <button onClick={() => setLayer('none')} className={`px-3 py-2 rounded-xl text-xs font-bold shadow ${layer === 'none' ? 'bg-slate-700 text-white' : 'bg-white text-slate-700'}`}><MapIcon className="inline w-3.5 h-3.5 mr-1" />None</button>
    </div>
    <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 rounded-xl shadow-xl p-3 w-80 text-xs">
      <div className="flex items-center justify-between mb-2"><strong className="flex items-center gap-1.5"><Database className="w-4 h-4 text-blue-600" /> Offline GIS Status</strong><button onClick={refreshMapInfo}><RefreshCw className="w-3.5 h-3.5" /></button></div>
      <div className="grid grid-cols-2 gap-2"><div>Satellite PMTiles<br/><b className={mapInfo?.satellitePMTilesAvailable ? 'text-emerald-600' : 'text-rose-600'}>{mapInfo?.satellitePMTilesAvailable ? 'INSTALLED' : 'MISSING'}</b></div><div>Terrain PMTiles<br/><b className={mapInfo?.terrainPMTilesAvailable ? 'text-emerald-600' : 'text-rose-600'}>{mapInfo?.terrainPMTilesAvailable ? 'INSTALLED' : 'MISSING'}</b></div><div>DEM files<br/><b>{mapInfo?.demTileCount ?? 0}</b></div><div>DEM loaded<br/><b>{demCount}</b></div></div>
      {demLoading && <div className="mt-2 text-amber-600 font-bold">Loading DEM tile…</div>}
      {demoLos && <div className="mt-2 border-t pt-2"><b>LOS terrain source:</b> <span className="text-emerald-600">{demoLos.terrainSource}</span><br/><b>LOS:</b> {demoLos.status} · {demoLos.worstPoint.clearanceM.toFixed(1)} m clearance</div>}
      {demInfo && <div className="mt-2 border-t pt-2"><b>Sample:</b> {demInfo.elevationM} m ({demInfo.source})<br/>Slope: {demInfo.slopeDeg}° · {demInfo.aspectCompass}</div>}
      {!mapInfo?.satellitePMTilesAvailable && <div className="mt-2 border-t pt-2 text-amber-700"><Archive className="inline w-3.5 h-3.5 mr-1" />Install <code>rnms-data/maps/pakistan-satellite.pmtiles</code> for offline satellite.</div>}
    </div>
  </div>;
}
