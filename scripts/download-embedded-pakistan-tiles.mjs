import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const tilesDir = path.join(rootDir, 'public', 'tiles');
const offlineMapsDir = path.join(rootDir, 'public', 'offline-maps');

fs.mkdirSync(tilesDir, { recursive: true });
fs.mkdirSync(offlineMapsDir, { recursive: true });

// Pakistan coordinates bounds
const bounds = {
  minLat: 23.5,
  maxLat: 37.5,
  minLng: 60.5,
  maxLng: 78.0,
};

function latLngToTile(lat, lng, zoom) {
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

// 2D Hilbert Curve for PMTiles tileId calculation
function rot(n, x, y, rx, ry) {
  if (ry === 0) {
    if (rx === 1) {
      x = n - 1 - x;
      y = n - 1 - y;
    }
    return [y, x];
  }
  return [x, y];
}

function zxyToTileId(z, x, y) {
  if (z === 0) return 0;
  let acc = (Math.pow(4, z) - 1) / 3;
  let n = Math.pow(2, z);
  let d = 0;
  for (let s = n / 2; s > 0; s /= 2) {
    let rx = (x & s) > 0 ? 1 : 0;
    let ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    [x, y] = rot(s, x, y, rx, ry);
  }
  return Math.floor(acc + d);
}

function writeVarint(val, buf) {
  let n = BigInt(val);
  while (n >= 0x80n) {
    buf.push(Number((n & 0x7fn) | 0x80n));
    n >>= 7n;
  }
  buf.push(Number(n & 0x7fn));
}

function serializeDirectory(entries) {
  const buf = [];
  writeVarint(entries.length, buf);
  let lastId = 0;
  for (const entry of entries) {
    writeVarint(entry.tileId - lastId, buf);
    lastId = entry.tileId;
  }
  for (const entry of entries) writeVarint(entry.runLength, buf);
  for (const entry of entries) writeVarint(entry.length, buf);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (i > 0 && entry.offset === entries[i - 1].offset + entries[i - 1].length) {
      writeVarint(0, buf);
    } else {
      writeVarint(entry.offset + 1, buf);
    }
  }
  return Buffer.from(buf);
}

function buildPMTilesBuffer(tiles, meta) {
  const sortedTiles = tiles
    .map((t) => ({
      ...t,
      tileId: zxyToTileId(t.z, t.x, t.y),
    }))
    .sort((a, b) => (a.tileId < b.tileId ? -1 : a.tileId > b.tileId ? 1 : 0));

  let totalTileBytes = sortedTiles.reduce((acc, t) => acc + t.data.length, 0);
  const tileDataBuffer = Buffer.allocUnsafe(totalTileBytes);
  const directoryEntries = [];

  let currentOffset = 0;
  for (const t of sortedTiles) {
    t.data.copy(tileDataBuffer, currentOffset);
    directoryEntries.push({
      tileId: t.tileId,
      offset: currentOffset,
      length: t.data.length,
      runLength: 1,
    });
    currentOffset += t.data.length;
  }

  const rootDirBytes = serializeDirectory(directoryEntries);

  const minLon = meta.bounds[0];
  const minLat = meta.bounds[1];
  const maxLon = meta.bounds[2];
  const maxLat = meta.bounds[3];
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const centerZoom = Math.floor((meta.minZoom + meta.maxZoom) / 2);

  const metadataJson = JSON.stringify({
    name: meta.name,
    description: 'Embedded Pakistan National Offline Map',
    attribution: 'Radio Network Management System (RNMS)',
    version: '3.0.0',
    type: 'baselayer',
    bounds: meta.bounds,
    center: [centerLon, centerLat, centerZoom],
    minzoom: meta.minZoom,
    maxzoom: meta.maxZoom,
    format: 'png',
  });

  const metadataBytes = Buffer.from(metadataJson, 'utf-8');

  const HEADER_SIZE = 127;
  const rootDirOffset = HEADER_SIZE;
  const rootDirLength = rootDirBytes.length;
  const jsonMetadataOffset = rootDirOffset + rootDirLength;
  const jsonMetadataLength = metadataBytes.length;
  const tileDataOffset = jsonMetadataOffset + jsonMetadataLength;
  const tileDataLength = totalTileBytes;
  const numTiles = directoryEntries.length;

  const headerBuf = Buffer.alloc(HEADER_SIZE);
  headerBuf.writeUInt16LE(19792, 0); // 'PM'
  headerBuf.writeUInt8(3, 2); // Spec v3

  headerBuf.writeBigUInt64LE(BigInt(rootDirOffset), 8);
  headerBuf.writeBigUInt64LE(BigInt(rootDirLength), 16);
  headerBuf.writeBigUInt64LE(BigInt(jsonMetadataOffset), 24);
  headerBuf.writeBigUInt64LE(BigInt(jsonMetadataLength), 32);
  headerBuf.writeBigUInt64LE(BigInt(0), 40);
  headerBuf.writeBigUInt64LE(BigInt(0), 48);
  headerBuf.writeBigUInt64LE(BigInt(tileDataOffset), 56);
  headerBuf.writeBigUInt64LE(BigInt(tileDataLength), 64);

  headerBuf.writeBigUInt64LE(BigInt(numTiles), 72);
  headerBuf.writeBigUInt64LE(BigInt(numTiles), 80);
  headerBuf.writeBigUInt64LE(BigInt(numTiles), 88);

  headerBuf.writeUInt8(1, 96); // Clustered
  headerBuf.writeUInt8(1, 97); // Internal compression: 1 (None)
  headerBuf.writeUInt8(1, 98); // Tile compression: 1 (None)
  headerBuf.writeUInt8(2, 99); // Tile type: 2 (PNG)

  headerBuf.writeUInt8(meta.minZoom, 100);
  headerBuf.writeUInt8(meta.maxZoom, 101);

  headerBuf.writeInt32LE(Math.round(minLon * 1e7), 102);
  headerBuf.writeInt32LE(Math.round(minLat * 1e7), 106);
  headerBuf.writeInt32LE(Math.round(maxLon * 1e7), 110);
  headerBuf.writeInt32LE(Math.round(maxLat * 1e7), 114);

  headerBuf.writeUInt8(centerZoom, 118);
  headerBuf.writeInt32LE(Math.round(centerLon * 1e7), 119);
  headerBuf.writeInt32LE(Math.round(centerLat * 1e7), 123);

  return Buffer.concat([headerBuf, rootDirBytes, metadataBytes, tileDataBuffer]);
}

