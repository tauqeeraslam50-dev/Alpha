import React, { useEffect, useMemo, useState } from 'react';
import { Map as MapIcon, Wifi, WifiOff, Search, LocateFixed, ExternalLink, Database, Layers, RefreshCw } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { cn } from '../lib/utils';

type MapMode = 'online' | 'offline';

function osmEmbedUrl(lat: number, lng: number, zoom: number) {
  const span = Math.max(0.08, 360 / Math.pow(2, zoom));
  const lonSpan = span;
  const latSpan = span * 0.65;
  const left = lng - lonSpan;
  const right = lng + lonSpan;
  const bottom = Math.max(-85, lat - latSpan);
  const top = Math.min(85, lat + latSpan);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left},${bottom},${right},${top}&layer=mapnik&marker=${lat},${lng}`;
}

export function Map() {
  const { sites, theme } = useAppContext();
  const [mode, setMode] = useState<MapMode>('online');
  const [query, setQuery] = useState('');
  const [center, setCenter] = useState({ lat: 30.3753, lng: 69.3451 });
  const [zoom, setZoom] = useState(5);
  const [status, setStatus] = useState('Online map ready');
  const [offlineFiles, setOfflineFiles] = useState<string[]>([]);

  const siteCenter = useMemo(() => {
    if (!sites.length) return center;
    const valid = sites.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lng));
    if (!valid.length) return center;
    return {
      lat: valid.reduce((sum, s) => sum + s.lat, 0) / valid.length,
      lng: valid.reduce((sum, s) => sum + s.lng, 0) / valid.length,
    };
  }, [sites, center]);

  const embedUrl = useMemo(() => osmEmbedUrl(center.lat, center.lng, zoom), [center, zoom]);

  useEffect(() => {
    if (sites.length && center.lat === 30.3753 && center.lng === 69.3451) setCenter(siteCenter);
  }, [sites, siteCenter]);

  const locateSites = () => {
    setCenter(siteCenter);
    setZoom(sites.length ? 7 : 5);
    setStatus(sites.length ? `Centered on ${sites.length} configured site${sites.length === 1 ? '' : 's'}` : 'No sites have coordinates yet');
  };

  const searchPlace = async () => {
    const q = query.trim();
    if (!q) return;
    setStatus('Searching OpenStreetMap…');
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('Search request failed');
      const results = await response.json();
      if (!results?.length) { setStatus('Location not found'); return; }
      setCenter({ lat: Number(results[0].lat), lng: Number(results[0].lon) });
      setZoom(11);
      setStatus(`Located: ${results[0].display_name}`);
    } catch {
      setStatus('Online search unavailable. Check the Internet connection.');
    }
  };

  const selectOfflineFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setOfflineFiles(files.map(file => `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`));
    setStatus(files.length ? `${files.length} offline map file${files.length === 1 ? '' : 's'} selected` : 'No offline files selected');
    event.target.value = '';
  };

  return (
    <section className={cn('h-full flex flex-col p-4 sm:p-5', theme === 'light' ? 'text-slate-900' : 'text-slate-100')}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <MapIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold">GIS Map</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">Integrated operational map for network sites, planning and offline GIS data.</p>
        </div>
        <div className={cn('flex items-center rounded-lg border p-1', theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700')}>
          <button onClick={() => { setMode('online'); setStatus('Online OpenStreetMap view selected'); }} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold', mode === 'online' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}><Wifi className="w-3.5 h-3.5" /> Online Map</button>
          <button onClick={() => { setMode('offline'); setStatus('Offline GIS workspace selected'); }} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold', mode === 'offline' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800')}><WifiOff className="w-3.5 h-3.5" /> Offline Map</button>
        </div>
      </div>

      {mode === 'online' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-3">
          <div className={cn('flex flex-wrap gap-2 p-2.5 rounded-xl border', theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800')}>
            <div className="flex-1 min-w-[220px] flex items-center gap-2 border rounded-lg px-3 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-700">
              <Search className="w-4 h-4 text-slate-400" />
              <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void searchPlace(); }} placeholder="Search city, site or location…" className="w-full bg-transparent outline-none py-2 text-xs" />
            </div>
            <button onClick={() => void searchPlace()} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold">Search</button>
            <button onClick={locateSites} className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5"><LocateFixed className="w-3.5 h-3.5" /> Network Sites</button>
            <button onClick={() => { setCenter({ lat: 30.3753, lng: 69.3451 }); setZoom(5); setStatus('Reset to Pakistan overview'); }} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg" title="Reset map"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex-1 min-h-[420px] rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-200 relative">
            <iframe key={embedUrl} title="Online OpenStreetMap" src={embedUrl} className="absolute inset-0 w-full h-full border-0" loading="eager" />
            <div className="absolute bottom-2 left-2 right-2 pointer-events-none"><div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-white/95 dark:bg-slate-900/95 shadow text-[10px] font-semibold text-slate-600 dark:text-slate-300"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {status}</div></div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-500 px-1"><span>Source: OpenStreetMap · Internet connection required</span><button onClick={() => window.open(`https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lng}#map=${zoom}/${center.lat}/${center.lng}`, '_blank', 'noopener,noreferrer')} className="flex items-center gap-1 text-blue-600 font-bold">Open full map <ExternalLink className="w-3 h-3" /></button></div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid lg:grid-cols-[1.2fr_.8fr] gap-4">
          <div className={cn('rounded-xl border flex flex-col items-center justify-center text-center p-8', theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800')}>
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mb-4"><Database className="w-8 h-8 text-emerald-600" /></div>
            <h3 className="font-bold">Offline GIS Workspace</h3>
            <p className="text-xs text-slate-500 max-w-md mt-2">Select your prepared PMTiles, MBTiles, GeoJSON or DEM data. The existing Offline Map Manager remains the dedicated renderer for local GIS archives.</p>
            <label className="mt-5 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer">Select Offline Map Files<input type="file" multiple accept=".pmtiles,.mbtiles,.geojson,.json,.hgt,.tif,.tiff" onChange={selectOfflineFiles} className="hidden" /></label>
            <div className="mt-4 text-[10px] text-slate-500">Status: {status}</div>
          </div>
          <div className={cn('rounded-xl border p-4', theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800')}>
            <div className="flex items-center gap-2 font-bold text-sm"><Layers className="w-4 h-4 text-emerald-600" /> Offline Data Inventory</div>
            <div className="mt-3 space-y-2">
              {offlineFiles.length ? offlineFiles.map(file => <div key={file} className="text-[11px] px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">{file}</div>) : <div className="text-xs text-slate-500 p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-dashed border-slate-300 dark:border-slate-700">No local map files selected.</div>}
            </div>
            <div className="mt-5 text-[10px] leading-5 text-slate-500">Recommended data: Pakistan vector/road PMTiles, satellite raster PMTiles and HGT DEM coverage. Keep these datasets outside Git when they are large.</div>
          </div>
        </div>
      )}
    </section>
  );
}
