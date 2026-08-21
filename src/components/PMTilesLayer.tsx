import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { PMTiles, leafletRasterLayer } from 'pmtiles';

/** Displays a raster PMTiles archive in Leaflet using PMTiles byte-range reads. */
export function PMTilesLayer({ url, minZoom = 0, maxZoom = 18, opacity = 1, attribution = 'Offline PMTiles' }: {
  url: string;
  minZoom?: number;
  maxZoom?: number;
  opacity?: number;
  attribution?: string;
}) {
  const map = useMap();

  useEffect(() => {
    const archive = new PMTiles(url);
    const layer = leafletRasterLayer(archive, { minZoom, maxZoom, opacity, attribution } as any);
    layer.addTo(map);
    return () => { map.removeLayer(layer); };
  }, [map, url, minZoom, maxZoom, opacity, attribution]);

  return null;
}
