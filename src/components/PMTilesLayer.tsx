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
  if (value.includes('PNG')) return 'image/png';
  return 'image/jpeg';
}

function normalizePMTilesUrl(url: string) {
  if (!url) return '';
  if (url.startsWith('rnms://pmtiles/')) return url;

  try {
    const parsed = new URL(url);
    const fileName = decodeURIComponent(parsed.pathname.split('/').pop() || '');
    if (fileName.toLowerCase().endsWith('.pmtiles')) {
      return `rnms://pmtiles/${encodeURIComponent(fileName)}`;
    }
  } catch {
    // Continue with plain/local path handling.
  }

  const fileName = url.split(/[\\/]/).pop() || '';
  if (fileName.toLowerCase().endsWith('.pmtiles')) {
    return `rnms://pmtiles/${encodeURIComponent(fileName)}`;
  }

  return url;
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
    const sourceUrl = normalizePMTilesUrl(url);
    if (!sourceUrl) return;

    console.log('[RNMS] Loading offline PMTiles:', sourceUrl);

    const archive = new PMTiles(sourceUrl);
    const objectUrls = new Set<string>();
    let mimeType = 'image/jpeg';

    class OfflinePMTilesGrid extends L.GridLayer {
      createTile(coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement('img');
        tile.alt = '';
        tile.setAttribute('role', 'presentation');
        tile.width = 256;
        tile.height = 256;

        archive.getTile(coords.z, coords.x, coords.y)
          .then((result) => {
            if (!result?.data) {
              done(new Error(`No offline tile at z=${coords.z} x=${coords.x} y=${coords.y}`), tile);
              return;
            }

            const blob = new Blob([result.data], { type: mimeType });
            const objectUrl = URL.createObjectURL(blob);
            objectUrls.add(objectUrl);
            tile.onload = () => done(undefined, tile);
            tile.onerror = () => done(new Error('Offline PMTiles tile image failed to decode'), tile);
            tile.src = objectUrl;
          })
          .catch((error) => {
            console.error('[RNMS] PMTiles tile error:', error);
            done(error instanceof Error ? error : new Error(String(error)), tile);
          });

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

    archive.getHeader()
      .then((header: any) => {
        mimeType = mimeForTileType(header.tileType);
        console.log('[RNMS] PMTiles header loaded:', {
          tileType: header.tileType,
          minZoom: header.minZoom,
          maxZoom: header.maxZoom,
          bounds: header.bounds,
        });
        layer.addTo(map);
      })
      .catch((error: any) => {
        console.error('[RNMS] PMTiles header failed:', error);
      });

    return () => {
      if (map.hasLayer(layer)) map.removeLayer(layer);
      for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
      objectUrls.clear();
    };
  }, [map, url, minZoom, maxZoom, opacity, attribution]);

  return null;
}
