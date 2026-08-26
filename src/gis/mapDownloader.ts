import JSZip from 'jszip';
import { ONLINE_MAP_LAYERS } from './mapLayers';

export interface DownloadArea {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  minZoom: number;
  maxZoom: number;
  layerIds: string[]; // e.g. ['esri-satellite', 'carto-voyager']
}

export interface DownloadProgress {
  totalTiles: number;
  completedTiles: number;
  failedTiles: number;
  percent: number;
  currentZoom: number;
  status: 'idle' | 'downloading' | 'packaging' | 'completed' | 'cancelled' | 'error';
  errorMessage?: string;
}

// Convert WGS84 Lat/Lng to Slippy Map Tile (X, Y)
export function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

// Calculate total tile count for an area and zoom range
export function calculateTileCount(area: DownloadArea): number {
  let count = 0;
  for (let z = area.minZoom; z <= area.maxZoom; z++) {
    const minTile = latLngToTile(area.maxLat, area.minLng, z);
    const maxTile = latLngToTile(area.minLat, area.maxLng, z);

    const xSpan = Math.abs(maxTile.x - minTile.x) + 1;
    const ySpan = Math.abs(maxTile.y - minTile.y) + 1;
    count += xSpan * ySpan * area.layerIds.length;
  }
  return count;
}

// Format tile URL
function formatTileUrl(layerId: string, z: number, x: number, y: number): string {
  const layer = ONLINE_MAP_LAYERS[layerId];
  if (!layer) return '';

  const subdomains = layer.subdomains || ['a', 'b', 'c', 'd'];
  const s = subdomains[(x + y) % subdomains.length];

  return layer.url
    .replace('{s}', s)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', '');
}

/**
 * Downloads map tiles for specified bounding box & zoom levels,
 * packages them into a standard z/x/y folder structure inside a ZIP archive,
 * and caches them for offline use.
 */
export async function downloadOfflineMapBundle(
  area: DownloadArea,
  onProgress: (progress: DownloadProgress) => void,
  signal?: AbortSignal
): Promise<{ blob: Blob; fileName: string; tileBlobsMap: Map<string, Blob> }> {
  const zip = new JSZip();
  const tileBlobsMap = new Map<string, Blob>();

  const totalTiles = calculateTileCount(area);
  let completedTiles = 0;
  let failedTiles = 0;

  onProgress({
    totalTiles,
    completedTiles: 0,
    failedTiles: 0,
    percent: 0,
    currentZoom: area.minZoom,
    status: 'downloading',
  });

  // Concurrency worker queue
  const CONCURRENCY_LIMIT = 8;
  const tileQueue: Array<{
    layerId: string;
    z: number;
    x: number;
    y: number;
    url: string;
  }> = [];

  for (const layerId of area.layerIds) {
    for (let z = area.minZoom; z <= area.maxZoom; z++) {
      const minTile = latLngToTile(area.maxLat, area.minLng, z);
      const maxTile = latLngToTile(area.minLat, area.maxLng, z);

      const startX = Math.min(minTile.x, maxTile.x);
      const endX = Math.max(minTile.x, maxTile.x);
      const startY = Math.min(minTile.y, maxTile.y);
      const endY = Math.max(minTile.y, maxTile.y);

      for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
          const url = formatTileUrl(layerId, z, x, y);
          if (url) {
            tileQueue.push({ layerId, z, x, y, url });
          }
        }
      }
    }
  }

  let queueIndex = 0;

  async function fetchWorker() {
    while (queueIndex < tileQueue.length) {
      if (signal?.aborted) throw new Error('Download cancelled by user');

      const item = tileQueue[queueIndex++];
      try {
        const response = await fetch(item.url, { signal });
        if (response.ok) {
          const blob = await response.blob();
          const buffer = await blob.arrayBuffer();

          const isMultipleLayers = area.layerIds.length > 1;
          const zipPath = isMultipleLayers
            ? `${item.layerId}/${item.z}/${item.x}/${item.y}.png`
            : `${item.z}/${item.x}/${item.y}.png`;

          zip.file(zipPath, buffer);

          // Store in memory map
          const key1 = `${item.layerId}_${item.z}_${item.x}_${item.y}`;
          const key2 = `${item.z}_${item.x}_${item.y}`;
          tileBlobsMap.set(key1, blob);
          tileBlobsMap.set(key2, blob);

          completedTiles++;
        } else {
          failedTiles++;
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        failedTiles++;
      }

      const pct = Math.round(((completedTiles + failedTiles) / totalTiles) * 100);
      onProgress({
        totalTiles,
        completedTiles,
        failedTiles,
        percent: pct,
        currentZoom: item.z,
        status: 'downloading',
      });
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, tileQueue.length) }, () =>
    fetchWorker()
  );

  await Promise.all(workers);

  onProgress({
    totalTiles,
    completedTiles,
    failedTiles,
    percent: 100,
    currentZoom: area.maxZoom,
    status: 'packaging',
  });

  // Generate Metadata Info file
  const metaJson = JSON.stringify(
    {
      name: area.name,
      createdAt: new Date().toISOString(),
      bounds: {
        minLat: area.minLat,
        maxLat: area.maxLat,
        minLng: area.minLng,
        maxLng: area.maxLng,
      },
      zoomRange: [area.minZoom, area.maxZoom],
      layers: area.layerIds,
      totalTiles: completedTiles,
    },
    null,
    2
  );
  zip.file('metadata.json', metaJson);

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const cleanName = area.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const fileName = `offline-map-${cleanName}-z${area.minZoom}-z${area.maxZoom}.zip`;

  onProgress({
    totalTiles,
    completedTiles,
    failedTiles,
    percent: 100,
    currentZoom: area.maxZoom,
    status: 'completed',
  });

  return { blob: zipBlob, fileName, tileBlobsMap };
}
