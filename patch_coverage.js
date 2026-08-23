const fs = require('fs');
const file = 'src/components/CoveragePrediction.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace imports
content = content.replace(/import \{[\s\S]*?\} from 'react-leaflet';/, '');
content = content.replace(/import L from 'leaflet';\nimport 'leaflet\/dist\/leaflet\.css';/, '');

content = content.replace(/\/\/ Fix for default marker icons[\s\S]*?return null;\n}/, '');

// Replace MapContainer
const mapStart = content.indexOf('{/* Leaflet Map Canvas */}');
const mapEnd = content.lastIndexOf('</MapContainer>') + '</MapContainer>'.length;
if (mapStart !== -1 && mapEnd !== -1) {
  content = content.substring(0, mapStart) + `
        {/* Map Side Removed */}
        <div className="w-full h-full bg-slate-50 flex items-center justify-center p-6 text-center">
          <div>
            <MapPin className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-slate-600 font-bold text-xl mb-2">GIS Map Disabled</h3>
            <p className="text-slate-500">Map visualization has been moved to the standalone Offline Map Manager.</p>
          </div>
        </div>
` + content.substring(mapEnd);
}

fs.writeFileSync(file, content);
