import JSZip from 'jszip';

const DB_NAME = 'rnms_offline_gis_db';
const DB_VERSION = 1;
const STORE_TILES = 'tiles';
const STORE_META = 'metadata';

// In-memory hot cache for instant MapLibre tile requests
export const memoryTileCache = new Map<string, Blob>();

let dbPromise: Promise<IDBDatabase> | null = null;

function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TILES)) {
        db.createObjectStore(STORE_TILES);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

/**
 * Normalize lookup keys for slippy map tiles
 */
export function getTileKeys(z: string | number, x: string | number, y: string | number, layer = ''): string[] {
  const keys: string[] = [];
  if (layer) {
    keys.push(`${layer}_${z}_${x}_${y}`);
    keys.push(`${layer}/${z}/${x}/${y}`);
    keys.push(`tiles/${layer}/${z}/${x}/${y}`);
  }
  keys.push(`${z}_${x}_${y}`);
  keys.push(`${z}/${x}/${y}`);
  keys.push(`tiles/${z}/${x}/${y}`);
  return keys;
}

/**
 * Retrieve a tile blob from memory cache or IndexedDB
 */
export async function getOfflineTileBlob(
  z: string | number,
  x: string | number,
  y: string | number,
  layer = ''
): Promise<Blob | null> {
  const keys = getTileKeys(z, x, y, layer);

  // 1. Check memory cache first
  for (const k of keys) {
    if (memoryTileCache.has(k)) {
      return memoryTileCache.get(k)!;
    }
  }

  // 2. Query IndexedDB if not in memory
  try {
    const db = await getDb();
    const tx = db.transaction(STORE_TILES, 'readonly');
    const store = tx.objectStore(STORE_TILES);

    for (const k of keys) {
      const blob = await new Promise<Blob | undefined>((resolve) => {
        const req = store.get(k);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      });

      if (blob) {
        memoryTileCache.set(k, blob);
        return blob;
      }
    }
  } catch {
    // Ignore IndexedDB error
  }

  return null;
}

/**
 * Save a batch of downloaded or imported tiles into both memory and IndexedDB
 */
export async function saveTilesToOfflineStore(
  tilesMap: Map<string, Blob>,
  metadata: {
    name: string;
    tileCount: number;
    bounds?: any;
    placesCount?: number;
    createdAt?: string;
  }
): Promise<void> {
  // Update memory cache
  for (const [key, blob] of tilesMap.entries()) {
    memoryTileCache.set(key, blob);
  }

  // Save to IndexedDB
  try {
    const db = await getDb();
    const tx = db.transaction([STORE_TILES, STORE_META], 'readwrite');
    const tileStore = tx.objectStore(STORE_TILES);
    const metaStore = tx.objectStore(STORE_META);

    for (const [key, blob] of tilesMap.entries()) {
      tileStore.put(blob, key);
    }

    metaStore.put(
      {
        ...metadata,
        tileCount: memoryTileCache.size,
        updatedAt: new Date().toISOString(),
      },
      'active_package'
    );

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to persist tiles to IndexedDB:', err);
  }
}

/**
 * Load all stored tiles from IndexedDB into memory on boot/reload
 */
export async function restoreOfflineTilesFromStore(): Promise<{
  tileCount: number;
  metadata: any | null;
}> {
  try {
    const db = await getDb();
    const tx = db.transaction([STORE_TILES, STORE_META], 'readonly');
    const tileStore = tx.objectStore(STORE_TILES);
    const metaStore = tx.objectStore(STORE_META);

    const meta = await new Promise<any>((resolve) => {
      const req = metaStore.get('active_package');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    const cursorReq = tileStore.openCursor();
    let count = 0;

    await new Promise<void>((resolve) => {
      cursorReq.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          memoryTileCache.set(cursor.key as string, cursor.value as Blob);
          count++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
    });

    return { tileCount: memoryTileCache.size, metadata: meta };
  } catch {
    return { tileCount: memoryTileCache.size, metadata: null };
  }
}

/**
 * Import and unpack a ZIP archive of offline map tiles (e.g. offline-pakistan-...zip)
 */
export async function importOfflineZipArchive(file: File | Blob): Promise<{
  tileCount: number;
  name: string;
  metadata: any;
  places: any[];
  terrainGrid: any | null;
}> {
  const zip = new JSZip();
  const unzipped = await zip.loadAsync(file);

  const tilesMap = new Map<string, Blob>();
  let places: any[] = [];
  let terrainGrid: any = null;
  let metadata: any = null;

  const tileRegex = /(?:^|\/|\\)(?:(?:tiles\/)?([a-zA-Z0-9_-]+)\/)?(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg|webp)$/i;

  const entries = Object.entries(unzipped.files);

  for (const [path, zipEntry] of entries) {
    if (zipEntry.dir) continue;

    // Check if metadata.json
    if (path.endsWith('metadata.json')) {
      try {
        const text = await zipEntry.async('string');
        metadata = JSON.parse(text);
      } catch {}
      continue;
    }

    // Check if places gazetteer
    if (path.endsWith('pakistan_places_gazetteer.json')) {
      try {
        const text = await zipEntry.async('string');
        places = JSON.parse(text);
      } catch {}
      continue;
    }

    // Check if terrain elevation grid
    if (path.endsWith('terrain_elevation_grid.json')) {
      try {
        const text = await zipEntry.async('string');
        terrainGrid = JSON.parse(text);
      } catch {}
      continue;
    }

    // Check if tile image
    const match = path.match(tileRegex);
    if (match) {
      const layer = match[1] || '';
      const z = match[2];
      const x = match[3];
      const y = match[4];

      const blob = await zipEntry.async('blob');

      if (layer) {
        tilesMap.set(`${layer}_${z}_${x}_${y}`, blob);
        tilesMap.set(`${layer}/${z}/${x}/${y}`, blob);
      }
      tilesMap.set(`${z}_${x}_${y}`, blob);
      tilesMap.set(`${z}/${x}/${y}`, blob);
    }
  }

  const name =
    metadata?.name ||
    (file instanceof File ? file.name.replace(/\.zip$/i, '') : 'Imported Offline Package');

  if (tilesMap.size === 0) {
    throw new Error('No valid map tiles (z/x/y.png) found inside this ZIP package.');
  }

  await saveTilesToOfflineStore(tilesMap, {
    name,
    tileCount: tilesMap.size,
    bounds: metadata?.bounds,
    placesCount: places.length,
  });

  return {
    tileCount: tilesMap.size,
    name,
    metadata,
    places,
    terrainGrid,
  };
}

/**
 * Clear all offline stored tiles from memory and IndexedDB
 */
export async function clearAllOfflineTiles(): Promise<void> {
  memoryTileCache.clear();
  try {
    const db = await getDb();
    const tx = db.transaction([STORE_TILES, STORE_META], 'readwrite');
    tx.objectStore(STORE_TILES).clear();
    tx.objectStore(STORE_META).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {}
}
