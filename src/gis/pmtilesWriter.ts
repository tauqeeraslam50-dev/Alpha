import { zxyToTileId } from 'pmtiles';

export interface TileEntryInput {
  z: number;
  x: number;
  y: number;
  data: Uint8Array | ArrayBuffer;
}

export interface PMTilesMetadataInput {
  name: string;
  description?: string;
  attribution?: string;
  bounds: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  minZoom: number;
  maxZoom: number;
  center?: [number, number, number]; // [centerLon, centerLat, centerZoom]
  tileType?: 'png' | 'jpg' | 'jpeg' | 'webp' | 'mvt';
  places?: any[];
  extraMetadata?: Record<string, any>;
}

// Helper to write unsigned LEB128 varint into array
function writeVarint(val: number | bigint, buf: number[]) {
  let n = BigInt(val);
  while (n >= 0x80n) {
    buf.push(Number((n & 0x7fn) | 0x80n));
    n >>= 7n;
  }
  buf.push(Number(n & 0x7fn));
}

// Serialize PMTiles v3 directory
function serializeDirectory(
  entries: Array<{ tileId: number; offset: number; length: number; runLength: number }>
): Uint8Array {
  const buf: number[] = [];

  // 1. Write number of entries
  writeVarint(entries.length, buf);

  // 2. Write delta tile IDs
  let lastId = 0;
  for (const entry of entries) {
    writeVarint(entry.tileId - lastId, buf);
    lastId = entry.tileId;
  }

  // 3. Write runLengths
  for (const entry of entries) {
    writeVarint(entry.runLength, buf);
  }

  // 4. Write byte lengths
  for (const entry of entries) {
    writeVarint(entry.length, buf);
  }

  // 5. Write offsets
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i > 0 && entry.offset === entries[i - 1].offset + entries[i - 1].length) {
      writeVarint(0, buf);
    } else {
      writeVarint(entry.offset + 1, buf);
    }
  }

  return new Uint8Array(buf);
}

/**
 * Creates a valid, spec-compliant PMTiles v3 binary Blob
 */
