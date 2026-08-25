import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

const localUrl = (filePath: string) => `local-pmtiles://${encodeURIComponent(filePath)}`;
const archiveUrl = (filePath: string) => `pmtiles://local-pmtiles://${encodeURIComponent(filePath)}`;
const isRaster = (tileType: number) => [1, 2, 3, 4, 5].includes(tileType);

declare global { interface Window { rnmsOffline?: { selectMapFolder: () => Promise<string | null>; scanMapFolder: (folder: string) => Promise<Array<{name:string;path:string;relative:string;size:number;extension:string}>>; selectMapFile: () => Promise<string | null>; getDefaultMapFolder: () => Promise<string>; }; } }

export function OfflineMapEngine({ onStatus }: { onStatus?: (status: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>();
  const [filePath, setFilePath] = useState('');
  const [files, setFiles] = useState<Array<{name:string;path:string;relative:string;size:number;extension:string}>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: container.current, center: [69.3451, 30.3753], zoom: 4.5, minZoom: 2, maxZoom: 18, style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dce6ee' } }] }, attributionControl: false });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('mousemove', e => onStatus?.(`${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}  |  Zoom ${map.getZoom().toFixed(1)}`));
    map.on('error', e => { if (e.error?.message) setError(e.error.message); });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = undefined; };
  }, [onStatus]);

  const chooseFolder = async () => {
    const folder = await window.rnmsOffline?.selectMapFolder();
    if (!folder) return;
    const result = await window.rnmsOffline?.scanMapFolder(folder);
    const pmtiles = (result ?? []).filter(f => f.extension === '.pmtiles');
    setFiles(pmtiles);
    if (pmtiles.length) setFilePath(pmtiles[0].path);
    onStatus?.(`${pmtiles.length} offline PMTiles archive(s) found`);
  };

  const chooseFile = async () => { const selected = await window.rnmsOffline?.selectMapFile(); if (selected) setFilePath(selected); };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !filePath) return;
    let cancelled = false;
    const load = async () => {
      setError(''); onStatus?.('Reading offline PMTiles metadata…');
      try {
        const archive = new PMTiles(localUrl(filePath));
        const header = await archive.getHeader();
        if (cancelled) return;
        const sourceId = 'rnms-offline-pmtiles';
        for (const layer of [...map.getStyle().layers]) if (layer.id !== 'background') map.removeLayer(layer.id);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        const bounds: [[number,number],[number,number]] = [[header.minLon, header.minLat], [header.maxLon, header.maxLat]];
        if (isRaster(header.tileType)) {
          map.addSource(sourceId, { type: 'raster', url: archiveUrl(filePath), tileSize: 256 });
          map.addLayer({ id: 'rnms-offline-raster', type: 'raster', source: sourceId });
        } else {
          const metadata: any = await archive.getMetadata();
          map.addSource(sourceId, { type: 'vector', url: archiveUrl(filePath) });
          const layers = Array.isArray(metadata?.vector_layers) ? metadata.vector_layers : [];
          layers.forEach((layer: any, i: number) => {
            const id = String(layer.id).replace(/[^a-zA-Z0-9_-]/g, '_');
            map.addLayer({ id: `rnms-fill-${id}`, type: 'fill', source: sourceId, 'source-layer': layer.id, paint: { 'fill-color': i % 2 ? '#c6d4df' : '#9fb4c4', 'fill-opacity': 0.35 } });
            map.addLayer({ id: `rnms-line-${id}`, type: 'line', source: sourceId, 'source-layer': layer.id, paint: { 'line-color': '#526b7b', 'line-width': 1 } });
          });
        }
        map.fitBounds(bounds, { padding: 50, duration: 500, maxZoom: Math.max(5, Math.min(header.maxZoom, 10)) });
        onStatus?.(`Loaded ${isRaster(header.tileType) ? 'raster' : 'vector'} PMTiles · Z${header.minZoom}–Z${header.maxZoom}`);
      } catch (e: any) { setError(e?.message || String(e)); onStatus?.('Unable to open offline PMTiles'); }
    };
    void load();
    return () => { cancelled = true; };
  }, [filePath, onStatus]);

  return <div className="relative w-full h-full overflow-hidden rounded-xl">
    <div ref={container} className="w-full h-full" />
    <div className="absolute top-3 left-3 z-20 flex gap-2 bg-white/95 p-2 rounded-lg shadow border border-slate-200">
      <button onClick={chooseFolder} className="px-3 py-1.5 text-xs font-bold rounded bg-emerald-600 text-white">Open Map Folder</button>
      <button onClick={chooseFile} className="px-3 py-1.5 text-xs font-bold rounded bg-blue-600 text-white">Open PMTiles</button>
      {files.length > 1 && <select value={filePath} onChange={e => setFilePath(e.target.value)} className="text-xs border rounded px-2">{files.map(f => <option key={f.path} value={f.path}>{f.relative}</option>)}</select>}
    </div>
    {error && <div className="absolute bottom-3 left-3 right-3 z-20 bg-red-50 text-red-700 border border-red-200 rounded-lg p-2 text-xs">{error}</div>}
  </div>;
}
