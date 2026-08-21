import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import * as L from 'leaflet';
import { PMTiles, Protocol } from 'pmtiles';

/**
 * Renders a local PMTiles archive through Leaflet's GridLayer.
 * The archive URL is handled by Electron's rnms:// protocol and supports
 * HTTP Range requests, so the complete archive is never loaded into memory.
 */
export function PMTilesLayer({ url, minZoom = 0, maxZoom = 18, opacity = 1 }: {
  url: string;
  minZoom?: number;
  maxZoom?: number;
  opacity?: number;
}) {
  const map = useMap();

  useEffect(() => {
    const protocol = new Protocol();
    const archive = new PMTiles(url);
    protocol.add(archive);
    (L as any).addProtocol?.('pmtiles', protocol);

    const layer = new (L as any).TileLayer('pmtiles://' + url.replace(/^pmtiles:\/\//, ''), {
      minZoom,
      maxZoom,
      opacity,
      tileSize: 256,
      noWrap: true,
      attribution: 'Offline PMTiles'
    });
    layer.addTo(map);

    return () => {
      map.removeLayer(layer);
      try { (L as any).removeProtocol?.('pmtiles'); } catch { /* noop */ }
    };
  }, [map, url, minZoom, maxZoom, opacity]);

  return null;
}
