import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import {
  MapPin,
  Plus,
  Search,
  Filter,
  Trash2,
  Edit,
  Activity,
  AlertTriangle,
  Wifi,
  WifiOff,
  Globe,
  Layers,
  Crosshair,
  Compass,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { Site } from '../types';
import { searchOfflineLocations } from '../lib/offlineGeo';
import { ONLINE_MAP_LAYERS, DEFAULT_ONLINE_LAYER_ID } from '../gis/mapLayers';
import { cn } from '../lib/utils';

// Leaflet Default Icon
const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Marker for Site Types
function createSitePin(type: string, status: string = 'online') {
  const typeColors: Record<string, string> = {
    repeater: '#10b981',
    'base-station': '#2563eb',
    subscriber: '#f59e0b',
    'microwave-node': '#8b5cf6',
    relay: '#06b6d4',
  };
  const color = typeColors[type] || '#3b82f6';
  const isOffline = status === 'offline';

  return L.divIcon({
    className: 'rnms-modal-site-pin',
    html: `
      <div style="position: relative; width: 30px; height: 30px; transform: translate(-15px, -15px);">
        <div style="background-color: ${isOffline ? '#64748b' : color}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; position: relative;">
          <svg style="width: 16px; height: 16px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20m0-20l7 7m-7-7L5 9m7 13l7-7m-7 7l-7-7"/>
          </svg>
          <div style="position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; border-radius: 50%; background: ${isOffline ? '#94a3b8' : '#10b981'}; border: 2px solid white;"></div>
        </div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

// Interactive Map Click Handler for Modal
function LocationPickerEvents({
  onLocationPick,
}: {
  onLocationPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onLocationPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Leaflet Map Camera Controller for Modal
function ModalMapController({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
    const t = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(t);
  }, [map]);

  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true });
  }, [lat, lng, map]);

  return null;
}

export function SitesNodes() {
  const { sites, addSite, removeSite, updateSite, clearAllSites, setCurrentView, theme } =
    useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [siteToDelete, setSiteToDelete] = useState<string | null>(null);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);

  // Modal Map Mode (Online English vs Offline Base)
  const [modalMapMode, setModalMapMode] = useState<'online' | 'offline'>('online');
  const [modalActiveLayerId, setModalActiveLayerId] = useState<string>(DEFAULT_ONLINE_LAYER_ID);

  // Search State for Modal
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState<any[]>([]);
  const [modalIsSearching, setModalIsSearching] = useState(false);
  const [modalShowSearchResults, setModalShowSearchResults] = useState(false);

  const activeLayer =
    ONLINE_MAP_LAYERS[modalActiveLayerId] || ONLINE_MAP_LAYERS[DEFAULT_ONLINE_LAYER_ID];

  // Default new site coordinates to Islamabad, Pakistan
  const [formData, setFormData] = useState<Partial<Site>>({
    name: '',
    lat: 33.6844,
    lng: 73.0479,
    elevation: 540,
    type: 'base-station',
    status: 'online',
    radioType: 'base',
    txPowerW: 50,
    txFreqMHz: undefined,
    rxFreqMHz: undefined,
  });

  const confirmDelete = () => {
    if (siteToDelete) {
      removeSite(siteToDelete);
      setSiteToDelete(null);
    }
  };

  const handleModalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalSearchQuery.trim()) return;

    // 1. 100% Offline Gazetteer & GPS Coordinates Search
    const offlineMatches = searchOfflineLocations(modalSearchQuery);
    if (offlineMatches.length > 0) {
      setModalSearchResults(
        offlineMatches.map((m) => ({
          display_name: m.displayName,
          lat: m.lat,
          lon: m.lng,
          elevationM: m.elevationM,
        }))
      );
      setModalShowSearchResults(true);
      return;
    }

    // 2. Online Geocoding Fallback if in Online Map Mode
    if (modalMapMode === 'online') {
      setModalIsSearching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
            modalSearchQuery
          )}&limit=5`
        );
        if (res.ok) {
          const data = await res.json();
          setModalSearchResults(data);
          setModalShowSearchResults(true);
        }
      } catch {
        setModalSearchResults([
          {
            display_name: `Location not found: "${modalSearchQuery}"`,
            lat: formData.lat || 33.6844,
            lon: formData.lng || 73.0479,
            isError: true,
          },
        ]);
        setModalShowSearchResults(true);
      } finally {
        setModalIsSearching(false);
      }
    }
  };

  const handleSelectModalSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    const elev = result.elevationM || formData.elevation || 300;

    const cleanName = result.display_name.split(' (')[0].split(',')[0];
    setFormData((prev) => ({
      ...prev,
      lat,
      lng,
      elevation: elev,
      name: prev.name ? prev.name : cleanName,
    }));
    setModalShowSearchResults(false);
    setModalSearchQuery(cleanName);
  };

  const handleMapLocationPick = (lat: number, lng: number) => {
    setFormData((prev) => ({
      ...prev,
      lat: parseFloat(lat.toFixed(5)),
      lng: parseFloat(lng.toFixed(5)),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || typeof formData.lat !== 'number' || typeof formData.lng !== 'number') return;

    if (modalMode === 'add') {
      const newSite: Site = {
        id: `site-${Date.now().toString(36)}`,
        name: formData.name,
        lat: formData.lat,
        lng: formData.lng,
        elevation: formData.elevation || 0,
        type: formData.type || 'base-station',
        status: formData.status || 'online',
        radioType: formData.radioType || 'base',
        txPowerW: formData.txPowerW || 50,
        txFreqMHz: formData.txFreqMHz,
        rxFreqMHz: formData.rxFreqMHz,
      };
      addSite(newSite);
    } else if (formData.id) {
      updateSite(formData.id, formData as Site);
    }

    setIsModalOpen(false);
  };

  const filteredSites = sites.filter((site) => {
    const siteName = site.name || '';
    const siteType = site.type || '';
    const siteStatus = site.status || 'online';
    const matchesSearch = siteName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || siteType === filterType;
    const matchesStatus = filterStatus === 'all' || siteStatus === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const onlineCount = sites.filter((s) => (s.status || 'online') === 'online').length;
  const offlineCount = sites.filter((s) => s.status === 'offline').length;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-3 sm:p-6 select-none">
      <div className="flex flex-col h-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Sites & Network Nodes</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {sites.length} Total
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage RF repeaters, base stations, and tactical microwave relay nodes
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Clear All Data */}
            {sites.length > 0 && (
              <button
                type="button"
                onClick={() => setIsClearAllConfirmOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl border border-rose-200 dark:border-rose-900/50 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Wipe All</span>
              </button>
            )}

            {/* Switch to GIS Map */}
            <button
              type="button"
              onClick={() => setCurrentView('map')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
            >
              <Globe className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>View on GIS Map</span>
            </button>

            {/* Add Site Button */}
            <button
              type="button"
              onClick={() => {
                setModalMode('add');
                setFormData({
                  name: '',
                  lat: 33.6844,
                  lng: 73.0479,
                  elevation: 540,
                  type: 'base-station',
                  status: 'online',
                  radioType: 'base',
                  txPowerW: 50,
                  txFreqMHz: undefined,
                  rxFreqMHz: undefined,
                });
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              <span>Add Site / Node</span>
            </button>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 flex-1 max-w-xl">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search sites by name, ID..."
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Node Types</option>
              <option value="base-station">Base Stations</option>
              <option value="repeater">Repeaters</option>
              <option value="relay">Relays</option>
              <option value="subscriber">Subscribers</option>
              <option value="microwave-node">Microwave Nodes</option>
            </select>

            {/* Status Filter (Online / Offline) */}
            <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-bold transition',
                  filterStatus === 'all'
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                All ({sites.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('online')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition',
                  filterStatus === 'online'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <Wifi className="w-3 h-3 text-emerald-600" />
                <span>Online ({onlineCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('offline')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition',
                  filterStatus === 'offline'
                    ? 'bg-slate-300 text-slate-800 dark:bg-slate-700 dark:text-slate-200'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                )}
              >
                <WifiOff className="w-3 h-3 text-slate-500" />
                <span>Offline ({offlineCount})</span>
              </button>
            </div>
          </div>
        </div>

        {/* Sites Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 dark:bg-slate-800/80 sticky top-0 z-10 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Site Name</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Node Type</th>
                <th className="py-3 px-4">Radio & Power</th>
                <th className="py-3 px-4">Coordinates</th>
                <th className="py-3 px-4">Elevation</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              {filteredSites.length > 0 ? (
                filteredSites.map((site) => {
                  const isOnline = (site.status || 'online') === 'online';
                  return (
                    <tr
                      key={site.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center mr-3 font-bold',
                              site.type === 'repeater'
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                : site.type === 'relay'
                                ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300'
                                : site.type === 'base-station'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            )}
                          >
                            <MapPin className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                              {site.name || 'Unknown Site'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">{site.id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            const newStatus = isOnline ? 'offline' : 'online';
                            updateSite(site.id, { ...site, status: newStatus });
                          }}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition',
                            isOnline
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          )}
                          title="Click to toggle Online / Offline"
                        >
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full',
                              isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                            )}
                          />
                          <span>{isOnline ? 'Online' : 'Offline'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={cn(
                            'px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider',
                            site.type === 'repeater'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-300'
                              : site.type === 'relay'
                              ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 dark:bg-cyan-950/40 dark:border-cyan-900/60 dark:text-cyan-300'
                              : site.type === 'base-station'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/60 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300'
                          )}
                        >
                          {(site.type || 'unknown').replace('-', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                          {site.radioType ? site.radioType.replace('-', ' ') : 'N/A'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                          {site.txPowerW !== undefined ? `${site.txPowerW} W` : '50 W'}
                          {site.txFreqMHz && ` · TX ${site.txFreqMHz} MHz`}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        {typeof site.lat === 'number' ? site.lat.toFixed(5) : '0.00000'}°,{' '}
                        {typeof site.lng === 'number' ? site.lng.toFixed(5) : '0.00000'}°
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300 font-medium">
                        {site.elevation || 0} <span className="text-[10px] text-slate-400">m AMSL</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setCurrentView('map')}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-lg transition"
                            title="View Site on GIS Map"
                          >
                            <MapPin className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModalMode('edit');
                              setFormData(site);
                              setIsModalOpen(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                            title="Edit Site Parameters"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSiteToDelete(site.id);
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition"
                            title="Delete Site"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <MapPin className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
                    <p className="font-semibold text-slate-700 dark:text-slate-300">No sites found</p>
                    <p className="text-xs">Adjust your search filters or click "Add Site / Node".</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          Add / Edit Site Modal with Interactive Online & Offline Map Location Picker
         ========================================================================= */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-3 sm:p-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">
                    {modalMode === 'add' ? 'Add New RF Site / Node' : `Edit Site (${formData.name})`}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Configure radio parameters and pick location on interactive GIS map
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-lg font-bold transition"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex flex-col md:flex-row flex-1 min-h-[480px] overflow-hidden">
                {/* Form Side */}
                <form
                  onSubmit={handleSubmit}
                  className="w-full md:w-1/2 p-5 sm:p-6 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 overflow-y-auto"
                >
                  {/* Site Name & Status */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                        Site Name
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. ISB-MARGALLA-01"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                        Status
                      </label>
                      <select
                        value={formData.status || 'online'}
                        onChange={(e) =>
                          setFormData({ ...formData, status: e.target.value as any })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="online">Online (Active)</option>
                        <option value="offline">Offline (Standby)</option>
                      </select>
                    </div>
                  </div>

                  {/* Node Type & Elevation */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                        Node Type
                      </label>
                      <select
                        value={formData.type || 'base-station'}
                        onChange={(e) =>
                          setFormData({ ...formData, type: e.target.value as any })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="base-station">Base Station</option>
                        <option value="repeater">Repeater</option>
                        <option value="relay">Relay Node</option>
                        <option value="subscriber">Subscriber / Mobile</option>
                        <option value="microwave-node">Microwave Node</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                        Elevation (m AMSL)
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.elevation || 0}
                        onChange={(e) =>
                          setFormData({ ...formData, elevation: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Radio Equipment Type & Tx Power */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                        Radio Eqpt Type
                      </label>
                      <select
                        value={formData.radioType || 'base'}
                        onChange={(e) => {
                          const type = e.target.value as any;
                          let defaultPwr = formData.txPowerW || 50;
                          if (type === 'base') defaultPwr = 50;
                          else if (type === 'vehicular') defaultPwr = 25;
                          else if (type === 'walkie-talkie') defaultPwr = 5;
                          setFormData({ ...formData, radioType: type, txPowerW: defaultPwr });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="base">Base Station (High Power)</option>
                        <option value="vehicular">Vehicular (Medium Power)</option>
                        <option value="walkie-talkie">Walkie Talkie (Handheld)</option>
                        <option value="custom">Custom Configuration</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                        Tx Power (Watts)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={formData.txPowerW ?? 50}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            txPowerW: Number(e.target.value),
                            radioType: 'custom',
                          })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Frequencies */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                        TX Freq (MHz)
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={formData.txFreqMHz || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, txFreqMHz: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. 155.500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                        RX Freq (MHz)
                      </label>
                      <input
                        type="number"
                        step="0.00001"
                        value={formData.rxFreqMHz || ''}
                        onChange={(e) =>
                          setFormData({ ...formData, rxFreqMHz: Number(e.target.value) })
                        }
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g. 160.100"
                      />
                    </div>
                  </div>

                  {/* Coordinates Display & Input */}
                  <div className="bg-blue-50 dark:bg-blue-950/40 p-3 rounded-xl border border-blue-100 dark:border-blue-900/60 text-xs">
                    <div className="font-bold text-blue-800 dark:text-blue-300 mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Crosshair className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" /> Geographic Position
                      </span>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400">
                        Click map to update
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          Latitude (°N)
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={formData.lat || 33.6844}
                          onChange={(e) =>
                            setFormData({ ...formData, lat: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400">
                          Longitude (°E)
                        </label>
                        <input
                          type="number"
                          step="0.000001"
                          required
                          value={formData.lng || 73.0479}
                          onChange={(e) =>
                            setFormData({ ...formData, lng: Number(e.target.value) })
                          }
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-mono text-xs text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="mt-auto pt-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition"
                    >
                      Save Site Parameters
                    </button>
                  </div>
                </form>

                {/* Map Side with Online/Offline Switcher and Search */}
                <div className="w-full md:w-1/2 relative flex flex-col bg-slate-100 dark:bg-slate-950">
                  {/* Top Floating Controls inside Modal */}
                  <div className="absolute top-3 left-3 right-3 z-[1000] flex flex-col gap-2">
                    {/* Search Bar */}
                    <form onSubmit={handleModalSearch} className="relative shadow-lg rounded-xl">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={modalSearchQuery}
                        onChange={(e) => {
                          setModalSearchQuery(e.target.value);
                          if (!e.target.value.trim()) setModalShowSearchResults(false);
                        }}
                        placeholder="Search Pakistani cities, cantts, passes or coordinates..."
                        className="w-full pl-9 pr-20 py-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 shadow-md font-medium"
                      />
                      <button
                        type="submit"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold transition"
                      >
                        {modalIsSearching ? '...' : 'Search'}
                      </button>
                    </form>

                    {/* Search Results Dropdown */}
                    {modalShowSearchResults && modalSearchResults.length > 0 && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl max-h-48 overflow-y-auto p-1 text-xs space-y-1">
                        {modalSearchResults.map((res, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSelectModalSearchResult(res)}
                            className="w-full text-left p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/60 text-slate-800 dark:text-slate-200 transition flex items-start gap-2"
                          >
                            <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                            <div className="truncate">
                              <div className="font-semibold truncate">{res.display_name}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {parseFloat(res.lat).toFixed(4)}°, {parseFloat(res.lon).toFixed(4)}°
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Online vs Offline Map Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 shadow-md">
                        <button
                          type="button"
                          onClick={() => setModalMapMode('online')}
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition',
                            modalMapMode === 'online'
                              ? 'bg-blue-600 text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          )}
                        >
                          <Wifi className="w-3 h-3" />
                          <span>Online Map</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setModalMapMode('offline')}
                          className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition',
                            modalMapMode === 'offline'
                              ? 'bg-emerald-600 text-white'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                          )}
                        >
                          <WifiOff className="w-3 h-3" />
                          <span>Offline Mode</span>
                        </button>
                      </div>

                      {/* Map Layer Selector (Online) */}
                      {modalMapMode === 'online' && (
                        <select
                          value={modalActiveLayerId}
                          onChange={(e) => setModalActiveLayerId(e.target.value)}
                          className="px-2.5 py-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl text-[11px] font-bold text-slate-800 dark:text-slate-100 shadow-md"
                        >
                          <option value="carto-voyager">English Voyager</option>
                          <option value="esri-satellite">Satellite + Labels</option>
                          <option value="esri-streets">World Streets</option>
                          <option value="esri-topo">Topographic</option>
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Leaflet Map Canvas */}
                  <div className="flex-1 w-full h-full min-h-[350px]">
                    <MapContainer
                      center={[formData.lat || 33.6844, formData.lng || 73.0479]}
                      zoom={9}
                      className="w-full h-full z-0"
                      zoomControl={false}
                    >
                      <ModalMapController
                        lat={formData.lat || 33.6844}
                        lng={formData.lng || 73.0479}
                      />
                      <LocationPickerEvents onLocationPick={handleMapLocationPick} />

                      {/* Tile Layer */}
                      <TileLayer
                        key={`${modalActiveLayerId}-${modalMapMode}`}
                        url={
                          modalMapMode === 'online'
                            ? activeLayer.url
                            : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                        }
                        subdomains={activeLayer.subdomains || ['a', 'b', 'c', 'd']}
                        maxZoom={19}
                      />

                      {/* Optional Hybrid Overlay */}
                      {modalMapMode === 'online' && activeLayer.overlayUrl && (
                        <TileLayer
                          key={`${modalActiveLayerId}-overlay`}
                          url={activeLayer.overlayUrl}
                          maxZoom={19}
                        />
                      )}

                      {/* Active Site Marker */}
                      <Marker
                        position={[formData.lat || 33.6844, formData.lng || 73.0479]}
                        icon={createSitePin(formData.type || 'base-station', formData.status || 'online')}
                        draggable={true}
                        eventHandlers={{
                          dragend: (e) => {
                            const marker = e.target;
                            const pos = marker.getLatLng();
                            handleMapLocationPick(pos.lat, pos.lng);
                          },
                        }}
                      />
                    </MapContainer>
                  </div>

                  {/* Bottom Map Helper Info */}
                  <div className="absolute bottom-2 left-3 right-3 z-[1000] bg-slate-900/85 text-slate-300 text-[10px] font-mono px-3 py-1.5 rounded-xl border border-slate-800 shadow-md backdrop-blur-md flex items-center justify-between pointer-events-none">
                    <span>
                      Selected: {formData.lat?.toFixed(5)}°N, {formData.lng?.toFixed(5)}°E
                    </span>
                    <span className="text-blue-400 font-bold">
                      {modalMapMode === 'online' ? 'English Map' : 'Offline Gazetteer Ready'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Confirmation Modal */}
      {siteToDelete &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6 border border-slate-200 dark:border-slate-800 animate-in fade-in">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base mb-2">
                Delete Site?
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-xs">
                Are you sure you want to delete this site? Any connected RF links will also be removed.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSiteToDelete(null)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition"
                >
                  Delete Site
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Clear All Confirmation Modal */}
      {isClearAllConfirmOpen &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden p-6 border-t-4 border-rose-600 border-x border-b border-slate-200 dark:border-slate-800 animate-in fade-in">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Wipe Network Data?
              </h3>
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-xs">
                This will permanently delete all Sites, Nodes, and RF Links from the current workspace.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClearAllConfirmOpen(false)}
                  className="px-3.5 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearAllSites();
                    setIsClearAllConfirmOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition"
                >
                  Yes, Wipe Everything
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
