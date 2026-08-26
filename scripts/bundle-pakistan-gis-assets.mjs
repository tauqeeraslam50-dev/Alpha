import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const offlineMapsDir = path.join(rootDir, 'public', 'offline-maps');

// Import Pakistan cities data from src/lib/pakistanCitiesData.ts
const citiesContent = fs.readFileSync(
  path.join(rootDir, 'src', 'lib', 'pakistanCitiesData.ts'),
  'utf-8'
);

// Extract PAKISTAN_CITIES array from ts file
const match = citiesContent.match(/export const PAKISTAN_CITIES: GeoLocation\[\] = (\[[\s\S]*?\]);/);
if (match) {
  try {
    const citiesJson = match[1]
      .replace(/\/\/.*$/gm, '')
      .replace(/(\w+):/g, '"$1":')
      .replace(/'/g, '"')
      .replace(/,\s*]/g, ']');
    const parsed = JSON.parse(citiesJson);

    fs.writeFileSync(
      path.join(offlineMapsDir, 'pakistan_places_gazetteer.json'),
      JSON.stringify(parsed, null, 2)
    );

    const geojson = {
      type: 'FeatureCollection',
      name: 'Pakistan_Places_Gazetteer',
      features: parsed.map((p) => ({
        type: 'Feature',
        properties: {
          name: p.name,
          category: p.category,
          elevationM: p.elevationM || 0,
          country: 'Pakistan',
        },
        geometry: {
          type: 'Point',
          coordinates: [p.lng, p.lat, p.elevationM || 0],
        },
      })),
    };

    fs.writeFileSync(
      path.join(offlineMapsDir, 'pakistan_places_gazetteer.geojson'),
      JSON.stringify(geojson, null, 2)
    );

    console.log(`✅ Saved ${parsed.length} places into public/offline-maps/`);
  } catch (err) {
    console.error('Error parsing cities:', err);
  }
}
