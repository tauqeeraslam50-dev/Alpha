import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { PMTiles } from 'pmtiles';
import L from 'leaflet';

type PMTilesLayerProps = {
  url: string;
  minZoom?: number;
  maxZoom?: number;
  opacity?: number;
  attribution?: string;
};

function mimeForTileType(tileType: unknown) {
  const value = String(tileType ?? '').toUpperCase();
  if (value.includes('JPEG')) return 'image/jpeg';
  if (value.includes('WEBP')) return 'image/webp';
  return 'image/png';
}

export function PMTilesLayer({
  url,
  minZoom = 0,
  maxZoom = 18,
  opacity = 1,
  attribution = 'Offline PMTiles',
}: PMTilesLayerProps) {
  const map = useMap();

  useEffect(() => {
    const archive = new PMTiles(url);
    let objectUrls = new Set<string>();
    let mimeType = 'image/png';

    class OfflinePMTilesGrid extends L.GridLayer {
      createTile(coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement('img');
        tile.alt = '';
        tile.setAttribute('role', 'presentation');
        tile.width = 256;
        tile.height = 256;

        archive
          .getTile(coords.z, coords.x, coords.y)
          .then((result) => {
            if (!result?.data) {
              done(new Error(`No offline tile at z=${coords.z} x=${coords.x} y=${coords.y}`), tile);
              return;
            }

            const blob = new Blob([result.data], { type: mimeType });
            const objectUrl = URL.createObjectURL(blob);
            objectUrls.add(objectUrl);
            tile.onload = () => done(undefined, tile);
            tile.onerror = () => done(new Error('Offline satellite tile image failed to decode'), tile);
            tile.src = objectUrl;
          })
          .catch((error) => done(error instanceof Error ? error : new Error(String(error)), tile));

        return tile;
      }
    }

    const layer = new OfflinePMTilesGrid({
      tileSize: 256,
      minZoom,
      maxZoom,
      opacity,
      attribution,
      updateWhenIdle: true,
      keepBuffer: 2,
    });

    archive
      .getHeader()
      .then((header) => {
        mimeType = mimeForTileType(header.tileType);
        layer.addTo(map);
      })
      .catch((error) => {
        console.error('Offline PMTiles header failed:', error);
        layer.addTo(map);
      });

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
      objectUrls.clear();
    };
  }, [map, url, minZoom, maxZoom, opacity, attribution]);

  return null;
}
