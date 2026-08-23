import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

function archiveUrl(filePath: string) {
  return `pmtiles://local-pmtiles://${encodeURIComponent(filePath)}`;
}
function localUrl(filePath: string) {
  return `local-pmtiles://${encodeURIComponent(filePath)}`;
}
const isRaster = (tileType: number) => [1, 2, 3, 4, 5].includes(tileType);

export function OfflineMap({ filePath, onStatus }: { filePath?: string; onStatus: (s: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      center: [69.3451, 30.3753], zoom: 4.5, minZoom: 2, maxZoom: 18,
      style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dce6ee' } }] },
      attributionControl: false,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('mousemove', (e) => onStatus(`${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}  |  Zoom ${map.getZoom().toFixed(1)}`));
    map.on('error', (e) => { if (e.error?.message) setError(e.error.message); });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = undefined; };
  }, [onStatus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !filePath) return;
    let cancelled = false;
    const load = async () => {
      setError('');
      onStatus('Reading PMTiles metadata…');
      try {
        const archive = new PMTiles(localUrl(filePath));
        const header = await archive.getHeader();
        if (cancelled) return;
        const sourceId = 'offline-pmtiles';
        const sourceUrl = archiveUrl(filePath);
        for (const layer of map.getStyle().layers) if (layer.id !== 'background') map.removeLayer(layer.id);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        const bounds: [[number, number], [number, number]] = [[header.minLon, header.minLat], [header.maxLon, header.maxLat]];
        if (isRaster(header.tileType)) {
          map.addSource(sourceId, { type: 'raster', url: sourceUrl, tileSize: 256 });
          map.addLayer({ id: 'offline-raster', type: 'raster', source: sourceId, paint: { 'raster-opacity': 1 } });
        } else {
          const metadata: any = await archive.getMetadata();
          map.addSource(sourceId, { type: 'vector', url: sourceUrl });
          const vectorLayers = Array.isArray(metadata?.vector_layers) ? metadata.vector_layers : [];
          if (!vectorLayers.length) {
            map.addLayer({ id: 'offline-vector', type: 'fill', source: sourceId, paint: { 'fill-color': '#8aa0b2', 'fill-opacity': 0.45 } });
          } else {
            vectorLayers.forEach((layer: any, index: number) => {
              const id = String(layer.id).replace(/[^a-zA-Z0-9_-]/g, '_');
              map.addLayer({ id: `offline-fill-${id}`, type: 'fill', source: sourceId, 'source-layer': layer.id, paint: { 'fill-color': index % 2 ? '#c6d4df' : '#9fb4c4', 'fill-opacity': 0.35 } });
              map.addLayer({ id: `offline-line-${id}`, type: 'line', source: sourceId, 'source-layer': layer.id, paint: { 'line-color': '#526b7b', 'line-width': 1 } });
            });
          }
        }
        map.fitBounds(bounds, { padding: 50, duration: 500, maxZoom: Math.max(5, Math.min(header.maxZoom, 10)) });
        onStatus(`Loaded ${isRaster(header.tileType) ? 'raster' : 'vector'} PMTiles · Z${header.minZoom}–Z${header.maxZoom}`);
      } catch (e: any) {
        const message = e?.message || String(e);
        setError(message);
        onStatus('Unable to open this PMTiles archive');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [filePath, onStatus]);

  return <div className="map-canvas"><div ref={container} className="maplibre-container" />{error && <div className="map-error">{error}</div>}</div>;
}
