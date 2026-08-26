import React, { useState, useMemo, useRef } from 'react';
import {
  Download,
  X,
  Layers,
  MapPin,
  Globe,
  CheckCircle,
  AlertCircle,
  Clock,
  Sparkles,
  Database,
  ArrowRight,
  Mountain,
  FileText,
  Package,
} from 'lucide-react';
import {
  downloadOfflineMapBundle,
  calculateTileCount,
  getPlacesInBounds,
  type DownloadArea,
  type DownloadProgress,
} from '../gis/mapDownloader';
import { ONLINE_MAP_LAYERS } from '../gis/mapLayers';
import { cn } from '../lib/utils';

interface MapDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  onApplyToOfflineEngine?: (count: number, labelName: string, tileBlobs: Map<string, Blob>) => void;
}

export function MapDownloadModal({
  isOpen,
  onClose,
  currentBounds,
  onApplyToOfflineEngine,
}: MapDownloadModalProps) {
  const [areaName, setAreaName] = useState('Pakistan (National Coverage)');
  const [exportFormat, setExportFormat] = useState<'pmtiles' | 'zip'>('pmtiles');
  const [selectedLayerType, setSelectedLayerType] = useState<
    'satellite' | 'street' | 'topo' | 'both'
  >('both');

  // Bounds (Default to all Pakistan)
  const [bounds, setBounds] = useState<{
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }>(() => {
    if (currentBounds) return currentBounds;
    // Default to All Pakistan
    return {
      minLat: 23.5,
      maxLat: 37.2,
      minLng: 60.8,
      maxLng: 77.8,
    };
  });

  // Zoom Levels (for national map, Z4-Z9 is optimal)
  const [minZoom, setMinZoom] = useState<number>(4);
  const [maxZoom, setMaxZoom] = useState<number>(9);

  // Bundling Options
  const [includePlaces, setIncludePlaces] = useState<boolean>(true);
  const [includeTerrain, setIncludeTerrain] = useState<boolean>(true);

  // Auto Load into offline engine
  const [autoLoad, setAutoLoad] = useState<boolean>(true);

  // Download State
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadResult, setDownloadResult] = useState<{
    fileName: string;
    url: string;
    tileCount: number;
    placesCount: number;
  } | null>(null);
  const [error, setError] = useState<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);

  // Layer IDs
  const activeLayerIds = useMemo(() => {
    switch (selectedLayerType) {
      case 'satellite':
        return ['esri-satellite'];
      case 'street':
        return ['carto-voyager'];
      case 'topo':
        return ['esri-topo'];
      case 'both':
      default:
        return ['esri-satellite', 'carto-voyager'];
    }
  }, [selectedLayerType]);

  const downloadAreaConfig: DownloadArea = useMemo(
    () => ({
      name: areaName,
      minLat: bounds.minLat,
      maxLat: bounds.maxLat,
      minLng: bounds.minLng,
      maxLng: bounds.maxLng,
      minZoom,
      maxZoom,
      layerIds: activeLayerIds,
      exportFormat,
      includePlacesData: includePlaces,
      includeTerrainData: includeTerrain,
    }),
    [areaName, bounds, minZoom, maxZoom, activeLayerIds, exportFormat, includePlaces, includeTerrain]
  );

  const estimatedTileCount = useMemo(() => {
    return calculateTileCount(downloadAreaConfig);
  }, [downloadAreaConfig]);

  const estimatedSizeMb = useMemo(() => {
    return ((estimatedTileCount * 25) / 1024).toFixed(1);
  }, [estimatedTileCount]);

  const matchingPlaces = useMemo(() => {
    return getPlacesInBounds(bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng);
  }, [bounds]);

  // Preset Area Selector
  const handleSelectPreset = (
    name: string,
    b: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    defaultMinZ = 5,
    defaultMaxZ = 10
  ) => {
    setAreaName(name);
    setBounds(b);
    setMinZoom(defaultMinZ);
    setMaxZoom(defaultMaxZ);
  };

  const handleStartDownload = async () => {
    if (estimatedTileCount > 6000) {
      if (
        !confirm(
          `You are about to download ${estimatedTileCount.toLocaleString()} tiles (~${estimatedSizeMb} MB). This may take several minutes. Do you wish to proceed?`
        )
      ) {
        return;
      }
    }

    setError('');
    setIsDownloading(true);
    setDownloadResult(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await downloadOfflineMapBundle(
        downloadAreaConfig,
        (p) => setProgress(p),
        controller.signal
      );

      const downloadUrl = URL.createObjectURL(result.blob);
      setDownloadResult({
        fileName: result.fileName,
        url: downloadUrl,
        tileCount: result.tileBlobsMap.size,
        placesCount: result.placesCount,
      });

      // Auto trigger browser download
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = result.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Auto load into offline engine
      if (autoLoad && onApplyToOfflineEngine) {
        onApplyToOfflineEngine(
          result.tileBlobsMap.size,
          `${areaName} (${result.tileBlobsMap.size} tiles + ${result.placesCount} places)`,
          result.tileBlobsMap
        );
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Download encountered an error');
      }
    } finally {
      setIsDownloading(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    abortControllerRef.current?.abort();
    setIsDownloading(false);
    setProgress(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-3 sm:p-6 select-none animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <span>Download Offline Map & Pakistan Data</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  🇵🇰 Pakistan Ready
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Package Satellite, Street tiles, Places Gazetteer & DEM terrain elevation data
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 text-lg font-bold transition"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Quick Preset Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5 flex items-center justify-between">
              <span>Select Region Preset</span>
              <span className="text-blue-600 dark:text-blue-400 font-normal">
                {matchingPlaces.length} Pakistani Places Covered
              </span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              {/* Entire Pakistan */}
              <button
                type="button"
                onClick={() =>
                  handleSelectPreset(
                    'Pakistan (All Regions)',
                    { minLat: 23.5, maxLat: 37.2, minLng: 60.8, maxLng: 77.8 },
                    4,
                    8
                  )
                }
                className={cn(
                  'p-2.5 border rounded-xl font-bold text-left transition',
                  areaName.includes('All Regions')
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20'
                    : 'hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20'
                )}
              >
                <div className="flex items-center justify-between">
                  <span>🇵🇰 All Pakistan</span>
                  <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.5 rounded font-mono">
                    NATIONAL
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  Complete Country & Borders
                </div>
              </button>

              {/* Punjab & Capital */}
              <button
                type="button"
                onClick={() =>
                  handleSelectPreset(
                    'Punjab & Islamabad Region',
                    { minLat: 28.5, maxLat: 34.2, minLng: 69.8, maxLng: 75.6 },
                    6,
                    10
                  )
                }
                className={cn(
                  'p-2.5 border rounded-xl font-bold text-left transition',
                  areaName.includes('Punjab')
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                    : 'hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'
                )}
              >
                <div>🏛️ Punjab & ICT</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  ISB, RWP, LHR, Multan, PAC
                </div>
              </button>

              {/* Sindh & Coast */}
              <button
                type="button"
                onClick={() =>
                  handleSelectPreset(
                    'Sindh & Coastal Bases',
                    { minLat: 23.6, maxLat: 28.6, minLng: 66.5, maxLng: 71.3 },
                    6,
                    10
                  )
                }
                className={cn(
                  'p-2.5 border rounded-xl font-bold text-left transition',
                  areaName.includes('Sindh')
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                    : 'hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'
                )}
              >
                <div>⚓ Sindh & Ports</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  Karachi, Hyd, Sukkur, PNS
                </div>
              </button>

              {/* KPK & Valleys */}
              <button
                type="button"
                onClick={() =>
                  handleSelectPreset(
                    'KPK & Northern Frontier',
                    { minLat: 31.2, maxLat: 36.9, minLng: 69.3, maxLng: 74.2 },
                    6,
                    10
                  )
                }
                className={cn(
                  'p-2.5 border rounded-xl font-bold text-left transition',
                  areaName.includes('KPK')
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                    : 'hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'
                )}
              >
                <div>🏔️ KPK & Valleys</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  Peshawar, Swat, Passes
                </div>
              </button>

              {/* Balochistan & Coast */}
              <button
                type="button"
                onClick={() =>
                  handleSelectPreset(
                    'Balochistan & Gwadar Coastal',
                    { minLat: 24.8, maxLat: 32.2, minLng: 60.8, maxLng: 70.4 },
                    5,
                    9
                  )
                }
                className={cn(
                  'p-2.5 border rounded-xl font-bold text-left transition',
                  areaName.includes('Balochistan')
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                    : 'hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'
                )}
              >
                <div>🏜️ Balochistan / Gwadar</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  Quetta, Gwadar, Ormara
                </div>
              </button>

              {/* Gilgit-Baltistan & AJK */}
              <button
                type="button"
                onClick={() =>
                  handleSelectPreset(
                    'Gilgit-Baltistan & Kashmir High Peaks',
                    { minLat: 33.0, maxLat: 37.2, minLng: 73.0, maxLng: 77.8 },
                    6,
                    10
                  )
                }
                className={cn(
                  'p-2.5 border rounded-xl font-bold text-left transition',
                  areaName.includes('Gilgit')
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                    : 'hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/20'
                )}
              >
                <div>🏔️ GB & Kashmir</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                  K2, Skardu, Gilgit, AJK
                </div>
              </button>
            </div>
          </div>

          {/* Layer Selection (Satellite vs Street vs Both) */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
              Map Imagery Layers
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedLayerType('both')}
                className={cn(
                  'p-3 border rounded-xl font-bold text-left flex flex-col justify-between transition',
                  selectedLayerType === 'both'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm">🌐 Bundle</span>
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                </div>
                <div className="mt-2 text-[11px] font-semibold">Both Satellite & Street</div>
                <div className="text-[9px] text-slate-400 font-normal">Complete Package</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLayerType('satellite')}
                className={cn(
                  'p-3 border rounded-xl font-bold text-left flex flex-col justify-between transition',
                  selectedLayerType === 'satellite'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <span className="text-sm">🛰️ Satellite</span>
                <div className="mt-2 text-[11px] font-semibold">Satellite + English</div>
                <div className="text-[9px] text-slate-400 font-normal">ESRI High-Res</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLayerType('street')}
                className={cn(
                  'p-3 border rounded-xl font-bold text-left flex flex-col justify-between transition',
                  selectedLayerType === 'street'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <span className="text-sm">🗺️ Street Map</span>
                <div className="mt-2 text-[11px] font-semibold">English Voyager</div>
                <div className="text-[9px] text-slate-400 font-normal">Roads & Urban Areas</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedLayerType('topo')}
                className={cn(
                  'p-3 border rounded-xl font-bold text-left flex flex-col justify-between transition',
                  selectedLayerType === 'topo'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <span className="text-sm">🏔️ Topo Relief</span>
                <div className="mt-2 text-[11px] font-semibold">Topographic Map</div>
                <div className="text-[9px] text-slate-400 font-normal">Contours & Ridges</div>
              </button>
            </div>
          </div>

          {/* Pakistan Data & DEM Terrain Bundling Checkboxes */}
          <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl space-y-2 text-xs">
            <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Offline Pakistan GIS & Elevation Data Bundling</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <label className="flex items-start gap-2 cursor-pointer bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                <input
                  type="checkbox"
                  checked={includePlaces}
                  onChange={(e) => setIncludePlaces(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-emerald-600 rounded"
                />
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-100">
                    Pakistan Places Gazetteer
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Bundles {matchingPlaces.length} places (names, coordinates, military bases, mountain
                    tops) in JSON & GeoJSON format
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-2 cursor-pointer bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                <input
                  type="checkbox"
                  checked={includeTerrain}
                  onChange={(e) => setIncludeTerrain(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-emerald-600 rounded"
                />
                <div>
                  <div className="font-bold text-slate-800 dark:text-slate-100">
                    DEM Terrain Elevation Data
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    Bundles sampled SRTM elevation grid matrix for 100% offline Real LOS Profiling
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Bounding Box Coordinates */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Bounding Box Coordinates
              </span>
              <span className="text-[10px] text-slate-400 font-mono">WGS84 Lat/Lng</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
              <div>
                <label className="text-[10px] text-slate-400 block">Min Lat (°N)</label>
                <input
                  type="number"
                  step="0.01"
                  value={bounds.minLat}
                  onChange={(e) => setBounds({ ...bounds, minLat: Number(e.target.value) })}
                  className="w-full p-1.5 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Max Lat (°N)</label>
                <input
                  type="number"
                  step="0.01"
                  value={bounds.maxLat}
                  onChange={(e) => setBounds({ ...bounds, maxLat: Number(e.target.value) })}
                  className="w-full p-1.5 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Min Lng (°E)</label>
                <input
                  type="number"
                  step="0.01"
                  value={bounds.minLng}
                  onChange={(e) => setBounds({ ...bounds, minLng: Number(e.target.value) })}
                  className="w-full p-1.5 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block">Max Lng (°E)</label>
                <input
                  type="number"
                  step="0.01"
                  value={bounds.maxLng}
                  onChange={(e) => setBounds({ ...bounds, maxLng: Number(e.target.value) })}
                  className="w-full p-1.5 border rounded-lg bg-white dark:bg-slate-800 text-xs font-bold"
                />
              </div>
            </div>
          </div>

          {/* Zoom Range */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-200">Min Zoom Level</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  Z{minZoom}
                </span>
              </div>
              <input
                type="range"
                min="4"
                max={maxZoom}
                value={minZoom}
                onChange={(e) => setMinZoom(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                <span>Z4 (National Overview)</span>
                <span>Z8 (Regional View)</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-200">Max Zoom Level</span>
                <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                  Z{maxZoom}
                </span>
              </div>
              <input
                type="range"
                min={minZoom}
                max="14"
                value={maxZoom}
                onChange={(e) => setMaxZoom(Number(e.target.value))}
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                <span>Z8 (Province)</span>
                <span>Z12 (City & Roads)</span>
              </div>
            </div>
          </div>

          {/* Export File Format Selection (PMTiles vs ZIP) */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5">
              Export File Format
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setExportFormat('pmtiles')}
                className={cn(
                  'p-3 border rounded-xl font-bold text-left flex items-start gap-2.5 transition',
                  exportFormat === 'pmtiles'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <div className="p-1.5 bg-blue-600/10 text-blue-600 rounded-lg shrink-0 mt-0.5">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <span>📦 PMTiles Archive (.pmtiles)</span>
                    <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-mono">
                      NATIVE
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                    Single-file binary GIS archive with Hilbert spatial indexing.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('zip')}
                className={cn(
                  'p-3 border rounded-xl font-bold text-left flex items-start gap-2.5 transition',
                  exportFormat === 'zip'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 ring-2 ring-blue-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                )}
              >
                <div className="p-1.5 bg-emerald-600/10 text-emerald-600 rounded-lg shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold">🗜️ ZIP Bundle (.zip)</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-normal mt-0.5">
                    Includes raw z/x/y tile files, Places GeoJSON & DEM elevation grid.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Download Size Summary Card */}
          <div className="p-4 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 flex items-center justify-between text-xs">
            <div>
              <div className="font-bold text-blue-950 dark:text-blue-200">
                Package Estimate: <b>{estimatedTileCount.toLocaleString()} tiles</b> +{' '}
                <b>{matchingPlaces.length} Pakistani Places</b>
              </div>
              <div className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                Archive size: <b>~{estimatedSizeMb} MB</b> ({activeLayerIds.length} layer(s) + Places
                GeoJSON + DEM Terrain)
              </div>
            </div>
            <label className="flex items-center gap-2 font-bold text-blue-800 dark:text-blue-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoLoad}
                onChange={(e) => setAutoLoad(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span>Auto-load in Offline Map</span>
            </label>
          </div>

          {/* Active Download Progress Bar */}
          {isDownloading && progress && (
            <div className="p-4 rounded-xl bg-slate-900 text-white border border-slate-800 space-y-2 animate-in fade-in">
              <div className="flex justify-between items-center text-xs font-bold">
                <span className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-400 animate-bounce" />
                  {progress.stepDescription || `Downloading Zoom ${progress.currentZoom} Tiles...`}
                </span>
                <span className="font-mono text-emerald-400">{progress.percent}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all duration-150"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                <span>
                  {progress.completedTiles.toLocaleString()} / {progress.totalTiles.toLocaleString()}{' '}
                  tiles fetched
                </span>
                {progress.failedTiles > 0 && (
                  <span className="text-amber-400">({progress.failedTiles} retried)</span>
                )}
              </div>
            </div>
          )}

          {/* Success State */}
          {downloadResult && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold">Pakistan Offline Map Bundle Ready!</div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Saved <b>{downloadResult.fileName}</b> ({downloadResult.tileCount.toLocaleString()}{' '}
                    tiles + {downloadResult.placesCount} places gazetteer + DEM terrain)
                  </div>
                </div>
              </div>
              <a
                href={downloadResult.url}
                download={downloadResult.fileName}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-xs"
              >
                Re-Download
              </a>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            Full Offline Gazetteer & Terrain DEM Included
          </div>
          <div className="flex gap-2">
            {isDownloading ? (
              <button
                type="button"
                onClick={handleCancelDownload}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs transition"
              >
                Cancel Download
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleStartDownload}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-xs transition"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Bundle (~{estimatedSizeMb} MB)</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
