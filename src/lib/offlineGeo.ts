import { PAKISTAN_CITIES } from "./pakistanCitiesData";
/**
 * Offline Geographic Gazetteer & Landmark Coordinate Database
 * Provides 100% offline location search, city geocoding, and coordinate parsing
 * without requiring any active internet connection or external API (Nominatim/Google).
 */

export interface GeoLocation {
  name: string;
  category: 'City' | 'Mountain/Pass' | 'Cantonment/Base' | 'Airport' | 'Region';
  lat: number;
  lng: number;
  elevationM: number;
  country: string;
}

export const OFFLINE_GAZETTEER: GeoLocation[] = [
  ...PAKISTAN_CITIES,
  // Federal & Northern Pakistan / Region-7
  { name: 'Islamabad (Capital)', category: 'City', lat: 33.6844, lng: 73.0479, elevationM: 540, country: 'Pakistan' },
  { name: 'Rawalpindi (GHQ / Cantt)', category: 'Cantonment/Base', lat: 33.5651, lng: 73.0169, elevationM: 508, country: 'Pakistan' },
  { name: 'Murree Hills (Repeater Ridge)', category: 'Mountain/Pass', lat: 33.9070, lng: 73.3943, elevationM: 2291, country: 'Pakistan' },
  { name: 'Pir Sohawa / Margalla Ridge', category: 'Mountain/Pass', lat: 33.7850, lng: 73.0900, elevationM: 1100, country: 'Pakistan' },
  { name: 'Peshawar', category: 'City', lat: 34.0151, lng: 71.5249, elevationM: 359, country: 'Pakistan' },
  { name: 'Risalpur Base', category: 'Cantonment/Base', lat: 34.0500, lng: 71.9833, elevationM: 310, country: 'Pakistan' },
  { name: 'Nowshera', category: 'City', lat: 34.0153, lng: 71.9747, elevationM: 300, country: 'Pakistan' },
  { name: 'Abbottabad (PMA Kakul)', category: 'Cantonment/Base', lat: 34.1688, lng: 73.2215, elevationM: 1256, country: 'Pakistan' },
  { name: 'Muzaffarabad', category: 'City', lat: 34.3700, lng: 73.4711, elevationM: 737, country: 'Pakistan' },
  { name: 'Gilgit HQ', category: 'City', lat: 35.9221, lng: 74.3087, elevationM: 1500, country: 'Pakistan' },
  { name: 'Skardu High Altitude', category: 'Airport', lat: 35.2971, lng: 75.6333, elevationM: 2228, country: 'Pakistan' },
  { name: 'Karakoram Highway / Babusar Pass', category: 'Mountain/Pass', lat: 35.1500, lng: 74.0500, elevationM: 4173, country: 'Pakistan' },

  // Punjab
  { name: 'Lahore (Corps HQ)', category: 'City', lat: 31.5204, lng: 74.3587, elevationM: 217, country: 'Pakistan' },
  { name: 'Gujranwala Cantt', category: 'Cantonment/Base', lat: 32.1877, lng: 74.1945, elevationM: 226, country: 'Pakistan' },
  { name: 'Sialkot Base', category: 'Cantonment/Base', lat: 32.4945, lng: 74.5229, elevationM: 256, country: 'Pakistan' },
  { name: 'Jhelum River Node', category: 'City', lat: 32.9425, lng: 73.7257, elevationM: 234, country: 'Pakistan' },
  { name: 'Mangla HQ', category: 'Cantonment/Base', lat: 33.1417, lng: 73.6450, elevationM: 300, country: 'Pakistan' },
  { name: 'Sargodha PAF Base', category: 'Cantonment/Base', lat: 32.0836, lng: 72.6711, elevationM: 193, country: 'Pakistan' },
  { name: 'Multan Base', category: 'City', lat: 30.1575, lng: 71.5249, elevationM: 122, country: 'Pakistan' },
  { name: 'Bahawalpur', category: 'City', lat: 29.3544, lng: 71.6911, elevationM: 112, country: 'Pakistan' },

  // Sindh & Coastal
  { name: 'Karachi (Southern Fleet & HQ)', category: 'City', lat: 24.8607, lng: 67.0011, elevationM: 8, country: 'Pakistan' },
  { name: 'Hyderabad', category: 'City', lat: 25.3960, lng: 68.3578, elevationM: 30, country: 'Pakistan' },
  { name: 'Sukkur', category: 'City', lat: 27.7052, lng: 68.8574, elevationM: 67, country: 'Pakistan' },
  { name: 'Ormara Coastal Base', category: 'Cantonment/Base', lat: 25.2000, lng: 64.6333, elevationM: 10, country: 'Pakistan' },

  // Balochistan
  { name: 'Quetta (Command & Staff HQ)', category: 'Cantonment/Base', lat: 30.1798, lng: 66.9750, elevationM: 1680, country: 'Pakistan' },
  { name: 'Gwadar Port Base', category: 'Airport', lat: 25.1264, lng: 62.3225, elevationM: 15, country: 'Pakistan' },
  { name: 'Chaman Border Post', category: 'Mountain/Pass', lat: 30.9210, lng: 66.4597, elevationM: 1320, country: 'Pakistan' },
  { name: 'Khuzdar', category: 'City', lat: 27.8167, lng: 66.6167, elevationM: 1237, country: 'Pakistan' },

  // Strategic & International Reference Nodes
  { name: 'Dubai Hub', category: 'Airport', lat: 25.2048, lng: 55.2708, elevationM: 16, country: 'UAE' },
  { name: 'Kabul Regional', category: 'City', lat: 34.5553, lng: 69.2075, elevationM: 1790, country: 'Afghanistan' },
  { name: 'Riyadh Telecom Center', category: 'City', lat: 24.7136, lng: 46.6753, elevationM: 612, country: 'Saudi Arabia' },
  { name: 'London Greenwich (Prime Meridian)', category: 'Region', lat: 51.4769, lng: 0.0005, elevationM: 48, country: 'UK' }
];

/**
 * Searches the offline gazetteER database or parses raw coordinate strings.
 * Supports:
 * - City / Landmark name search (e.g., "Islamabad", "Murree", "GHQ")
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
