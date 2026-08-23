import React, { useEffect, useState } from 'react';
import { MapContainer, Marker, Popup, Polyline, TileLayer, GeoJSON } from 'react-leaflet';
import { Database, Download, Layers, Mountain, RefreshCw, Satellite, Route, WifiOff } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAppContext } from '../context/AppContext';
import { offlineMapEngine } from '../gis/OfflineMapEngine';
import type { OfflineMapStatus } from '../gis/types';
import { PMTilesLayer } from './PMTilesLayer';

type LayerMode = 'satellite' | 'street' | 'terrain' | 'none';
const icon = (color: string, square = false) => L.divIcon({ className: 'rnms-site-marker', html: `<div style="width:100%;height:100%;background:${color};border:2px solid #fff;border-radius:${square ? '4px' : '50%'}"></div>`, iconSize: [18, 18], iconAnchor: [9, 9] });

export function OfflineGISMapV2() {
  const { sites, links } = useAppContext();
  const [layer, setLayer] = useState<LayerMode>('satellite');
  const [status, setStatus] = useState<OfflineMapStatus | null>(null);
  const [labels, setLabels] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const center: [number, number] = sites.length ? [sites[0].lat, sites[0].lng] : offlineMapEngine.getDefaultCenter();

  const refresh = async () => {
    const next = await offlineMapEngine.refresh();
    setStatus(next);
    if (next?.labels || next?.labelsAvailable) {
      const raw = await window.rnmsOffline?.readMapText?.('pakistan-labels.geojson');
      try { setLabels(raw ? JSON.parse(raw) : null); } catch { setLabels(null); }
    } else setLabels(null);
  };
  useEffect(() => { void refresh(); }, []);

  const install = async () => {
    setBusy(true);
    try { await offlineMapEngine.installPackage(); await refresh(); } finally { setBusy(false); }
  };

  const folderAvailable = layer !== 'none' && offlineMapEngine.hasFolderLayer(layer);
  const pmtilesAvailable = layer !== 'none' && offlineMapEngine.hasPMTilesLayer(layer);
  const tileUrl = layer === 'none' ? null : offlineMapEngine.tileUrl(layer, 0, 0, 0).replace('/0/0/0.', '/{z}/{x}/{y}.');
  const pmtilesName = layer === 'satellite' ? 'pakistan-satellite.pmtiles' : layer === 'terrain' ? 'pakistan-terrain.pmtiles' : null;
  const available = layer === 'none' || folderAvailable || pmtilesAvailable;

  return <div className="relative h-full w-full overflow-hidden bg-slate-200 dark:bg-slate-950">
    <MapContainer center={center} zoom={5} minZoom={3} maxZoom={18} className="h-full w-full">
      {layer !== 'none' && folderAvailable && <TileLayer url={tileUrl!} maxZoom={18} keepBuffer={3} />}
      {layer !== 'none' && !folderAvailable && pmtilesAvailable && pmtilesName && <PMTilesLayer url={`rnms://pmtiles/${pmtilesName}`} maxZoom={18} />}
      {labels && <GeoJSON key={JSON.stringify(labels).length} data={labels} pointToLayer={(_f, p) => L.circleMarker(p, { radius: 2.5, weight: 1 })} onEachFeature={(f, l) => { const p = f?.properties || {}; const name = p.name || p.NAME || p.name_en || p.place_name || p.label; if (name) l.bindTooltip(String(name), { direction: 'top' }); }} />}
      {links.map(link => { const a = sites.find(s => s.id === link.sourceSiteId); const b = sites.find(s => s.id === link.targetSiteId); return a && b ? <Polyline key={link.id} positions={[[a.lat, a.lng], [b.lat, b.lng]]} pathOptions={{ color: '#10b981', weight: 3, dashArray: '8 6' }} /> : null; })}
      {sites.map(site => <Marker key={site.id} position={[site.lat, site.lng]} icon={icon(site.type === 'repeater' ? '#eab308' : '#2563eb', site.type === 'repeater')}><Popup><b>{site.name}</b><div className="font-mono">{site.lat.toFixed(5)}, {site.lng.toFixed(5)}</div><div>Elevation: {site.elevation ?? '—'} m</div></Popup></Marker>)}
    </MapContainer>

    <div className="absolute top-4 left-4 z-[1000] flex flex-wrap gap-2">
      <div className="bg-slate-950/95 text-white rounded-xl px-3 py-2 text-xs border border-emerald-500/40"><b><WifiOff className="inline w-4 h-4 text-emerald-400 mr-1" />OFFLINE GIS ENGINE</b><div className="text-[10px] text-slate-400">Unified GIS data store</div></div>
      {([['satellite', Satellite, 'Satellite'], ['street', Route, 'Map / Roads'], ['terrain', Mountain, 'Terrain']] as const).map(([id, I, text]) => <button key={id} onClick={() => setLayer(id)} className={`px-3 py-2 rounded-xl text-xs font-bold shadow ${layer === id ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700'}`}><I className="inline w-3.5 h-3.5 mr-1" />{text}</button>)}
      <button onClick={() => setLayer('none')} className={`px-3 py-2 rounded-xl text-xs font-bold shadow ${layer === 'none' ? 'bg-slate-700 text-white' : 'bg-white text-slate-700'}`}><Layers className="inline w-3.5 h-3.5 mr-1" />Labels</button>
    </div>

    <div className="absolute top-4 right-4 z-[1000] bg-white/95 dark:bg-slate-900/95 rounded-xl shadow-xl p-3 w-72 text-xs">
      <div className="flex justify-between mb-3"><b><Database className="inline w-4 h-4 mr-1" />Local Map Package</b><button onClick={() => void refresh()}><RefreshCw className="w-3.5 h-3.5" /></button></div>
      <div className="text-[10px] text-slate-500 mb-2">One data store · folder package preferred · existing PMTiles supported</div>
      <div className="grid grid-cols-2 gap-2">{([['satellite','Satellite'],['street','Road map'],['terrain','Terrain'],['labels','Place labels']] as const).map(([k,t]) => {
        const ready = k === 'satellite' ? Boolean(status?.satellite) : k === 'terrain' ? Boolean(status?.terrain) : k === 'street' ? Boolean(status?.street || status?.folderStreetAvailable) : Boolean(status?.labels || status?.labelsAvailable);
        return <div key={k} className="bg-slate-50 dark:bg-slate-800 rounded p-2"><div className="text-[9px] uppercase text-slate-400">{t}</div><b className={ready ? 'text-emerald-600' : 'text-rose-600'}>{ready ? 'READY' : 'MISSING'}</b></div>;
      })}</div>
      <div className="mt-2 bg-slate-50 dark:bg-slate-800 rounded p-2"><b>DEM:</b> {status?.demTileCount ?? 0} HGT tile(s)</div>
      {layer !== 'none' && <div className={`mt-2 rounded p-2 ${available ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{available ? (folderAvailable ? 'Using folder tiles' : 'Using installed PMTiles') : 'Selected layer has no installed data'}</div>}
      <button onClick={() => void install()} disabled={busy} className="mt-3 w-full py-2 rounded-lg bg-blue-600 text-white font-bold disabled:opacity-60"><Download className="inline w-4 h-4 mr-1" />{busy ? 'Installing…' : 'Import Offline Map Folder'}</button>
      <div className="mt-2 text-[9px] text-slate-400">Existing GIS Data Manager imports are now detected automatically.</div>
    </div>
  </div>;
}
