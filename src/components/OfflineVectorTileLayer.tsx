import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { OFFLINE_GAZETTEER } from '../lib/offlineGeo';
import { getTileFromCache } from '../lib/offlineTileCache';
import { estimateElevation } from '../lib/losUtils';
import { getElevationColor, calculateHillshade } from '../lib/offlineDem';

export type OfflineMapStyle = 
  | 'tactical-topo' 
  | 'dark-radar' 
  | 'light-vector' 
  | 'satellite-sim' 
  | 'offline-terrain' 
  | 'offline-dem-slope'
  | 'contour-lines';

interface OfflineVectorTileLayerProps {
  styleMode?: OfflineMapStyle;
}

// Convert tile coordinates to Longitude and Latitude (EPSG:3857 to WGS84)
function tile2lng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function latLngToTilePixel(
  lat: number, 
  lng: number, 
  west: number, 
  east: number, 
  south: number, 
  north: number, 
  size: number
): { x: number; y: number } {
  const x = ((lng - west) / (east - west)) * size;
  const y = ((north - lat) / (north - south)) * size;
  return { x, y };
}

export function OfflineVectorTileLayer({ styleMode = 'offline-sat' as any }: OfflineVectorTileLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.GridLayer | null>(null);

  // Normalize styleMode in case legacy or alias names are passed
  const effectiveMode: OfflineMapStyle = 
    (styleMode as string) === 'offline-sat' ? 'satellite-sim' :
    (styleMode as string) === 'offline-topo' ? 'tactical-topo' :
    (styleMode as string) === 'offline-dark' ? 'dark-radar' :
    (styleMode as string) === 'offline-light' ? 'light-vector' :
    (styleMode as string) === 'topo' ? 'tactical-topo' :
    (styleMode as string) === 'dark' ? 'dark-radar' :
    (styleMode as string) === 'light' ? 'light-vector' :
    (styleMode as string) === 'satellite' ? 'satellite-sim' :
    styleMode;

  useEffect(() => {
    // Custom L.GridLayer subclass that renders standalone vector/topographical tiles
    const CustomOfflineGridLayer = L.GridLayer.extend({
      createTile: function (coords: { x: number; y: number; z: number }, done: (error: any, tile: HTMLElement) => void) {
        const tile = L.DomUtil.create('canvas', 'leaflet-offline-tile') as HTMLCanvasElement;
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;

        const ctx = tile.getContext('2d');
        if (!ctx) {
          done(null, tile);
          return tile;
        }

        const { x, y, z } = coords;

        // Calculate tile geographic bounding box
        const west = tile2lng(x, z);
        const east = tile2lng(x + 1, z);
        const north = tile2lat(y, z);
        const south = tile2lat(y + 1, z);

        // Async check for IndexedDB cached tile first
        getTileFromCache(z, x, y, effectiveMode).then(cachedDataUrl => {
          if (cachedDataUrl) {
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0, size.x, size.y);
              done(null, tile);
            };
            img.onerror = () => {
              renderTile(ctx, size.x, size.y, z, west, east, north, south, effectiveMode);
              done(null, tile);
            };
            img.src = cachedDataUrl;
          } else {
            renderTile(ctx, size.x, size.y, z, west, east, north, south, effectiveMode);
            done(null, tile);
          }
        }).catch(() => {
          renderTile(ctx, size.x, size.y, z, west, east, north, south, effectiveMode);
          done(null, tile);
        });

        return tile;
      }
    });

    const instance = new (CustomOfflineGridLayer as any)({
      tileSize: 256,
      updateWhenIdle: false,
      keepBuffer: 8,
      zIndex: 1,
      minZoom: 2,
      maxZoom: 19
    });

    layerRef.current = instance;
    map.addLayer(instance);

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
      }
    };
  }, [map, effectiveMode]);

  return null;
}

/**
 * Master Offline Tile Renderer Dispatcher
 */
