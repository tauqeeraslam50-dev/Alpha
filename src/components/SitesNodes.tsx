import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppContext } from '../context/AppContext';
import { MapPin, Plus, Search, Filter, Trash2, Edit, Activity, AlertTriangle } from 'lucide-react';
import { Site } from '../types';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { searchOfflineLocations } from '../lib/offlineGeo';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Component to handle map clicks for coordinate picking
function LocationPicker({ lat, lng, onChange }: { lat: number, lng: number, onChange: (lat: number, lng: number) => void }) {
  const map = useMap();
  
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });

  return <Marker position={[lat, lng]} />;
}

// Component to fly to searched location
function MapFlyTo({ position }: { position: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (position) {
      map.flyTo(position, 13, { duration: 1.5 });
    }
  }, [position, map]);
  return null;
}

export function SitesNodes() {
  const { sites, addSite, removeSite, updateSite, clearAllSites, setCurrentView } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [siteToDelete, setSiteToDelete] = useState<string | null>(null);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);

  // Search State for Modal
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [modalSearchResults, setModalSearchResults] = useState<any[]>([]);
  const [modalIsSearching, setModalIsSearching] = useState(false);
  const [modalShowSearchResults, setModalShowSearchResults] = useState(false);
  const [searchedPosition, setSearchedPosition] = useState<[number, number] | null>(null);

  const confirmDelete = () => {
    if (siteToDelete) {
      removeSite(siteToDelete);
      setSiteToDelete(null);
    }
  };

  const handleModalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalSearchQuery.trim()) return;

    // 1. 100% Offline Search (Gazetteer & GPS Coordinates)
    const offlineMatches = searchOfflineLocations(modalSearchQuery);
    if (offlineMatches.length > 0) {
      setModalSearchResults(offlineMatches.map(m => ({
        display_name: m.displayName,
        lat: m.lat,
        lon: m.lng
      })));
      setModalShowSearchResults(true);
      return;
    }

    // 2. Fallback
    setModalIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(modalSearchQuery)}&limit=5`);
      if (res.ok) {
        const data = await res.json();
        setModalSearchResults(data);
        setModalShowSearchResults(true);
      }
    } catch {
      setModalSearchResults([{
        display_name: `Location not found: "${modalSearchQuery}"`,
        lat: formData.lat || 33.6844,
        lon: formData.lng || 73.0479,
        isError: true
      }]);
      setModalShowSearchResults(true);
    } finally {
      setModalIsSearching(false);
    }
  };

  const handleSelectModalSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    
    setSearchedPosition([lat, lng]);
    
    // Auto fill name with the selected city
    const cleanName = result.display_name.split(' (')[0].split(',')[0];
    setFormData(prev => ({ ...prev, lat, lng, name: cleanName }));
    setModalShowSearchResults(false);
    setModalSearchQuery(cleanName);
  };

  // Default new site coordinates to Islamabad, Pakistan
  const [formData, setFormData] = useState<Partial<Site>>({
    name: '',
    lat: 33.6844,
    lng: 73.0479,
    elevation: 0,
    type: 'base-station',
    radioType: 'base',
    txPowerW: 50,
    txFreqMHz: undefined,
    rxFreqMHz: undefined
  });

  const filteredSites = sites.filter(site => {
    const siteName = site.name || '';
    const siteType = site.type || '';
    const matchesSearch = siteName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || siteType === filterType;
    return matchesSearch && matchesType;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name && formData.lat !== undefined && formData.lng !== undefined) {
      if (modalMode === 'add') {
        addSite({
          id: `s${Date.now()}`,
          name: formData.name,
          lat: Number(formData.lat),
          lng: Number(formData.lng),
          elevation: Number(formData.elevation) || 0,
          type: formData.type as any,
          radioType: formData.radioType || 'base',
          txPowerW: Number(formData.txPowerW) || 50,
          txFreqMHz: formData.txFreqMHz ? Number(formData.txFreqMHz) : undefined,
          rxFreqMHz: formData.rxFreqMHz ? Number(formData.rxFreqMHz) : undefined
        });
      } else if (modalMode === 'edit' && formData.id) {
        updateSite({
          id: formData.id,
          name: formData.name,
          lat: Number(formData.lat),
          lng: Number(formData.lng),
          elevation: Number(formData.elevation) || 0,
          type: formData.type as any,
          radioType: formData.radioType || 'base',
          txPowerW: Number(formData.txPowerW) || 0,
          txFreqMHz: formData.txFreqMHz ? Number(formData.txFreqMHz) : undefined,
          rxFreqMHz: formData.rxFreqMHz ? Number(formData.rxFreqMHz) : undefined
        });
      }
      setIsModalOpen(false);
      setFormData({ name: '', lat: 33.6844, lng: 73.0479, elevation: 0, type: 'base-station', radioType: 'base', txPowerW: 50, txFreqMHz: undefined, rxFreqMHz: undefined });
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Sites & Nodes</h2>
          <p className="text-sm text-slate-500">Manage network locations, repeaters, and base stations.</p>
        </div>
        <div className="flex gap-3">
          {sites.length > 0 && (
            <button 
              onClick={() => setIsClearAllConfirmOpen(true)}
              className="px-4 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-semibold rounded shadow-sm transition flex items-center"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Data
            </button>
          )}
          <button 
            onClick={() => {
              setModalMode('add');
              setFormData({ name: '', lat: 33.6844, lng: 73.0479, elevation: 0, type: 'base-station', radioType: 'base', txPowerW: 50, txFreqMHz: undefined, rxFreqMHz: undefined });
              setIsModalOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded shadow-sm hover:bg-blue-700 transition flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Site
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-300 flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search sites..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center text-sm text-slate-600 font-medium">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              Filter by:
            </div>
            <select 
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-sm border border-slate-300 rounded py-1.5 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="base-station">Base Station</option>
              <option value="repeater">Repeater</option>
              <option value="relay">Relay</option>
              <option value="subscriber">Subscriber</option>
              <option value="microwave-node">Microwave Node</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Site Name</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Node Type</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Radio Type & Power</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Coordinates</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Elevation</th>
                <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSites.length > 0 ? (
                filteredSites.map(site => (
                  <tr key={site.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded flex items-center justify-center mr-3 ${
                          site.type === 'repeater' ? 'bg-yellow-100 text-yellow-600' :
                          site.type === 'relay' ? 'bg-orange-100 text-orange-600' :
                          site.type === 'base-station' ? 'bg-blue-100 text-blue-600' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{site.name || 'Unknown Site'}</p>
                          <p className="text-xs text-slate-400 font-mono">{site.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                        site.type === 'repeater' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                        site.type === 'relay' ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                        site.type === 'base-station' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {(site.type || 'unknown').replace('-', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-slate-700 font-medium capitalize">
                        {site.radioType ? site.radioType.replace('-', ' ') : 'N/A'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {site.txPowerW !== undefined ? `${site.txPowerW} W` : '0 W'}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm font-mono text-slate-600">
                      {typeof site.lat === 'number' ? site.lat.toFixed(5) : '0.00000'}, {typeof site.lng === 'number' ? site.lng.toFixed(5) : '0.00000'}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {site.elevation || 0} <span className="text-xs text-slate-400">m AMSL</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => setCurrentView('gis-map')}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="View on Map"
                        >
                          <MapPin className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalMode('edit');
                            setFormData(site);
                            setIsModalOpen(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded" 
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setSiteToDelete(site.id);
                          }}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded" 
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                    <p className="font-medium text-slate-600">No sites found</p>
                    <p className="text-sm">Try adjusting your filters or add a new site.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Site Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800">{modalMode === 'add' ? 'Add New' : 'Edit'} Site/Node</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">&times;</button>
            </div>
            
            <div className="flex flex-1 min-h-[400px]">
              {/* Form Side */}
              <form onSubmit={handleSubmit} className="w-1/2 p-6 flex flex-col gap-4 border-r border-slate-200 overflow-y-auto">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Site Name</label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. ISB-NORTH-01"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type</label>
                    <select 
                      value={formData.type}
                      onChange={e => setFormData({...formData, type: e.target.value as any})}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="base-station">Base Station</option>
                      <option value="repeater">Repeater</option>
                      <option value="relay">Relay</option>
                      <option value="subscriber">Subscriber</option>
                      <option value="microwave-node">Microwave Node</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Elevation (m AMSL)</label>
                    <input 
                      type="number" 
                      required
                      value={formData.elevation}
                      onChange={e => setFormData({...formData, elevation: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Radio Eqpt Type</label>
                    <select 
                      value={formData.radioType || 'base'}
                      onChange={e => {
                        const type = e.target.value as any;
                        let defaultPwr = formData.txPowerW || 50;
                        if (type === 'base') defaultPwr = 50;
                        else if (type === 'vehicular') defaultPwr = 25;
                        else if (type === 'walkie-talkie') defaultPwr = 5;
                        setFormData({...formData, radioType: type, txPowerW: defaultPwr});
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="base">Base Station (High Power)</option>
                      <option value="vehicular">Vehicular (Medium Power)</option>
                      <option value="walkie-talkie">Walkie Talkie (Handheld)</option>
                      <option value="custom">Custom Configuration</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tx Power (Watts)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      required
                      value={formData.txPowerW ?? 50}
                      onChange={e => setFormData({...formData, txPowerW: Number(e.target.value), radioType: 'custom'})}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">TX Freq (MHz)</label>
                    <input 
                      type="number" 
                      step="0.00001"
                      value={formData.txFreqMHz || ''}
                      onChange={e => setFormData({...formData, txFreqMHz: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      placeholder="e.g. 155.5"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">RX Freq (MHz)</label>
                    <input 
                      type="number" 
                      step="0.00001"
                      value={formData.rxFreqMHz || ''}
                      onChange={e => setFormData({...formData, rxFreqMHz: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      placeholder="e.g. 155.5"
                    />
                  </div>
                </div>

                <div className="bg-blue-50 p-3 rounded border border-blue-100 text-xs text-blue-700 font-medium mb-2">
                  <span className="font-bold uppercase tracking-wider block mb-1">Location Coordinates</span>
                  You can type coordinates manually or click anywhere on the map to set the location automatically.
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Latitude</label>
                    <input 
                      type="number" 
                      step="0.000001"
                      required
                      value={formData.lat}
                      onChange={e => setFormData({...formData, lat: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Longitude</label>
                    <input 
                      type="number" 
                      step="0.000001"
                      required
                      value={formData.lng}
                      onChange={e => setFormData({...formData, lng: Number(e.target.value)})}
                      className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                  </div>
                </div>

                <div className="mt-auto pt-6 flex justify-end gap-3">
                  <button 
                    type="button" 
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Save Site
                  </button>
                </div>
              </form>

              {/* Map Side */}
              <div className="w-1/2 bg-slate-100 relative">
                
                {/* Search Bar Overlay */}
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur border border-slate-200 rounded-lg z-[1000] shadow-md w-80">
                  <form onSubmit={handleModalSearch} className="flex items-center p-1">
                    <input 
                      type="text" 
                      placeholder="Search city, location, or coords..." 
                      value={modalSearchQuery}
                      onChange={(e) => {
                        const val = e.target.value;
                        setModalSearchQuery(val);
                        if (val.trim().length >= 2) {
                          const offlineMatches = searchOfflineLocations(val);
                          if (offlineMatches.length > 0) {
                            setModalSearchResults(offlineMatches.map(m => ({
                              display_name: m.displayName,
                              lat: m.lat,
                              lon: m.lng
                            })));
                            setModalShowSearchResults(true);
                          } else {
                            setModalShowSearchResults(false);
                          }
                        } else {
                          setModalShowSearchResults(false);
                        }
                      }}
                      className="w-full text-sm p-2 outline-none bg-transparent"
                    />
                    <button type="submit" className="p-2 text-slate-500 hover:text-blue-600 transition" disabled={modalIsSearching}>
                      {modalIsSearching ? <Activity className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  </form>
                  
                  {/* Search Results Dropdown */}
                  {modalShowSearchResults && modalSearchResults.length > 0 && (
                    <div className="border-t border-slate-100 max-h-64 overflow-y-auto">
                      {modalSearchResults.map((result, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectModalSearchResult(result)}
                          className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 border-b border-slate-50 last:border-0 truncate flex items-start"
                        >
                          <MapPin className="w-3 h-3 mr-2 mt-0.5 text-slate-400 flex-shrink-0" />
                          <span className="text-slate-700">{result.display_name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {modalShowSearchResults && modalSearchResults.length === 0 && !modalIsSearching && (
                    <div className="border-t border-slate-100 p-3 text-xs text-slate-500 text-center">
                      No locations found
                    </div>
                  )}
                </div>

                <MapContainer 
                  center={[formData.lat || 33.6844, formData.lng || 73.0479]} 
                  zoom={12} 
                  className="w-full h-full absolute inset-0 z-0"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    maxZoom={19}
                  />
                  <LocationPicker 
                    lat={formData.lat || 33.6844} 
                    lng={formData.lng || 73.0479} 
                    onChange={(lat, lng) => setFormData(prev => ({ ...prev, lat, lng }))} 
                  />
                  <MapFlyTo position={searchedPosition} />
                </MapContainer>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Delete Confirmation Modal */}
      {siteToDelete && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6">
            <h3 className="font-bold text-slate-800 text-lg mb-2">Delete Site?</h3>
            <p className="text-slate-600 mb-6 text-sm">
              Are you sure you want to delete this site? Any RF Links connected to this site will also be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setSiteToDelete(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-500 rounded hover:bg-rose-600"
              >
                Delete Site
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Clear All Data Modal */}
      {isClearAllConfirmOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col p-6 border-t-4 border-rose-500">
            <h3 className="font-bold text-slate-800 text-lg mb-2 flex items-center">
              <AlertTriangle className="w-5 h-5 text-rose-500 mr-2" />
              Wipe Network Data?
            </h3>
            <p className="text-slate-600 mb-6 text-sm">
              This will permanently delete all Sites, Nodes, and RF Links from the current workspace. This action cannot be undone. Are you sure?
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsClearAllConfirmOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  clearAllSites();
                  setIsClearAllConfirmOpen(false);
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-rose-600 rounded hover:bg-rose-700"
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
