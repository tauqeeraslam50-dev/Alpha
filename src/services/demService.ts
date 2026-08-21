export type DemTile = {
  name: string;
  path: string;
  lat: number;
  lon: number;
  samples: number;
  resolutionMeters: number;
};

export type ElevationResult = {
  elevationMeters: number;
  tile: string;
  sampleRow: number;
  sampleCol: number;
};

const HGT = /^([NS])(\d{2})([EW])(\d{3})\.hgt$/i;

export function parseHgtName(name: string): { lat: number; lon: number } | null {
  const m = name.match(HGT);
  if (!m) return null;
  const lat = Number(m[2]) * (m[1].toUpperCase() === 'S' ? -1 : 1);
  const lon = Number(m[4]) * (m[3].toUpperCase() === 'W' ? -1 : 1);
  return { lat, lon };
}

export function inferHgtSamples(byteLength: number): number | null {
  const candidates = [1201, 3601, 7201];
  return candidates.find((n) => 2 * n * n === byteLength) ?? null;
}

export function hgtResolution(samples: number): number {
  if (samples === 1201) return 90;
  if (samples === 3601) return 30;
  if (samples === 7201) return 15;
  throw new Error(`Unsupported HGT dimensions: ${samples}x${samples}`);
}

export function buildDemIndex(files: Array<{ name: string; path: string; byteLength: number }>): DemTile[] {
  return files.flatMap((file) => {
    const coords = parseHgtName(file.name);
    const samples = inferHgtSamples(file.byteLength);
    if (!coords || !samples) return [];
    return [{ name: file.name, path: file.path, ...coords, samples, resolutionMeters: hgtResolution(samples) }];
  });
}

export function findDemTile(index: DemTile[], lat: number, lon: number): DemTile | null {
  const tileLat = Math.floor(lat);
  const tileLon = Math.floor(lon);
  return index.find((t) => t.lat === tileLat && t.lon === tileLon) ?? null;
}

/** Decode one big-endian signed Int16 HGT sample. */
export function decodeHgtSample(buffer: ArrayBuffer, samples: number, row: number, col: number): number | null {
  if (row < 0 || col < 0 || row >= samples || col >= samples) return null;
  const offset = (row * samples + col) * 2;
  if (offset + 2 > buffer.byteLength) return null;
  const value = new DataView(buffer).getInt16(offset, false);
  return value === -32768 ? null : value;
}

/** Bilinear elevation lookup. HGT rows run north-to-south, columns west-to-east. */
export function elevationFromHgt(buffer: ArrayBuffer, samples: number, lat: number, lon: number, tileLat: number, tileLon: number): number | null {
  const u = lon - tileLon;
  const v = 1 - (lat - tileLat);
  const x = Math.max(0, Math.min(samples - 1, u * (samples - 1)));
  const y = Math.max(0, Math.min(samples - 1, v * (samples - 1)));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(samples - 1, x0 + 1), y1 = Math.min(samples - 1, y0 + 1);
  const q11 = decodeHgtSample(buffer, samples, y0, x0);
  const q21 = decodeHgtSample(buffer, samples, y0, x1);
  const q12 = decodeHgtSample(buffer, samples, y1, x0);
  const q22 = decodeHgtSample(buffer, samples, y1, x1);
  if ([q11, q21, q12, q22].some((v) => v == null)) return null;
  const fx = x - x0, fy = y - y0;
  return (q11! * (1 - fx) * (1 - fy)) + (q21! * fx * (1 - fy)) + (q12! * (1 - fx) * fy) + (q22! * fx * fy);
}

export type LosSample = { distanceMeters: number; lat: number; lon: number; terrainElevationMeters: number | null };

export function sampleTerrain(index: DemTile[], readTile: (tile: DemTile) => ArrayBuffer, start: { lat: number; lon: number }, end: { lat: number; lon: number }, count = 200): LosSample[] {
  const samples: LosSample[] = [];
  for (let i = 0; i <= count; i++) {
    const f = i / count;
    const lat = start.lat + (end.lat - start.lat) * f;
    const lon = start.lon + (end.lon - start.lon) * f;
    const tile = findDemTile(index, lat, lon);
    const elevation = tile ? elevationFromHgt(readTile(tile), tile.samples, lat, lon, tile.lat, tile.lon) : null;
    samples.push({ distanceMeters: i === 0 ? 0 : f * haversineMeters(start, end), lat, lon, terrainElevationMeters: elevation });
  }
  return samples;
}

export function haversineMeters(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = 6371008.8;
  const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180, dl = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
