export interface MapLayerConfig {
  id: string;
  name: string;
  category: 'street' | 'satellite' | 'topo' | 'dark' | 'light' | 'standard';
  url: string;
  subdomains?: string[];
  attribution: string;
  maxZoom: number;
  description: string;
  isEnglish: boolean;
  overlayUrl?: string;
  overlayAttribution?: string;
}

export const ONLINE_MAP_LAYERS: Record<string, MapLayerConfig> = {
  'english-voyager': {
    id: 'english-voyager',
    name: 'English Street (Voyager)',
    category: 'street',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
    description: 'Crisp global street map with clear English names and typography',
    isEnglish: true,
  },
  'esri-street': {
    id: 'esri-street',
    name: 'Esri World Street (English)',
    category: 'street',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, HERE, Garmin, USGS, EPA',
    maxZoom: 19,
    description: 'Comprehensive worldwide road network with English place names',
    isEnglish: true,
  },
  'esri-topo': {
    id: 'esri-topo',
    name: 'Esri Topographic (English)',
    category: 'topo',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, FAO, NOAA, USGS',
    maxZoom: 19,
    description: 'Topographic contours, elevation shading, and English labels',
    isEnglish: true,
  },
  'esri-satellite-hybrid': {
    id: 'esri-satellite-hybrid',
    name: 'Satellite + English Labels',
    category: 'satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    overlayUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics',
    overlayAttribution: 'Labels &copy; Esri',
    maxZoom: 19,
    description: 'High-res satellite imagery with crisp English boundaries & labels overlay',
    isEnglish: true,
  },
  'carto-dark': {
    id: 'carto-dark',
    name: 'Tactical Dark (English)',
    category: 'dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
    description: 'High-contrast dark tactical basemap with English labels',
    isEnglish: true,
  },
  'carto-light': {
    id: 'carto-light',
    name: 'Positron Light (English)',
    category: 'light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
    description: 'Subtle light basemap with English labels for RF link clarity',
    isEnglish: true,
  },
  'osm-standard': {
    id: 'osm-standard',
    name: 'OpenStreetMap (Standard)',
    category: 'standard',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    description: 'Standard community OpenStreetMap tiles (multilingual / local script)',
    isEnglish: false,
  },
};

export const DEFAULT_ONLINE_LAYER_ID = 'english-voyager';
