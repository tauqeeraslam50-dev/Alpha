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

export function OfflineMap({ filePath, onStatus }: { filePath?: string; onStatus: (s: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      center: [69.3451, 30.3753],
      zoom: 4.5,
      minZoom: 2,
      maxZoom: 18,
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
      const url = localUrl(filePath);
      try {
        const archive = new PMTiles(url);
        const header = await archive.getHeader();
        if (cancelled) return;
        const sourceUrl = archiveUrl(filePath);
        const sourceId = 'offline-pmtiles';
        for (const id of ['offline-labels', 'offline-lines', 'offline-fill', sourceId]) {
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        const bounds: [[number, number], [number, number]] = [[header.minLon, header.minLat], [header.maxLon, header.maxLat]];
        if (header.tileType === 1 || header.tileType === 2 || header.tileType === 3 || header.tileType === 4 || header.tileType === 5) {
          map.addSource(sourceId, { type: 'raster', url: sourceUrl, tileSize: 256 });
          map.addLayer({ id: 'offline-fill', type: 'raster', source: sourceId, paint: { 'raster-opacity': 1 } });
        } else {
          const metadata: any = await archive.getMetadata();
          map.addSource(sourceId, { type: 'vector', url: sourceUrl });
          const vectorLayers = Array.isArray(metadata?.vector_layers) ? metadata.vector_layers : [];
          if (!vectorLayers.length) {
            map.addLayer({ id: 'offline-fill', type: 'fill', source: sourceId, paint: { 'fill-color': '#8aa0b2', 'fill-opacity': 0.45 } });
          } else {
            vectorLayers.forEach((layer: any, index: number) => {
              const id = String(layer.id).replace(/[^a-zA-Z0-9_-]/g, '_');
              map.addLayer({ id: `offline-fill-${id}`, type: 'fill', source: sourceId, 'source-layer': layer.id, paint: { 'fill-color': index % 2 ? '#c6d4df' : '#9fb4c4', 'fill-opacity': 0.35 } });
              map.addLayer({ id: `offline-lines-${id}`, type: 'line', source: sourceId, 'source-layer': layer.id, paint: { 'line-color': '#526b7b', 'line-width': 1 } });
              map.addLayer({ id: `offline-labels-${id}`, type: 'symbol', source: sourceId, 'source-layer': layer.id, layout: { 'text-field': ['coalesce', ['get', 'name'], ['get', 'name:en']], 'text-size': 11, 'text-font': ['Open Sans Regular'] }, paint: { 'text-color': '#253746', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 } });
            });
          }
        }
        map.fitBounds(bounds, { padding: 50, duration: 500, maxZoom: Math.max(5, Math.min(header.maxZoom, 10)) });
        onStatus(`Loaded ${header.tileType === 1 || header.tileType === 2 || header.tileType === 3 || header.tileType === 4 || header.tileType === 5 ? 'raster' : 'vector'} PMTiles · Z${header.minZoom}–Z${header.maxZoom}`);
      } catch (e: any) {
        const message = e?.message || String(e);
        setError(message);
        onStatus('Unable to open this PMTiles archive');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [filePath, onStatus]);

  return <div className="map-canvas"><div ref={container} className="maplibre-container" />{error && <div className="map-error">{error}</div>}</div>;
}