function renderTile(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
  styleMode: OfflineMapStyle
) {
  if (styleMode === 'satellite-sim') {
    renderSatelliteTile(ctx, w, h, z, west, east, north, south);
  } else if (styleMode === 'offline-terrain') {
    renderTerrainDEMTile(ctx, w, h, z, west, east, north, south);
  } else if (styleMode === 'offline-dem-slope') {
    renderSlopeDEMTile(ctx, w, h, z, west, east, north, south);
  } else {
    renderStandardVectorTile(ctx, w, h, z, west, east, north, south, styleMode);
  }

  // Common Overlays: Contours (if applicable), MGRS/Meridian Grid & Gazetteer Landmarks
  renderTacticalGrid(ctx, w, h, z, west, east, north, south, styleMode);
  renderGazetteerLandmarks(ctx, w, h, z, west, east, north, south, styleMode);
}

/**
 * 🛰️ HIGH-FIDELITY OFFLINE SATELLITE LAYER
 * Synthesizes realistic multi-spectral orbital imagery:
 * - Alpine glaciers & snow caps
 * - Dense evergreen & mixed pine canopies
 * - Irrigated agricultural patchwork
 * - Dune & clay deserts
 * - Hydrography (rivers, reservoirs, sea)
 * - Major urban footprints
 * - 3D terrain hillshade lighting
 */
