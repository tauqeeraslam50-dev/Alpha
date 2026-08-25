import React, { useState } from 'react';
import { Map as MapIcon, Wifi, WifiOff, Layers } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { cn } from '../lib/utils';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { OfflineMapEngine } from './OfflineMapEngine';

const DefaultIcon = L.icon({ iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28] });
L.Marker.prototype.options.icon = DefaultIcon;

type MapMode = 'online' | 'offline';
type LayerType = 'street' | 'satellite';
const STREET_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const STREET_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SATELLITE_ATTR = 'Tiles &copy; Esri';

export function Map() {
  const { theme, sites } = useAppContext();
  const [mode, setMode] = useState<MapMode>('online');
  const [layer, setLayer] = useState<LayerType>('street');
  const [status, setStatus] = useState('Offline engine ready');

  return <section className={cn('h-full flex flex-col p-4 sm:p-5', theme === 'light' ? 'text-slate-900' : 'text-slate-100')}>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2"><MapIcon className="w-5 h-5 text-blue-600" /><h2 className="text-lg font-bold">Map</h2></div>
      <div className={cn('flex items-center rounded-lg border p-1', theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700')}>
        <button type="button" onClick={() => setMode('online')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold', mode === 'online' ? 'bg-blue-600 text-white' : 'text-slate-500')}><Wifi className="w-3.5 h-3.5" /> Online Map</button>
        <button type="button" onClick={() => setMode('offline')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold', mode === 'offline' ? 'bg-emerald-600 text-white' : 'text-slate-500')}><WifiOff className="w-3.5 h-3.5" /> Offline Map</button>
      </div>
    </div>

    <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-200 relative">
      {mode === 'online' ? <>
        <MapContainer center={[33.6844, 73.0479]} zoom={6} className="w-full h-full z-0" zoomControl>
          <TileLayer key={layer} attribution={layer === 'street' ? STREET_ATTR : SATELLITE_ATTR} url={layer === 'street' ? STREET_URL : SATELLITE_URL} maxZoom={19} />
          {sites.map(site => <Marker key={site.id} position={[site.lat, site.lng]}><Popup><div className="font-semibold text-slate-800">{site.name}</div><div className="text-xs text-slate-500">{site.type} Site</div></Popup></Marker>)}
        </MapContainer>
        <div className="absolute top-4 right-4 z-[400]"><div className="bg-white rounded-md shadow-md border border-slate-200 overflow-hidden"><button onClick={() => setLayer(layer === 'street' ? 'satellite' : 'street')} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Layers className="w-4 h-4 text-blue-600" />{layer === 'street' ? 'Satellite View' : 'Street View'}</button></div></div>
      </> : <OfflineMapEngine onStatus={setStatus} />}
    </div>
    {mode === 'offline' && <div className="mt-2 text-[11px] text-slate-500 font-medium">{status}</div>}
  </section>;
}
