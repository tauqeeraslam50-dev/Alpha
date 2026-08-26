import { PAKISTAN_CITIES } from "./pakistanCitiesData";

/**
 * Offline Geographic Gazetteer & Landmark Coordinate Database
 * Provides 100% offline location search, city geocoding, and coordinate parsing
 * without requiring any active internet connection or external API.
 */

export interface GeoLocation {
  name: string;
  category: 'City' | 'Mountain/Pass' | 'Cantonment/Base' | 'Airport' | 'Region';
  lat: number;
  lng: number;
  elevationM: number;
  country: string;
}

export const OFFLINE_GAZETTEER: GeoLocation[] = PAKISTAN_CITIES;

/**
 * Searches the offline gazetteer database or parses raw coordinate strings.
 * Supports:
 * - City / Landmark name search (e.g., "Islamabad", "Murree", "GHQ", "Sakesar")
 * - Decimal coordinates: "33.6844, 73.0479" or "33.6844 73.0479"
 * - Degrees Minutes Seconds (DMS): "33°41'03\"N 73°02'52\"E"
 */
export function searchOfflineLocations(query: string): Array<{
  displayName: string;
  lat: number;
  lng: number;
  elevationM: number;
  type: string;
  isCoordinateMatch?: boolean;
}> {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();

  // 1. Direct Decimal Coordinate matching (e.g., "33.6844, 73.0479")
  const coordRegex = /^(-?\d+(\.\d+)?)[,\s\t]+(-?\d+(\.\d+)?)$/;
  const coordMatch = q.match(coordRegex);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lng = parseFloat(coordMatch[3]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [{
        displayName: `Target Coordinates: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`,
        lat,
        lng,
        elevationM: 0,
        type: 'GPS Coordinate',
        isCoordinateMatch: true
      }];
    }
  }

  // 2. DMS Coordinate matching (e.g. 33°41'N 73°02'E)
  const dmsRegex = /(\d+)[°\s]+(\d+)['\s]*([0-9.]+)?["\s]*([NSEWnsew])[,\s]+(\d+)[°\s]+(\d+)['\s]*([0-9.]+)?["\s]*([NSEWnsew])/i;
  const dmsMatch = query.match(dmsRegex);
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1]) + parseInt(dmsMatch[2]) / 60 + (parseFloat(dmsMatch[3]) || 0) / 3600;
    if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
    let lng = parseInt(dmsMatch[5]) + parseInt(dmsMatch[6]) / 60 + (parseFloat(dmsMatch[7]) || 0) / 3600;
    if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;

    return [{
      displayName: `DMS Target: ${lat.toFixed(5)}°, ${lng.toFixed(5)}°`,
      lat,
      lng,
      elevationM: 0,
      type: 'DMS Coordinate',
      isCoordinateMatch: true
    }];
  }

  // 3. Gazetteer text search
  return OFFLINE_GAZETTEER
    .filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.category.toLowerCase().includes(q) ||
      item.country.toLowerCase().includes(q)
    )
    .map(item => ({
      displayName: `${item.name} (${item.category}) - ${item.elevationM}m AMSL`,
      lat: item.lat,
      lng: item.lng,
      elevationM: item.elevationM,
      type: item.category
    }));
}