async function fetchTileWithFallback(z, x, y) {
  const sub = ['a', 'b', 'c', 'd'][(x + y) % 4];
  const urls = [
    `https://${sub}.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
    `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`,
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'RNMS-OfflineMapDownloader/1.0' },
      });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    } catch {}
  }
  return null;
}

async function main() {
  console.log('🚀 Downloading Embedded Pakistan Map Tiles (Zooms 4 to 8)...');

  const tileQueue = [];
  const minZoom = 4;
  const maxZoom = 8;

  for (let z = minZoom; z <= maxZoom; z++) {
    const minTile = latLngToTile(bounds.maxLat, bounds.minLng, z);
    const maxTile = latLngToTile(bounds.minLat, bounds.maxLng, z);

    const startX = Math.min(minTile.x, maxTile.x);
    const endX = Math.max(minTile.x, maxTile.x);
    const startY = Math.min(minTile.y, maxTile.y);
    const endY = Math.max(minTile.y, maxTile.y);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        tileQueue.push({ z, x, y });
      }
    }
  }

  console.log(`National tiles (Z4-Z8): ${tileQueue.length}`);

  // Add major city centers at Zoom 9 and 10
  const cityHubs = [
    { name: 'Islamabad / Rawalpindi', minLat: 33.4, maxLat: 33.8, minLng: 72.8, maxLng: 73.3 },
    { name: 'Lahore', minLat: 31.3, maxLat: 31.7, minLng: 74.1, maxLng: 74.5 },
    { name: 'Karachi', minLat: 24.7, maxLat: 25.1, minLng: 66.8, maxLng: 67.3 },
    { name: 'Peshawar', minLat: 33.8, maxLat: 34.2, minLng: 71.3, maxLng: 71.8 },
    { name: 'Quetta', minLat: 30.0, maxLat: 30.4, minLng: 66.8, maxLng: 67.2 },
    { name: 'Multan', minLat: 30.0, maxLat: 30.4, minLng: 71.3, maxLng: 71.7 },
    { name: 'Gwadar', minLat: 25.0, maxLat: 25.4, minLng: 62.1, maxLng: 62.5 },
  ];

  for (const city of cityHubs) {
    for (let z = 9; z <= 10; z++) {
      const minTile = latLngToTile(city.maxLat, city.minLng, z);
      const maxTile = latLngToTile(city.minLat, city.maxLng, z);
      const startX = Math.min(minTile.x, maxTile.x);
      const endX = Math.max(minTile.x, maxTile.x);
      const startY = Math.min(minTile.y, maxTile.y);
      const endY = Math.max(minTile.y, maxTile.y);

      for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
          if (!tileQueue.some((t) => t.z === z && t.x === x && t.y === y)) {
            tileQueue.push({ z, x, y });
          }
        }
      }
    }
  }

  console.log(`Total tiles to download (including city hubs Z9-10): ${tileQueue.length}`);

  const collectedTiles = [];
  const CONCURRENCY = 10;
  let completed = 0;

  async function worker() {
    while (tileQueue.length > 0) {
      const item = tileQueue.shift();
      if (!item) break;

      const zDir = path.join(tilesDir, String(item.z));
      const xDir = path.join(zDir, String(item.x));
      fs.mkdirSync(xDir, { recursive: true });

      const tilePath = path.join(xDir, `${item.y}.png`);

      let data;
      if (fs.existsSync(tilePath)) {
        data = fs.readFileSync(tilePath);
      } else {
        data = await fetchTileWithFallback(item.z, item.x, item.y);
        if (data) {
          fs.writeFileSync(tilePath, data);
        }
      }

      if (data) {
        collectedTiles.push({ z: item.z, x: item.x, y: item.y, data });
      }

      completed++;
      if (completed % 25 === 0 || completed === tileQueue.length) {
        process.stdout.write(`\rProgress: ${completed}/${completed + tileQueue.length} tiles (${Math.round((completed / (completed + tileQueue.length)) * 100)}%)`);
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  console.log(`\n✅ Downloaded ${collectedTiles.length} tiles into public/tiles/`);

  // Build embedded PMTiles package
  console.log('📦 Building public/offline-maps/pakistan-embedded.pmtiles...');
  const pmtilesBuffer = buildPMTilesBuffer(collectedTiles, {
    name: 'Pakistan National Offline Map (Embedded)',
    bounds: [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat],
    minZoom,
    maxZoom,
  });

  const pmtilesDest = path.join(offlineMapsDir, 'pakistan-embedded.pmtiles');
  fs.writeFileSync(pmtilesDest, pmtilesBuffer);

  const stats = fs.statSync(pmtilesDest);
  console.log(`✅ Saved ${pmtilesDest} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);
}

main().catch(console.error);
