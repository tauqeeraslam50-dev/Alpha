/** Runtime DEM cache used by the LOS engine.
 * Real SRTM/HGT tiles are loaded by Electron and registered here.
 * No synthetic elevation is generated in this module.
 */

export interface RuntimeDemTile {
  name: string;
  size: number;
  values: Int16Array;
}

const tiles = new Map<string, RuntimeDemTile>();

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

export function clearDemTiles(): void {
  tiles.clear();
}

export function getLoadedDemTileCount(): number {
  return tiles.size;
}

export function getRuntimeElevation(lat: number, lng: number): number | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90) return null;

  const name = hgtTileName(lat, lng).toUpperCase();
  const tile = tiles.get(name);
  if (!tile) return null;

  const latBase = Math.floor(lat);
  const lngBase = Math.floor(normalizeLongitude(lng));
  const latFraction = lat - latBase;
  const lngFraction = normalizeLongitude(lng) - lngBase;
  const max = tile.size - 1;

  // HGT rows are stored north-to-south; columns west-to-east.
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

  const q11 = sample(r0, c0);
  const q12 = sample(r0, c1);
  const q21 = sample(r1, c0);
  const q22 = sample(r1, c1);
  const valid = [q11, q12, q21, q22].filter((v): v is number => v !== null);
  if (!valid.length) return null;

  // Fill missing edge samples with the nearest available value.
  const a = q11 ?? valid[0];
  const b = q12 ?? a;
  const c = q21 ?? a;
  const d = q22 ?? a;
  return a * (1 - rf) * (1 - cf) + b * (1 - rf) * cf + c * rf * (1 - cf) + d * rf * cf;
}
