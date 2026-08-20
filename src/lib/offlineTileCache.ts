/**
 * Offline Tile Storage & IndexedDB Tile Cache
 * Provides high-speed IndexedDB caching for map tiles and vector geometry.
 * Ensures map operates seamlessly in 100% air-gapped / offline environments.
 */

const DB_NAME = 'RNMS_OFFLINE_MAP_CACHE';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';

export interface CachedTile {
  key: string; // `z_x_y_layer`
  z: number;
  x: number;
  y: number;
  layer: string;
  dataUrl: string; // Base64 image data
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('layer', 'layer', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.warn('IndexedDB failed to open, falling back to in-memory cache', event);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

// Memory fallback cache in case IndexedDB is restricted in sandboxes
const memoryCache = new Map<string, string>();

/**
 * Save a tile image into offline storage
 */
export async function saveTileToCache(
  z: number, 
  x: number, 
  y: number, 
  layer: string, 
  dataUrl: string
): Promise<void> {
  const key = `${layer}_${z}_${x}_${y}`;
  memoryCache.set(key, dataUrl);

  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: CachedTile = {
        key,
        z,
        x,
        y,
        layer,
        dataUrl,
        timestamp: Date.now()
      };
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Memory cache already set
  }
}

/**
 * Retrieve a cached tile from offline storage
 */
export async function getTileFromCache(
  z: number, 
  x: number, 
  y: number, 
  layer: string
): Promise<string | null> {
  const key = `${layer}_${z}_${x}_${y}`;
  if (memoryCache.has(key)) {
    return memoryCache.get(key) || null;
  }

  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result) {
          memoryCache.set(key, req.result.dataUrl);
          resolve(req.result.dataUrl);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Get total number of cached tiles in storage
 */
export async function getCachedTileCount(): Promise<number> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(memoryCache.size);
    });
  } catch {
    return memoryCache.size;
  }
}

/**
 * Clear all cached tiles
 */
export async function clearTileCache(): Promise<void> {
  memoryCache.clear();
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }
}

/**
 * Export all cached tiles to a JSON string for offline bundle transfer
 */
export async function exportTileCachePackage(): Promise<string> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const payload = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          tiles: req.result || []
        };
        resolve(JSON.stringify(payload));
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return JSON.stringify({ tiles: [] });
  }
}

/**
 * Import a tile package into offline storage
 */
export async function importTileCachePackage(jsonContent: string): Promise<number> {
  try {
    const parsed = JSON.parse(jsonContent);
    const tiles: CachedTile[] = parsed.tiles || [];
    if (!tiles.length) return 0;

    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let count = 0;

      tiles.forEach(tile => {
        store.put(tile);
        memoryCache.set(tile.key, tile.dataUrl);
        count++;
      });

      tx.oncomplete = () => resolve(count);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Error importing tile package:', err);
    throw err;
  }
}
