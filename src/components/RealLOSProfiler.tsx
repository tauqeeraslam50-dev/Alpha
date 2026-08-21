import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Database, MapPin, RefreshCw, Route, XCircle } from 'lucide-react';
import { buildDemIndex, DemTile, elevationFromHgt, findDemTile, haversineMeters } from '../services/demService';
import { calculateTerrainLos, LosResult, RadioEndpoint } from '../services/losDemEngine';
import { useAppContext } from '../context/AppContext';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

type Point = { name: string; lat: number; lon: number; elev?: number };

const fallbackA: Point = { name: 'TX Site', lat: 33.6844, lon: 73.0479, elev: 508 };
const fallbackB: Point = { name: 'RX Site', lat: 33.9070, lon: 73.3943, elev: 2291 };

export function RealLOSProfiler() {
  const { sites, theme } = useAppContext();
  const [txId, setTxId] = useState(sites[0]?.id ?? '');
  const [rxId, setRxId] = useState(sites[1]?.id ?? sites[0]?.id ?? '');
  const [txHeight, setTxHeight] = useState(30);
  const [rxHeight, setRxHeight] = useState(30);
  const [sampleCount, setSampleCount] = useState(200);
  const [index, setIndex] = useState<DemTile[]>([]);
  const [result, setResult] = useState<LosResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tx: Point = useMemo(() => {
    const s = sites.find(x => x.id === txId);
    return s ? { name: s.name, lat: s.lat, lon: s.lng, elev: s.elevation } : fallbackA;
  }, [sites, txId]);
  const rx: Point = useMemo(() => {
    const s = sites.find(x => x.id === rxId);
    return s ? { name: s.name, lat: s.lat, lon: s.lng, elev: s.elevation } : fallbackB;
  }, [sites, rxId]);

  const loadIndex = async () => {
    setLoading(true); setError('');
    try {
      if (!window.rnmsOffline) throw new Error('Offline GIS bridge is unavailable. Run the Electron application.');
      const names = await window.rnmsOffline.listDemTiles();
      const files = names.map(name => ({ name, path: name, byteLength: 2 * 3601 * 3601 }));
      setIndex(buildDemIndex(files));
      setResult(null);
      if (!names.length) setError('No real HGT DEM files are installed. Import HGT files in Offline GIS Manager first.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to read DEM index.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadIndex(); }, []);

  const runLos = async () => {
    setLoading(true); setError('');
    try {
      if (!window.rnmsOffline) throw new Error('Offline GIS bridge is unavailable.');
      if (!index.length) throw new Error('No DEM tiles are indexed. Install real HGT files first.');

      const cache = new Map<string, ArrayBuffer>();
      const readTile = (tile: DemTile) => {
        const b = cache.get(tile.name);
        if (!b) throw new Error(`DEM tile ${tile.name} was not loaded.`);
        return b;
      };

      const a: RadioEndpoint = { lat: tx.lat, lon: tx.lon, antennaHeightMeters: txHeight };
      const b: RadioEndpoint = { lat: rx.lat, lon: rx.lon, antennaHeightMeters: rxHeight };

      // Preload every tile intersected by the LOS sample points, then run the synchronous engine.
      const needed = new Set<string>();
      for (let i = 0; i <= sampleCount; i++) {
        const f = i / sampleCount;
        const lat = a.lat + (b.lat - a.lat) * f;
        const lon = a.lon + (b.lon - a.lon) * f;
        const tile = findDemTile(index, lat, lon);
        if (tile) needed.add(tile.name);
      }
      for (const name of needed) {
        const loaded = await window.rnmsOffline.loadDemTile(name);
        if (!loaded) throw new Error(`Unable to load DEM tile ${name}.`);
        cache.set(name, loaded.buffer);
        const actualSamples = Math.sqrt(loaded.buffer.byteLength / 2);
        if (Number.isInteger(actualSamples) && actualSamples !== 3601) {
          const t = index.find(x => x.name === name);
          if (t) t.samples = actualSamples;
        }
      }

      const r = calculateTerrainLos(index, readTile, a, b, sampleCount);
      setResult(r);
      if (!r.terrainAvailable) setError('DEM coverage is incomplete along this path. Add the missing HGT tiles.');
    } catch (e) { setError(e instanceof Error ? e.message : 'LOS calculation failed.'); setResult(null); }
    finally { setLoading(false); }
  };

  const chartData = result?.samples.map((p, i) => ({
    distance: Number((p.distanceMeters / 1000).toFixed(2)),
    elevation: p.terrainElevationMeters,
    ray: result.samples.length > 1 && p.terrainElevationMeters != null ?
      (result.samples[0].terrainElevationMeters! + txHeight) + ((result.samples.at(-1)!.terrainElevationMeters! + rxHeight) - (result.samples[0].terrainElevationMeters! + txHeight)) * (i / (result.samples.length - 1)) : null
  })) ?? [];

  const route = result?.samples.filter(p => p.terrainElevationMeters != null) ?? [];
  const minLat = Math.min(tx.lat, rx.lat), maxLat = Math.max(tx.lat, rx.lat);
  const minLon = Math.min(tx.lon, rx.lon), maxLon = Math.max(tx.lon, rx.lon);
  const project = (lat: number, lon: number) => ({
    x: 10 + ((lon - minLon) / Math.max(1e-9, maxLon - minLon)) * 80,
    y: 90 - ((lat - minLat) / Math.max(1e-9, maxLat - minLat)) * 80,
  });
  const pathD = route.map((p, i) => { const q = project(p.lat, p.lon); return `${i ? 'L' : 'M'} ${q.x} ${q.y}`; }).join(' ');
  const pa = project(tx.lat, tx.lon), pb = project(rx.lat, rx.lon);

  const panel = theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800';
  const muted = theme === 'light' ? 'text-slate-500' : 'text-slate-400';

  return <div className="p-4 md:p-6 space-y-4 overflow-y-auto h-full">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="text-xl font-bold">Real DEM LOS Profiler</h1><p className={`text-xs mt-1 ${muted}`}>Terrain profile calculated only from installed HGT elevation data.</p></div>
      <button onClick={loadIndex} disabled={loading} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold flex items-center gap-2"><RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Scan DEM</button>
    </div>

    <div className={`rounded-xl border p-4 ${panel}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <label className="text-xs font-semibold">TX site<select value={txId} onChange={e => setTxId(e.target.value)} className="mt-1 w-full p-2 rounded border bg-transparent">{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}{!sites.length && <option value="">Default TX</option>}</select></label>
        <label className="text-xs font-semibold">RX site<select value={rxId} onChange={e => setRxId(e.target.value)} className="mt-1 w-full p-2 rounded border bg-transparent">{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}{!sites.length && <option value="">Default RX</option>}</select></label>
        <label className="text-xs font-semibold">TX antenna (m)<input type="number" min="0" value={txHeight} onChange={e => setTxHeight(Number(e.target.value))} className="mt-1 w-full p-2 rounded border bg-transparent"/></label>
        <label className="text-xs font-semibold">RX antenna (m)<input type="number" min="0" value={rxHeight} onChange={e => setRxHeight(Number(e.target.value))} className="mt-1 w-full p-2 rounded border bg-transparent"/></label>
        <label className="text-xs font-semibold">Samples<input type="number" min="20" max="1000" value={sampleCount} onChange={e => setSampleCount(Number(e.target.value))} className="mt-1 w-full p-2 rounded border bg-transparent"/></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs"><span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800"><Database size={13} className="inline mr-1"/>DEM tiles: <b>{index.length}</b></span><span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">TX: {tx.lat.toFixed(5)}, {tx.lon.toFixed(5)}</span><span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">RX: {rx.lat.toFixed(5)}, {rx.lon.toFixed(5)}</span></div>
      <button onClick={runLos} disabled={loading || !index.length} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-2"><Activity size={16}/> Run Real DEM LOS</button>
      {error && <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs flex gap-2"><AlertTriangle size={16} className="shrink-0"/>{error}</div>}
    </div>

    {result && <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="DEM coverage" value={result.terrainAvailable ? 'COMPLETE' : 'INCOMPLETE'} good={result.terrainAvailable}/>
        <Metric label="Terrain LOS" value={result.obstructed ? 'OBSTRUCTED' : 'CLEAR'} good={!result.obstructed}/>
        <Metric label="Path distance" value={`${(result.distanceMeters / 1000).toFixed(2)} km`} />
        <Metric label="Minimum terrain clearance" value={result.minimumClearanceMeters == null ? '—' : `${result.minimumClearanceMeters.toFixed(1)} m`} />
      </div>

      <div className={`rounded-xl border p-4 ${panel}`}><div className="flex items-center gap-2 mb-3"><Activity size={17}/><h2 className="font-bold">Real terrain elevation profile</h2></div><div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="distance" type="number" unit=" km"/><YAxis unit=" m"/><Tooltip/><Line type="monotone" dataKey="elevation" name="Terrain" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="ray" name="LOS ray" strokeWidth={2} dot={false} strokeDasharray="6 4"/></LineChart></ResponsiveContainer></div></div>

      <div className={`rounded-xl border p-4 ${panel}`}><div className="flex items-center gap-2 mb-3"><Route size={17}/><h2 className="font-bold">LOS path map</h2></div><svg viewBox="0 0 100 100" className="w-full h-64 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800"><path d={pathD} fill="none" stroke="currentColor" strokeWidth="0.8"/><circle cx={pa.x} cy={pa.y} r="2" fill="currentColor"/><circle cx={pb.x} cy={pb.y} r="2" fill="currentColor"/><text x={pa.x+2} y={pa.y-2} fontSize="3">TX</text><text x={pb.x+2} y={pb.y-2} fontSize="3">RX</text></svg><div className={`text-xs mt-2 ${muted}`}><MapPin size={13} className="inline mr-1"/>Route geometry is plotted from the real site coordinates; the geographic basemap remains controlled by the offline PMTiles dataset.</div></div>
    </>}
  </div>;
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) { return <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900"><div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 font-bold text-sm flex items-center gap-1">{good === true ? <CheckCircle2 size={15}/> : good === false ? <XCircle size={15}/> : null}{value}</div></div>; }
