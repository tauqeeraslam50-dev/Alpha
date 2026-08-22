import { useEffect, useMemo, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';

let pmtilesProtocolInstalled = false;

function installPMTilesProtocol() {
  if (pmtilesProtocolInstalled) return;
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  pmtilesProtocolInstalled = true;
}

type SiteLike = { id: string; lat: number; lng: number; name?: string; type?: string };
type LinkLike = { id: string; sourceSiteId: string; targetSiteId: string };

export function MapLibreOfflineMap({
  vectorUrl,
  center,
  sites,
  links,
}: {
  vectorUrl: string;
  center: [number, number];
  sites: SiteLike[];
  links: LinkLike[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const linkGeoJson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: links.flatMap((link) => {
      const a = siteMap.get(link.sourceSiteId);
      const b = siteMap.get(link.targetSiteId);
      return a && b ? [{
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      }] : [];
    }),
  }), [links, siteMap]);

  const siteGeoJson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: sites.map((site) => ({
      type: 'Feature' as const,
      properties: { id: site.id, name: site.name || '', type: site.type || '' },
      geometry: { type: 'Point' as const, coordinates: [site.lng, site.lat] },
    })),
  }), [sites]);

  useEffect(() => {
    if (!containerRef.current || !vectorUrl) return;
    installPMTilesProtocol();

    const map = new maplibregl.Map({
      container: containerRef.current,
      center,
      zoom: 5,
      minZoom: 2,
      maxZoom: 16,
      attributionControl: true,
      style: {
        version: 8,
        sources: {
          pakistan: {
            type: 'vector',
            url: `pmtiles://${vectorUrl}`,
          },
          links: {
            type: 'geojson',
            data: linkGeoJson,
          },
          sites: {
            type: 'geojson',
            data: siteGeoJson,
          },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#eef2e6' } },
          { id: 'land', type: 'fill', source: 'pakistan', 'source-layer': 'land', paint: { 'fill-color': '#e8ecd9' } },
          { id: 'water', type: 'fill', source: 'pakistan', 'source-layer': 'water_polygons', paint: { 'fill-color': '#b9d9ee' } },
          { id: 'water-lines', type: 'line', source: 'pakistan', 'source-layer': 'water_lines', paint: { 'line-color': '#7fb5d6', 'line-width': 1.5 } },
          { id: 'boundaries', type: 'line', source: 'pakistan', 'source-layer': 'boundaries', minzoom: 3, paint: { 'line-color': '#8d7a67', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 1.2, 12, 2], 'line-dasharray': [3, 2] } },
          { id: 'streets-casing', type: 'line', source: 'pakistan', 'source-layer': 'streets', minzoom: 5, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 3, 15, 10], 'line-opacity': 0.9 } },
          { id: 'streets', type: 'line', source: 'pakistan', 'source-layer': 'streets', minzoom: 5, paint: {
            'line-color': ['match', ['get', 'kind'], 'motorway', '#d94b4b', 'trunk', '#e07a3f', 'primary', '#e2a22b', 'secondary', '#f0c85a', 'tertiary', '#f5e7a0', 'residential', '#c7c7c7', 'service', '#b8b8b8', '#9c9c9c'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 2, 15, 7],
          } },
          { id: 'street-labels-dots', type: 'circle', source: 'pakistan', 'source-layer': 'place_labels', minzoom: 4, paint: { 'circle-radius': 4, 'circle-opacity': 0 } },
          { id: 'links', type: 'line', source: 'links', paint: { 'line-color': '#10b981', 'line-width': 3, 'line-dasharray': [3, 2] } },
          { id: 'sites', type: 'circle', source: 'sites', paint: { 'circle-radius': 7, 'circle-color': ['match', ['get', 'type'], 'repeater', '#eab308', '#2563eb'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } },
        ],
      },
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    const updateLabels = () => {
      const host = labelsRef.current;
      if (!host || !map.isStyleLoaded()) return;
      host.replaceChildren();
      let features: any[] = [];
      try { features = map.queryRenderedFeatures(undefined, { layers: ['street-labels-dots'] }); } catch { return; }
      const seen = new Set<string>();
      for (const feature of features.slice(0, 120)) {
        const name = feature?.properties?.name_en || feature?.properties?.name || '';
        if (!name || seen.has(name) || feature.geometry?.type !== 'Point') continue;
        seen.add(name);
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const point = map.project([lng, lat]);
        const el = document.createElement('div');
        el.textContent = name;
        el.style.position = 'absolute';
        el.style.transform = 'translate(-50%, -100%)';
        el.style.left = `${point.x}px`;
        el.style.top = `${point.y}px`;
        el.style.font = '600 12px Arial, sans-serif';
        el.style.color = '#25313b';
        el.style.textShadow = '0 1px 2px #fff, 0 -1px 2px #fff, 1px 0 2px #fff, -1px 0 2px #fff';
        el.style.pointerEvents = 'none';
        host.appendChild(el);
      }
    };

    map.on('load', updateLabels);
    map.on('move', updateLabels);
    map.on('zoom', updateLabels);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [vectorUrl, center, linkGeoJson, siteGeoJson]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <div ref={labelsRef} className="absolute inset-0 pointer-events-none z-[400] overflow-hidden" />
      <div className="absolute top-4 left-4 z-[500] rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-300 dark:border-slate-700 px-3 py-2 text-xs shadow-xl">
        <b>OFFLINE PAKISTAN STREET MAP</b>
        <div className="text-slate-500 mt-1">MapLibre + Shortbread PMTiles + OpenStreetMap</div>
      </div>
    </div>
  );
}