export function buildPMTilesArchive(
  tiles: TileEntryInput[],
  meta: PMTilesMetadataInput
): Blob {
  if (tiles.length === 0) {
    throw new Error('Cannot build PMTiles archive with 0 tiles.');
  }

  // 1. Map and sort entries by Hilbert curve tileId
  const sortedTiles = tiles
    .map((t) => {
      const tileData = t.data instanceof Uint8Array ? t.data : new Uint8Array(t.data);
      const tileId = zxyToTileId(t.z, t.x, t.y);
      return {
        z: t.z,
        x: t.x,
        y: t.y,
        tileId,
        data: tileData,
      };
    })
    .sort((a, b) => (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0));

  // 2. Concatenate tile data & compute directory offsets
  let totalTileBytes = 0;
  for (const t of sortedTiles) {
    totalTileBytes += t.data.byteLength;
  }

  const tileDataBuffer = new Uint8Array(totalTileBytes);
  const directoryEntries: Array<{
    tileId: number;
    offset: number;
    length: number;
    runLength: number;
  }> = [];

  let currentOffset = 0;
  for (const t of sortedTiles) {
    tileDataBuffer.set(t.data, currentOffset);
    directoryEntries.push({
      tileId: t.tileId,
      offset: currentOffset,
      length: t.data.byteLength,
      runLength: 1,
    });
    currentOffset += t.data.byteLength;
  }

  // 3. Serialize root directory
  const rootDirBytes = serializeDirectory(directoryEntries);

  // 4. Build JSON Metadata
  const minLon = meta.bounds[0];
  const minLat = meta.bounds[1];
  const maxLon = meta.bounds[2];
  const maxLat = meta.bounds[3];

  const centerLon = meta.center ? meta.center[0] : (minLon + maxLon) / 2;
  const centerLat = meta.center ? meta.center[1] : (minLat + maxLat) / 2;
  const centerZoom = meta.center ? meta.center[2] : Math.floor((meta.minZoom + meta.maxZoom) / 2);

  const tileTypeStr = meta.tileType || 'png';
  let tileTypeNum = 2; // PNG
  if (tileTypeStr === 'jpg' || tileTypeStr === 'jpeg') tileTypeNum = 3;
  else if (tileTypeStr === 'webp') tileTypeNum = 4;
  else if (tileTypeStr === 'mvt') tileTypeNum = 1;

  const metadataJson = JSON.stringify({
    name: meta.name,
    description: meta.description || `Offline PMTiles package for ${meta.name}`,
    attribution: meta.attribution || 'Radio Network Management System (RNMS)',
    version: '3.0.0',
    type: tileTypeNum === 1 ? 'overlay' : 'baselayer',
    bounds: meta.bounds,
    center: [centerLon, centerLat, centerZoom],
    minzoom: meta.minZoom,
    maxzoom: meta.maxZoom,
    format: tileTypeStr,
    places: meta.places || [],
    ...meta.extraMetadata,
  });

  const encoder = new TextEncoder();
  const metadataBytes = encoder.encode(metadataJson);

  // 5. Compute Header offsets
  const HEADER_SIZE = 127;
  const rootDirOffset = HEADER_SIZE;
  const rootDirLength = rootDirBytes.byteLength;

  const jsonMetadataOffset = rootDirOffset + rootDirLength;
  const jsonMetadataLength = metadataBytes.byteLength;

  const leafDirectoryOffset = 0;
  const leafDirectoryLength = 0;

  const tileDataOffset = jsonMetadataOffset + jsonMetadataLength;
  const tileDataLength = totalTileBytes;

  const numTiles = directoryEntries.length;

  // 6. Build 127-byte PMTiles Header
  const headerBuf = new ArrayBuffer(HEADER_SIZE);
  const dv = new DataView(headerBuf);

  // Magic 'PM' (0x4D50 in LE uint16)
  dv.setUint16(0, 19792, true);
  // Spec Version: 3
  dv.setUint8(2, 3);

  // Root directory offset & length (uint64 LE)
  setUint64(dv, 8, rootDirOffset);
  setUint64(dv, 16, rootDirLength);

  // JSON Metadata offset & length (uint64 LE)
  setUint64(dv, 24, jsonMetadataOffset);
  setUint64(dv, 32, jsonMetadataLength);

  // Leaf Directory offset & length (uint64 LE)
  setUint64(dv, 40, leafDirectoryOffset);
  setUint64(dv, 48, leafDirectoryLength);

  // Tile Data offset & length (uint64 LE)
  setUint64(dv, 56, tileDataOffset);
  setUint64(dv, 64, tileDataLength);

  // Tile counts (uint64 LE)
  setUint64(dv, 72, numTiles);
  setUint64(dv, 80, numTiles);
  setUint64(dv, 88, numTiles);

  // Clustered (uint8) = 1
  dv.setUint8(96, 1);
  // Internal Compression: 1 = None (uncompressed root directory)
  dv.setUint8(97, 1);
  // Tile Compression: 1 = None (PNG/JPG already compressed)
  dv.setUint8(98, 1);
  // Tile Type: 2 (PNG), 3 (JPEG), 4 (WebP)
  dv.setUint8(99, tileTypeNum);

  // Min/Max Zoom (uint8)
  dv.setUint8(100, meta.minZoom);
  dv.setUint8(101, meta.maxZoom);

  // Coordinates scaled by 1e7 (int32 LE)
  dv.setInt32(102, Math.round(minLon * 1e7), true);
  dv.setInt32(106, Math.round(minLat * 1e7), true);
  dv.setInt32(110, Math.round(maxLon * 1e7), true);
  dv.setInt32(114, Math.round(maxLat * 1e7), true);

  // Center zoom and coordinates
  dv.setUint8(118, centerZoom);
  dv.setInt32(119, Math.round(centerLon * 1e7), true);
  dv.setInt32(123, Math.round(centerLat * 1e7), true);

  // 7. Combine all sections into a single Blob
  const headerBytes = new Uint8Array(headerBuf);

  return new Blob([headerBytes, rootDirBytes, metadataBytes, tileDataBuffer], {
    type: 'application/octet-stream',
  });
}

function setUint64(view: DataView, offset: number, value: number) {
  const lo = value >>> 0;
  const hi = Math.floor(value / 4294967296) >>> 0;
  view.setUint32(offset, lo, true);
  view.setUint32(offset + 4, hi, true);
}
