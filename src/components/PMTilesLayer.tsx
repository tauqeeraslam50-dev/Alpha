import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { PMTiles, leafletRasterLayer, type Source, type RangeResponse } from 'pmtiles';

declare global {
  interface Window {
    rnmsOffline?: {
      readPMTilesRange?: (fileName: string, start: number, length: number) => Promise<ArrayBuffer>;
    };
  }
}

function createElectronSource(url: string): Source {
  const prefix = 'rnms://pmtiles/';
  const fileName = decodeURIComponent(url.startsWith(prefix) ? url.slice(prefix.length) : url);

  return {
    getKey: () => `rnms-local:${fileName}`,
    async getBytes(offset, length): Promise<RangeResponse> {
      const data = await window.rnmsOffline?.readPMTilesRange?.(fileName, offset, length);
      if (!data) throw new Error(`Unable to read PMTiles: ${fileName}`);
      return { data };
    },
  };
}

export function PMTilesLayer({
  url,
  minZoom = 0,
  maxZoom = 18,
  opacity = 1,
  attribution = 'Offline PMTiles',
}: {
  url: string;
  minZoom?: number;
  maxZoom?: number;
  opacity?: number;
  attribution?: string;
}) {
  const map = useMap();

  useEffect(() => {
    const source = createElectronSource(url);
    const archive = new PMTiles(source);
    const layer = leafletRasterLayer(archive, { minZoom, maxZoom, opacity, attribution } as any);
    layer.addTo(map);

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    };
  }, [map, url, minZoom, maxZoom, opacity, attribution]);

  return null;
}
