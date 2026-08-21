import { estimateElevation } from './losUtils';
import { getRuntimeElevation } from './demRuntime';

export interface ElevationPointInfo {
  lat: number;
  lng: number;
  elevationM: number;
  elevationFt: number;
  slopeDeg: number;
  slopePercent: number;
  aspectDeg: number;
  aspectCompass: string;
  terrainCategory: string;
  recommendedClutterM: number;
  source: 'DEM' | 'ESTIMATED';
}

export function getElevationColor(elevM: number): [number, number, number] {
  if (elevM < 0) return [20, 70, 140];
  if (elevM < 100) return [34, 139, 34];
  if (elevM < 250) return [76, 175, 80];
  if (elevM < 450) return [139, 195, 74];
  if (elevM < 700) return [205, 220, 57];
  if (elevM < 1000) return [255, 214, 0];
  if (elevM < 1500) return [255, 152, 0];
  if (elevM < 2200) return [230, 81, 0];
  if (elevM < 3200) return [141, 110, 99];
  if (elevM < 4500) return [109, 76, 65];
  if (elevM < 5800) return [148, 163, 184];
  return [248, 250, 252];
}

function elevationAt(lat: number, lng: number): number {
  return getRuntimeElevation(lat, lng) ?? estimateElevation(lat, lng);
}

export function calculateHillshade(lat: number, lng: number, delta = 0.005, sunAzimuthDeg = 315, sunAltitudeDeg = 45): number {
  const zN = elevationAt(lat + delta, lng);
  const zS = elevationAt(lat - delta, lng);
  const zE = elevationAt(lat, lng + delta);
  const zW = elevationAt(lat, lng - delta);
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const dzdx = (zE - zW) / (2 * delta * metersPerDegLng);
  const dzdy = (zN - zS) / (2 * delta * metersPerDegLat);
  const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  let aspectRad = Math.atan2(-dzdy, dzdx);
  if (aspectRad < 0) aspectRad += 2 * Math.PI;
  const sunAzRad = (sunAzimuthDeg * Math.PI) / 180;
  const zenithRad = Math.PI / 2 - (sunAltitudeDeg * Math.PI) / 180;
  const hillshade = Math.cos(zenithRad) * Math.cos(slopeRad) + Math.sin(zenithRad) * Math.sin(slopeRad) * Math.cos(sunAzRad - aspectRad);
  return Math.max(0, Math.min(255, Math.round(hillshade * 255)));
}

export function getCompassHeading(deg: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  return directions[Math.round((((deg % 360) + 360) % 360) / 45)];
}

export function getDetailedElevationInfo(lat: number, lng: number): ElevationPointInfo {
  const demElevation = getRuntimeElevation(lat, lng);
  const elevM = demElevation ?? estimateElevation(lat, lng);
  const source: ElevationPointInfo['source'] = demElevation === null ? 'ESTIMATED' : 'DEM';
  const delta = 0.003;
  const zN = elevationAt(lat + delta, lng), zS = elevationAt(lat - delta, lng);
  const zE = elevationAt(lat, lng + delta), zW = elevationAt(lat, lng - delta);
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const dzdx = (zE - zW) / (2 * delta * metersPerDegLng);
  const dzdy = (zN - zS) / (2 * delta * metersPerDegLat);
  const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
  const slopeDeg = Math.round((slopeRad * 180) / Math.PI * 10) / 10;
  const slopePercent = Math.round(Math.tan(slopeRad) * 1000) / 10;
  let aspectRad = Math.atan2(-dzdy, dzdx);
  if (aspectRad < 0) aspectRad += 2 * Math.PI;
  const aspectDeg = Math.round((aspectRad * 180) / Math.PI);
  const aspectCompass = getCompassHeading(aspectDeg);

  let terrainCategory = 'Undulating Plain';
  let recommendedClutterM = 5;
  if (lat >= 35.0 && elevM > 4000) { terrainCategory = 'Glacial Alpine Peak & Ridge'; recommendedClutterM = 0; }
  else if (lat >= 34.0 && elevM > 2500) { terrainCategory = 'High Alpine Karakoram / Himalayan Tundra'; recommendedClutterM = 2; }
  else if (lat >= 33.8 && elevM >= 1600) { terrainCategory = 'Pine Forest Highlands (Murree / Galyat Ridge)'; recommendedClutterM = 18; }
  else if (lat >= 33.72 && lat <= 33.85 && lng >= 72.85 && lng <= 73.25 && elevM > 800) { terrainCategory = 'Margalla National Park Escarpment'; recommendedClutterM = 12; }
  else if (lat >= 33.0 && lat < 33.7 && lng >= 72.0 && lng <= 73.6) { terrainCategory = 'Potohar Plateau (Ravines & Kharian Basin)'; recommendedClutterM = 8; }
  else if (lat >= 32.4 && lat <= 32.9 && lng >= 71.5 && lng <= 73.5) { terrainCategory = 'Salt Range Escarpment'; recommendedClutterM = 6; }
  else if (lat <= 32.0 && lng <= 69.5 && elevM > 1200) { terrainCategory = 'Balochistan Rocky Plateau & Canyon'; recommendedClutterM = 2; }
  else if (lat >= 29.5 && lat <= 32.5 && lng >= 71.0 && lng <= 75.0) { terrainCategory = 'Indus Alluvial Agricultural Floodplain'; recommendedClutterM = 10; }
  else if (lat < 29.0 && lng >= 70.0 && lng <= 73.0) { terrainCategory = 'Thar / Cholistan Dune Desert'; recommendedClutterM = 1; }
  else if (lat <= 25.5 && lng <= 67.5) { terrainCategory = 'Arabian Sea Coastal Littoral'; recommendedClutterM = 4; }

  return { lat, lng, elevationM: elevM, elevationFt: Math.round(elevM * 3.28084), slopeDeg, slopePercent, aspectDeg, aspectCompass, terrainCategory, recommendedClutterM, source };
}
