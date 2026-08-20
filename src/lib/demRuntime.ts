/** Real SRTM/HGT DEM runtime cache. HGT samples are signed 16-bit BIG-ENDIAN. */
export interface RuntimeDemTile { name: string; size: number; values: Int16Array; }
const tiles = new Map<string, RuntimeDemTile>();
const loading = new Map<string, Promise<boolean>>();

function normalizeLongitude(lng: number): number {
  if (lng === 180) return 179.999999999;
  return ((lng + 180) % 360 + 360) % 360 - 180;
}

export function hgtTileName(lat: number, lng: number): string {
  const safeLng = normalizeLongitude(lng);
  const latFloor = Math.floor(lat);
  const lngFloor = Math.floor(safeLng);
  return `${latFloor >= 0 ? 'N' : 'S'}${String(Math.abs(latFloor)).padStart(2, '0')}${lngFloor >= 0 ? 'E' : 'W'}${String(Math.abs(lngFloor)).padStart(3, '0')}.hgt`;
}

export function registerDemTile(name: string, size: number, values: Int16Array): void {
  tiles.set(name.toUpperCase(), { name: name.toUpperCase(), size, values });
}

export function registerHgtBuffer(name: string, buffer: ArrayBuffer, size: number): boolean {
  const expected = size * size;
  if (!Number.isInteger(size) || size < 2 || size > 7201 || buffer.byteLength !== expected * 2) return false;
  const view = new DataView(buffer);
  const values = new Int16Array(expected);
  for (let i = 0; i < expected; i++) values[i] = view.getInt16(i * 2, false);
  registerDemTile(name, size, values);
  return true;
}

export function clearDemTiles(): void { tiles.clear(); loading.clear(); }
export function getLoadedDemTileCount(): number { return tiles.size; }
export function isDemTileLoaded(name: string): boolean { return tiles.has(name.toUpperCase()); }

export function getRuntimeElevation(lat: number, lng: number): number | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90) return null;
  const tile = tiles.get(hgtTileName(lat, lng).toUpperCase());
  if (!tile) return null;
  const latBase = Math.floor(lat);
  const lngBase = Math.floor(normalizeLongitude(lng));
  const latFraction = lat - latBase;
  const lngFraction = normalizeLongitude(lng) - lngBase;
  const max = tile.size - 1;
  const row = (1 - latFraction) * max;
  const col = lngFraction * max;
  const r0 = Math.max(0, Math.min(max, Math.floor(row)));
  const c0 = Math.max(0, Math.min(max, Math.floor(col)));
  const r1 = Math.min(max, r0 + 1);
  const c1 = Math.min(max, c0 + 1);
  const rf = row - r0;
  const cf = col - c0;
  const sample = (r: number, c: number): number | null => {
    const value = tile.values[r * tile.size + c];
    return value === -32768 ? null : value;
  };
  const q11 = sample(r0, c0), q12 = sample(r0, c1), q21 = sample(r1, c0), q22 = sample(r1, c1);
  const valid = [q11, q12, q21, q22].filter((v): v is number => v !== null);
  if (!valid.length) return null;
  const a = q11 ?? valid[0], b = q12 ?? a, c = q21 ?? a, d = q22 ?? a;
  return a * (1 - rf) * (1 - cf) + b * (1 - rf) * cf + c * rf * (1 - cf) + d * rf * cf;
}

export async function loadDemTile(name: string): Promise<boolean> {
  const normalized = name.toUpperCase();
  if (tiles.has(normalized)) return true;
  if (!window.rnmsOffline?.loadDemTile) return false;
  if (loading.has(normalized)) return loading.get(normalized)!;
  const promise = window.rnmsOffline.loadDemTile(normalized).then(payload => {
    if (!payload?.buffer || !payload.size) return false;
    return registerHgtBuffer(payload.name, payload.buffer, payload.size);
  }).catch(() => false).finally(() => loading.delete(normalized));
  loading.set(normalized, promise);
  return promise;
}

export async function loadDemForCoordinates(points: Array<{lat: number; lng: number}>): Promise<number> {
  const names = [...new Set(points.map(p => hgtTileName(p.lat, p.lng).toUpperCase()))];
  const results = await Promise.all(names.map(loadDemTile));
  return results.filter(Boolean).length;
}

export async function loadDemForPath(points: Array<{lat: number; lng: number}>): Promise<{requested: number; loaded: number}> {
  const requested = new Set(points.map(p => hgtTileName(p.lat, p.lng).toUpperCase()));
  const loaded = await loadDemForCoordinates(points);
  return { requested: requested.size, loaded };
}