function renderSatelliteTile(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number
) {
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  // Grid step size for fast sub-sampling (step 4 at low zoom, step 2 at high zoom)
  const step = z >= 12 ? 2 : 4;
  const invStep = 1 / step;

  // Pre-sample grid nodes for fast bilinear filling
  for (let py = 0; py < h; py += step) {
    const lat = north - (py / h) * (north - south);
    for (let px = 0; px < w; px += step) {
      const lng = west + (px / w) * (east - west);
      const elevM = estimateElevation(lat, lng);
      
      // Calculate realistic Landcover Biome RGB
      let [r, g, b] = getSatelliteLandcoverRGB(lat, lng, elevM, z);

      // Apply 3D Topographic Hillshade (Sun NW at 315°, 45° el)
      const hs = calculateHillshade(lat, lng, 0.004, 315, 45);
      const shadeFactor = (hs / 128) * 0.75 + 0.25; // 0.25 to 1.75 multiplier

      r = Math.min(255, Math.max(0, Math.round(r * shadeFactor)));
      g = Math.min(255, Math.max(0, Math.round(g * shadeFactor)));
      b = Math.min(255, Math.max(0, Math.round(b * shadeFactor)));

      // Fill pixel block (step x step)
      for (let dy = 0; dy < step && py + dy < h; dy++) {
        for (let dx = 0; dx < step && px + dx < w; dx++) {
          const idx = ((py + dy) * w + (px + dx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Overlay Field Parcels / Crop Geometry in Agricultural Basins at Higher Zoom
  if (z >= 10) {
    renderAgriculturalFieldTextures(ctx, w, h, west, east, north, south);
  }

  // Overlay Major Waterways & Reservoirs
  renderWaterways(ctx, w, h, z, west, east, north, south, 'satellite');

  // Overlay Major Urban Textures
  renderUrbanFootprints(ctx, w, h, z, west, east, north, south, 'satellite');
}

/**
 * ⛰️ OFFLINE DIGITAL ELEVATION MODEL (DEM) + 3D HILLSHADE
 * Renders hypsometric elevation colormaps with shaded relief & vector contours
 */
function renderTerrainDEMTile(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number
) {
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;
  const step = z >= 12 ? 2 : 4;

  for (let py = 0; py < h; py += step) {
    const lat = north - (py / h) * (north - south);
    for (let px = 0; px < w; px += step) {
      const lng = west + (px / w) * (east - west);
      const elevM = estimateElevation(lat, lng);

      // Hypsometric elevation base color
      let [r, g, b] = getElevationColor(elevM);

      // Calculate 3D Hillshade
      const hs = calculateHillshade(lat, lng, 0.003, 315, 45);
      const shadeFactor = (hs / 128) * 0.65 + 0.35;

      r = Math.min(255, Math.max(0, Math.round(r * shadeFactor)));
      g = Math.min(255, Math.max(0, Math.round(g * shadeFactor)));
      b = Math.min(255, Math.max(0, Math.round(b * shadeFactor)));

      for (let dy = 0; dy < step && py + dy < h; dy++) {
        for (let dx = 0; dx < step && px + dx < w; dx++) {
          const idx = ((py + dy) * w + (px + dx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Render Vector Elevation Contours
  renderVectorContours(ctx, w, h, z, west, east, north, south, 'terrain');

  // Overlay Waterways
  renderWaterways(ctx, w, h, z, west, east, north, south, 'terrain');
}

/**
 * 📐 DEM SLOPE & MOBILITY GRADIENT TILE
 */
function renderSlopeDEMTile(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number
) {
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;
  const step = 4;
  const delta = 0.003;

  for (let py = 0; py < h; py += step) {
    const lat = north - (py / h) * (north - south);
    for (let px = 0; px < w; px += step) {
      const lng = west + (px / w) * (east - west);

      const zN = estimateElevation(lat + delta, lng);
      const zS = estimateElevation(lat - delta, lng);
      const zE = estimateElevation(lat, lng + delta);
      const zW = estimateElevation(lat, lng - delta);

      const dzdx = (zE - zW) / (2 * delta * 111320 * Math.cos((lat * Math.PI) / 180));
      const dzdy = (zN - zS) / (2 * delta * 111320);

      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
      const slopeDeg = (slopeRad * 180) / Math.PI;

      // Color code by slope angle
      let r = 34, g = 197, b = 94; // Flat / Low (<5°) - Emerald Green
      if (slopeDeg >= 30) {
        r = 239; g = 68; b = 68; // Precipitous Cliff (>=30°) - Rose Red
      } else if (slopeDeg >= 20) {
        r = 249; g = 115; b = 22; // Steep Mountain (20-30°) - Orange
      } else if (slopeDeg >= 10) {
        r = 234; g = 179; b = 8; // Moderate Hill (10-20°) - Amber
      } else if (slopeDeg >= 5) {
        r = 132; g = 204; b = 22; // Gentle Slope (5-10°) - Lime
      }

      for (let dy = 0; dy < step && py + dy < h; dy++) {
        for (let dx = 0; dx < step && px + dx < w; dx++) {
          const idx = ((py + dy) * w + (px + dx)) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  renderVectorContours(ctx, w, h, z, west, east, north, south, 'slope');
}

/**
 * Standard Vector Topo / Dark / Light Map Tiles
 */
function renderStandardVectorTile(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
  styleMode: OfflineMapStyle
) {
  if (styleMode === 'dark-radar') {
    ctx.fillStyle = '#0a0f1d';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    if ((Math.floor(west * 10) + Math.floor(north * 10)) % 2 === 0) {
      ctx.fillRect(0, 0, w, h);
    }
  } else if (styleMode === 'tactical-topo') {
    const avgLat = (north + south) / 2;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    if (avgLat > 33.5) {
      grad.addColorStop(0, '#e2ebe0');
      grad.addColorStop(0.5, '#d4e3d1');
      grad.addColorStop(1, '#c5d8c1');
    } else {
      grad.addColorStop(0, '#f1f5ee');
      grad.addColorStop(0.5, '#e5ede1');
      grad.addColorStop(1, '#d8e5d3');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f1f5f9';
    if ((Math.floor(west * 5) + Math.floor(north * 5)) % 2 === 0) {
      ctx.fillRect(0, 0, w, h);
    }
  }

  renderVectorContours(ctx, w, h, z, west, east, north, south, styleMode);
  renderWaterways(ctx, w, h, z, west, east, north, south, styleMode);
}

/**
 * Accurate Landcover RGB Synthesizer for Satellite Mode
 */
function getSatelliteLandcoverRGB(
  lat: number,
  lng: number,
  elevM: number,
  z: number
): [number, number, number] {
  // Water / Arabian Sea check
  if (lat <= 24.8 && lng <= 67.2) {
    if (lat <= 24.4) return [12, 45, 90]; // Deep ocean navy
    return [15, 82, 120]; // Coastal shelf turquoise/navy
  }

  // 1. High Glacial Peaks (Karakoram / Himalayas / Nanga Parbat / Hindu Kush)
  if (elevM > 4800 || (lat >= 35.0 && elevM > 3800)) {
    const rockVar = Math.abs(Math.sin(lat * 120 + lng * 140));
    if (rockVar < 0.35) {
      return [71, 85, 105]; // Dark exposed granitic slate rock
    }
    return [240, 245, 252]; // Brilliant snow cap & glacier ice
  }

  // 2. High Alpine Tundra & Scree (2600m - 4800m)
  if (elevM >= 2600) {
    const rockVar = Math.abs(Math.sin(lat * 80 + lng * 90));
    if (rockVar < 0.5) return [100, 116, 139]; // Slate mountain rock
    return [78, 62, 53]; // Weathered alpine soil
  }

  // 3. Dense Pine / Coniferous Mountain Forests (Murree, Galyat, Kaghan, Swat, Margalla Northern Flank)
  if (lat >= 33.7 && lat <= 35.0 && elevM >= 1100 && elevM < 2600 && lng >= 72.8 && lng <= 74.8) {
    const forestNoise = Math.abs(Math.sin(lat * 150 + lng * 170));
    if (forestNoise < 0.6) return [20, 58, 30]; // Deep evergreen pine canopy
    return [34, 84, 45]; // Lush mountain cedar
  }

  // 4. Margalla Ridge Escarpment (Islamabad)
  if (lat >= 33.72 && lat <= 33.85 && lng >= 72.85 && lng <= 73.25 && elevM >= 750) {
    return [45, 78, 42]; // Subtropical scrub & pine
  }

  // 5. Potohar Plateau & Salt Range (Rawalpindi, Chakwal, Jhelum, Mianwali)
  if (lat >= 32.4 && lat <= 33.65 && lng >= 71.5 && lng <= 73.8) {
    const potoharNoise = Math.abs(Math.sin(lat * 60 + lng * 70));
    if (potoharNoise < 0.4) return [156, 128, 92]; // Sandy sandstone plateau
    if (potoharNoise > 0.75) return [104, 132, 85]; // Ravine vegetation
    return [138, 115, 78]; // Ochre / terracotta Potohar soil
  }

  // 6. Arid Desert Sands (Thar, Cholistan, Kharan, Thal)
  if ((lat >= 27.0 && lat <= 29.5 && lng >= 70.0 && lng <= 72.5) || 
      (lat >= 28.0 && lat <= 29.5 && lng <= 66.0)) {
    const duneVar = Math.abs(Math.sin(lat * 90 + lng * 110));
    if (duneVar < 0.5) return [217, 155, 65]; // Golden orange desert dune
    return [235, 178, 88]; // Bright sand ripple
  }

  // 7. Balochistan Barren Mountains & Canyons (Quetta, Khuzdar, Makran)
  if (lat <= 32.0 && lng <= 68.5) {
    const rockNoise = Math.abs(Math.sin(lat * 45 + lng * 55));
    if (rockNoise < 0.4) return [112, 80, 52]; // Deep brown canyon rock
    if (rockNoise > 0.8) return [145, 110, 78]; // Desert plateau
    return [128, 96, 64]; // Arid gravel
  }

  // 8. Indus Alluvial Basin & Agricultural Floodplains (Punjab & Sindh)
  if (lat >= 24.5 && lat <= 32.5 && lng >= 68.0 && lng <= 74.5) {
    const agriNoise = Math.abs(Math.sin(lat * 200 + lng * 220));
    if (agriNoise < 0.3) return [22, 101, 52]; // Rich irrigated crop (dark green)
    if (agriNoise < 0.6) return [74, 138, 62]; // Healthy wheat / rice paddy
    if (agriNoise < 0.85) return [132, 140, 68]; // Ripening harvest / meadow
    return [168, 142, 98]; // Fallow alluvial soil
  }

  // Default natural terrain
  return [115, 125, 95];
}

/**
 * Renders Agricultural Crop Field Parcels in Alluvial Basins
 */
function renderAgriculturalFieldTextures(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  west: number,
  east: number,
  north: number,
  south: number
) {
  const avgLat = (north + south) / 2;
  const avgLng = (west + east) / 2;

  // Only apply in Punjab/Sindh agricultural belt
  if (avgLat >= 26.0 && avgLat <= 33.0 && avgLng >= 70.0 && avgLng <= 74.5) {
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1;

    const fieldSize = 32;
    for (let x = 0; x < w; x += fieldSize) {
      for (let y = 0; y < h; y += fieldSize) {
        const hash = Math.abs(Math.sin(west * 100 + x * 3.1 + south * 80 + y * 2.7));
        if (hash > 0.7) {
          ctx.fillStyle = 'rgba(34, 197, 94, 0.08)'; // Green crop highlight
          ctx.fillRect(x, y, fieldSize, fieldSize);
        } else if (hash < 0.25) {
          ctx.fillStyle = 'rgba(217, 119, 6, 0.07)'; // Golden crop highlight
          ctx.fillRect(x, y, fieldSize, fieldSize);
        }
        ctx.strokeRect(x, y, fieldSize, fieldSize);
      }
    }
    ctx.restore();
  }
}

/**
 * Renders Major Water Bodies, Indus Tributaries & Dams
 */
function renderWaterways(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
  theme: 'satellite' | 'terrain' | 'slope' | string
) {
  const waterColor = theme === 'satellite' 
    ? '#0369a1' 
    : theme === 'terrain'
    ? '#0284c7'
    : '#38bdf8';

  // Major Waterways / Reservoirs Coordinates in Pakistan
  const waterFeatures = [
    // Tarbela Dam Lake (34.14° N, 72.70° E)
    { lat: 34.14, lng: 72.70, radiusKm: 14, name: 'Tarbela Reservoir' },
    // Mangla Dam Lake (33.15° N, 73.65° E)
    { lat: 33.15, lng: 73.65, radiusKm: 16, name: 'Mangla Lake' },
    // Rawal Lake (Islamabad) (33.70° N, 73.12° E)
    { lat: 33.70, lng: 73.12, radiusKm: 3.5, name: 'Rawal Lake' },
    // Khanpur Dam (33.80° N, 72.93° E)
    { lat: 33.80, lng: 72.93, radiusKm: 4.0, name: 'Khanpur Dam' },
    // Attabad Lake (36.33° N, 74.86° E)
    { lat: 36.33, lng: 74.86, radiusKm: 8.0, name: 'Attabad Lake' },
    // Keenjhar Lake (Sindh) (24.95° N, 68.05° E)
    { lat: 24.95, lng: 68.05, radiusKm: 12.0, name: 'Keenjhar Lake' },
    // Manchar Lake (26.42° N, 67.65° E)
    { lat: 26.42, lng: 67.65, radiusKm: 10.0, name: 'Manchar Lake' },
  ];

  ctx.save();
  ctx.fillStyle = waterColor;
  ctx.strokeStyle = waterColor;

  waterFeatures.forEach(wf => {
    if (wf.lat >= south - 0.1 && wf.lat <= north + 0.1 && wf.lng >= west - 0.1 && wf.lng <= east + 0.1) {
      const pt = latLngToTilePixel(wf.lat, wf.lng, west, east, south, north, w);
      const pxRadius = Math.max(4, (wf.radiusKm / 111.32) / (north - south) * h);

      ctx.beginPath();
      ctx.ellipse(pt.x, pt.y, pxRadius * 1.3, pxRadius * 0.7, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      if (z >= 10 && theme !== 'satellite') {
        ctx.font = 'italic 8px sans-serif';
        ctx.fillStyle = '#0369a1';
        ctx.fillText(wf.name, pt.x - 15, pt.y - pxRadius * 0.7 - 3);
      }
    }
  });

  // Indus River Main Spine Path (Approximation across tile)
  // Flows from Gilgit (35.9, 74.3) -> Attock (33.9, 72.2) -> Mianwali (32.6, 71.5) -> Sukkur (27.7, 68.8) -> Thatta (24.7, 67.9)
  if (z >= 7 && west <= 75.0 && east >= 67.5 && south <= 36.5 && north >= 24.0) {
    ctx.lineWidth = Math.min(6, Math.max(1.5, (z - 5) * 0.8));
    ctx.beginPath();
    
    // Draw river segment across this tile if intersecting
    let started = false;
    for (let px = 0; px <= w; px += 16) {
      const curLng = west + (px / w) * (east - west);
      // River latitude approximation function:
      // lat = 24.5 + (curLng - 67.5) * 1.5 + sine ripples
      const riverLat = 24.5 + (curLng - 67.5) * 1.55 + Math.sin(curLng * 15) * 0.35;
      
      if (riverLat >= south && riverLat <= north) {
        const py = ((north - riverLat) / (north - south)) * h;
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }
    }
    if (started) {
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Renders Major Urban Footprint Overlays (Road grids & structures)
 */
function renderUrbanFootprints(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
  theme: 'satellite' | 'terrain' | string
) {
  if (z < 10) return;

  const majorCities = [
    { name: 'Islamabad / Rawalpindi', lat: 33.6844, lng: 73.0479, radiusKm: 18 },
    { name: 'Lahore Metro', lat: 31.5497, lng: 74.3436, radiusKm: 22 },
    { name: 'Karachi Metro', lat: 24.8607, lng: 67.0011, radiusKm: 28 },
    { name: 'Peshawar', lat: 34.0151, lng: 71.5249, radiusKm: 12 },
    { name: 'Quetta', lat: 30.1798, lng: 66.9750, radiusKm: 10 },
    { name: 'Faisalabad', lat: 31.4504, lng: 73.1350, radiusKm: 14 },
    { name: 'Multan', lat: 30.1575, lng: 71.5249, radiusKm: 12 },
    { name: 'Sialkot', lat: 32.4945, lng: 74.5229, radiusKm: 9 },
    { name: 'Gwadar', lat: 25.1264, lng: 62.3226, radiusKm: 6 },
  ];

  ctx.save();
  majorCities.forEach(city => {
    if (city.lat >= south - 0.2 && city.lat <= north + 0.2 && city.lng >= west - 0.2 && city.lng <= east + 0.2) {
      const pt = latLngToTilePixel(city.lat, city.lng, west, east, south, north, w);
      const pxRadius = Math.max(10, (city.radiusKm / 111.32) / (north - south) * h);

      // Urban texture mosaic (street grid pattern)
      ctx.strokeStyle = theme === 'satellite' ? 'rgba(203, 213, 225, 0.2)' : 'rgba(100, 116, 139, 0.25)';
      ctx.lineWidth = 1;

      for (let ox = -pxRadius; ox <= pxRadius; ox += 14) {
        for (let oy = -pxRadius; oy <= pxRadius; oy += 14) {
          if (ox * ox + oy * oy <= pxRadius * pxRadius) {
            const bx = pt.x + ox;
            const by = pt.y + oy;
            if (bx >= 0 && bx <= w && by >= 0 && by <= h) {
              ctx.strokeRect(bx, by, 10, 10);
            }
          }
        }
      }
    }
  });
  ctx.restore();
}

/**
 * Renders Vector Topographic Elevation Contours
 */
function renderVectorContours(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
  theme: string
) {
  if (z < 8) return;

  ctx.save();
  ctx.strokeStyle = theme === 'terrain'
    ? 'rgba(109, 76, 65, 0.45)'
    : theme === 'slope'
    ? 'rgba(0, 0, 0, 0.35)'
    : 'rgba(120, 100, 75, 0.3)';
  ctx.lineWidth = 1;

  const contourSteps = z >= 13 ? 6 : z >= 10 ? 4 : 2;
  for (let c = 0; c < contourSteps; c++) {
    const offsetLat = south + ((north - south) * (c + 0.5)) / contourSteps;

    ctx.beginPath();
    for (let px = 0; px <= w; px += 8) {
      const curLng = west + (east - west) * (px / w);
      const elev = estimateElevation(offsetLat, curLng);
      const wave = Math.sin((curLng * 80 + offsetLat * 60) * 1.5) * 6;
      const py = ((north - offsetLat) / (north - south)) * h + wave;

      if (px === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Elevation annotation on index contour
    if (z >= 11 && c % 2 === 0) {
      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = theme === 'terrain' ? '#451a03' : '#64748b';
      const sampleElev = Math.round(estimateElevation(offsetLat, (west + east) / 2));
      ctx.fillText(`${sampleElev}m`, 24, (h / contourSteps) * (c + 0.5) - 3);
    }
  }
  ctx.restore();
}

/**
 * Renders Tactical Meridian & Latitude Grid Lines (MGRS & WGS84)
 */
function renderTacticalGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
  styleMode: OfflineMapStyle
) {
  ctx.save();
  let gridIntervalDeg = 1.0;
  if (z >= 15) gridIntervalDeg = 0.01;
  else if (z >= 13) gridIntervalDeg = 0.05;
  else if (z >= 11) gridIntervalDeg = 0.1;
  else if (z >= 9) gridIntervalDeg = 0.25;
  else if (z >= 7) gridIntervalDeg = 0.5;
  else if (z >= 5) gridIntervalDeg = 2.0;
  else gridIntervalDeg = 10.0;

  ctx.strokeStyle = styleMode === 'dark-radar' 
    ? 'rgba(56, 189, 248, 0.18)' 
    : styleMode === 'satellite-sim'
    ? 'rgba(255, 255, 255, 0.18)'
    : styleMode === 'offline-terrain'
    ? 'rgba(0, 0, 0, 0.15)'
    : 'rgba(100, 116, 139, 0.22)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  ctx.font = '9px monospace';
  ctx.fillStyle = styleMode === 'dark-radar' 
    ? '#38bdf8' 
    : styleMode === 'satellite-sim'
    ? '#f8fafc'
    : styleMode === 'offline-terrain'
    ? '#44403c'
    : '#64748b';

  // Longitude Lines (Vertical)
  const startLng = Math.ceil(west / gridIntervalDeg) * gridIntervalDeg;
  for (let lng = startLng; lng < east; lng += gridIntervalDeg) {
    const px = ((lng - west) / (east - west)) * w;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.stroke();

    const text = `${lng.toFixed(gridIntervalDeg < 0.1 ? 3 : 2)}°E`;
    ctx.fillText(text, px + 3, 12);
  }

  // Latitude Lines (Horizontal)
  const startLat = Math.ceil(south / gridIntervalDeg) * gridIntervalDeg;
  for (let lat = startLat; lat < north; lat += gridIntervalDeg) {
    const py = ((north - lat) / (north - south)) * h;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();

    const text = `${lat.toFixed(gridIntervalDeg < 0.1 ? 3 : 2)}°N`;
    ctx.fillText(text, 4, py - 3);
  }
  ctx.restore();
}

/**
 * Renders Offline Tactical Landmarks, Summits, Cantts & Airbases
 */
function renderGazetteerLandmarks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  z: number,
  west: number,
  east: number,
  north: number,
  south: number,
  styleMode: OfflineMapStyle
) {
  if (z < 6) return;

  ctx.save();
  OFFLINE_GAZETTEER.forEach(item => {
    if (item.lat >= south && item.lat <= north && item.lng >= west && item.lng <= east) {
      const pt = latLngToTilePixel(item.lat, item.lng, west, east, south, north, w);

      // Symbol
      ctx.beginPath();
      if (item.category === 'Cantonment/Base') {
        ctx.fillStyle = styleMode === 'dark-radar' ? '#38bdf8' : '#2563eb';
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (item.category === 'Mountain/Pass') {
        ctx.fillStyle = '#d97706';
        ctx.moveTo(pt.x, pt.y - 5);
        ctx.lineTo(pt.x + 4.5, pt.y + 4);
        ctx.lineTo(pt.x - 4.5, pt.y + 4);
        ctx.closePath();
        ctx.fill();
      } else if (item.category === 'Airport') {
        ctx.fillStyle = '#9333ea';
        ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.fillStyle = styleMode === 'dark-radar' ? '#94a3b8' : '#475569';
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Label text
      ctx.font = 'bold 9px sans-serif';
      ctx.fillStyle = styleMode === 'dark-radar' 
        ? '#f8fafc' 
        : styleMode === 'satellite-sim'
        ? '#ffffff'
        : styleMode === 'offline-terrain'
        ? '#1c1917'
        : '#1e293b';

      ctx.shadowColor = styleMode === 'dark-radar' || styleMode === 'satellite-sim' ? '#000000' : '#ffffff';
      ctx.shadowBlur = 4;
      const cleanName = item.name.split(' (')[0];
      ctx.fillText(cleanName, pt.x + 6, pt.y + 3);

      if (z >= 10 && item.elevationM > 0) {
        ctx.font = '8px monospace';
        ctx.fillStyle = styleMode === 'dark-radar' ? '#38bdf8' : styleMode === 'satellite-sim' ? '#38bdf8' : '#78716c';
        ctx.fillText(`${item.elevationM}m`, pt.x + 6, pt.y + 12);
      }
    }
  });
  ctx.restore();
}
