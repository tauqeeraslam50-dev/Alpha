import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl, { type Map as MapLibreMap, type Marker as MapLibreMarker } from 'maplibre-gl';
import { Protocol, PMTiles, FileSource, type Header } from 'pmtiles';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  FolderOpen,
  Upload,
  Layers,
  MapPin,
  Compass,
  Ruler,
  Maximize2,
  Info,
  Radio,
  FileCheck,
  AlertCircle,
  Eye,
  Sliders,
  Sparkles,
  Trash2,
  RotateCcw,
  Activity,
  ArrowRight,
  X,
  Wifi,
  WifiOff,
  Zap,
  Cable,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Mountain,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { MapSearchBar } from './MapSearchBar';
import { calculateDistanceKm, calculateBearing, calculateFSPL } from '../lib/utils';
import { analyzeLOS, type LOSAnalysisResult } from '../lib/losUtils';
import { PAKISTAN_CITIES } from '../lib/pakistanCitiesData';
import { cn } from '../lib/utils';
import { Site, RFLink } from '../types';

// Register PMTiles Protocol globally
const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);

import {
  getOfflineTileBlob,
  restoreOfflineTilesFromStore,
  importOfflineZipArchive,
  clearAllOfflineTiles,
  memoryTileCache,
  saveTilesToOfflineStore,
} from '../gis/offlineTileStore';

let isCustomPngProtocolRegistered = false;

if (!isCustomPngProtocolRegistered) {
  maplibregl.addProtocol('uploaded-png', async (params) => {
    const url = new URL(params.url);
    const z = parseInt(url.searchParams.get('z') || '0', 10);
    const x = parseInt(url.searchParams.get('x') || '0', 10);
    const y = parseInt(url.searchParams.get('y') || '0', 10);
    const layer = url.searchParams.get('layer') || '';

    // 1. Direct match in memory cache / IndexedDB
    const foundBlob = await getOfflineTileBlob(z, x, y, layer);
    if (foundBlob) {
      const buffer = await foundBlob.arrayBuffer();
      return { data: new Uint8Array(buffer) };
    }

    // 2. Direct match in bundled public tiles
    const bundledPaths = [
      `./tiles/${z}/${x}/${y}.png`,
      `/tiles/${z}/${x}/${y}.png`,
      `tiles/${z}/${x}/${y}.png`,
    ];
    for (const p of bundledPaths) {
      try {
        const res = await fetch(p);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          return { data: new Uint8Array(buffer) };
        }
      } catch {}
    }

    // 3. Seamless Parent Tile Fallback (if zooming beyond maxzoom)
    let pZ = z;
    let pX = x;
    let pY = y;
    while (pZ > 4) {
      pZ -= 1;
      pX = Math.floor(pX / 2);
      pY = Math.floor(pY / 2);

      const parentBlob = await getOfflineTileBlob(pZ, pX, pY, layer);
      if (parentBlob) {
        const buffer = await parentBlob.arrayBuffer();
        return { data: new Uint8Array(buffer) };
      }

      const parentBundled = [
        `./tiles/${pZ}/${pX}/${pY}.png`,
        `/tiles/${pZ}/${pX}/${pY}.png`,
        `tiles/${pZ}/${pX}/${pY}.png`,
      ];
      for (const p of parentBundled) {
        try {
          const res = await fetch(p);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            return { data: new Uint8Array(buffer) };
          }
        } catch {}
      }
    }

    // Throw error so MapLibre knows tile is missing and cleanly keeps parent tile
    throw new Error(`Tile not found: ${z}/${x}/${y}`);
  });
  isCustomPngProtocolRegistered = true;
}

// Clean and format valid URI for Electron protocol handlers
function formatLocalPmtilesUrl(filePath: string): string {
  const clean = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `local-pmtiles://pmtiles/${clean}`;
}

function formatPmtilesProtocolUrl(filePath: string): string {
  const clean = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `pmtiles://local-pmtiles://pmtiles/${clean}`;
}

function formatLocalTileTemplate(folder: string): string {
  const clean = folder.replace(/\\/g, '/').replace(/^\/+/, '');
  return `local-map://tiles/tile?root=${encodeURIComponent(clean)}&z={z}&x={x}&y={y}`;
}

const isRasterType = (tileType: number) => [1, 2, 3, 4, 5].includes(tileType);

type OfflineFile = { name: string; path: string; relative: string; size: number; extension: string };

function toDMS(val: number, isLat: boolean): string {
  const abs = Math.abs(val);
  const deg = Math.floor(abs);
  const min = Math.floor((abs - deg) * 60);
  const sec = ((abs - deg - min / 60) * 3600).toFixed(1);
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
  return `${deg}°${min}'${sec}" ${dir}`;
}

export function OfflineMapEngine({
  onStatus,
  onSwitchToOnline,
}: {
  onStatus?: (status: string) => void;
  onSwitchToOnline?: () => void;
}) {
  const { sites, links, addLink, removeLink, theme, setCurrentView } = useAppContext();
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | undefined>(undefined);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const linkMarkersRef = useRef<MapLibreMarker[]>([]);
  const liveWireMarkersRef = useRef<MapLibreMarker[]>([]);
  const targetMarkerRef = useRef<MapLibreMarker | null>(null);

  // File Inputs
  const pmtilesInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Persistent State
  const [filePath, setFilePathState] = useState<string>(() => {
    return localStorage.getItem('rnms_offline_file_path') || '';
  });
  const [activeFileSource, setActiveFileSourceState] = useState<
    'embedded' | 'electron-file' | 'web-file' | 'electron-folder' | 'web-folder' | 'none'
  >(() => {
    const saved = localStorage.getItem('rnms_offline_active_source') as any;
    return saved || 'embedded';
  });
  const [activeFileName, setActiveFileNameState] = useState<string>(() => {
    return (
      localStorage.getItem('rnms_offline_file_name') ||
      'Pakistan National Map (Built-in Offline)'
    );
  });
  const [mapFolder, setMapFolderState] = useState<string>(() => {
    return localStorage.getItem('rnms_offline_map_folder') || '';
  });
  const [rasterOpacity, setRasterOpacityState] = useState<number>(() => {
    const saved = localStorage.getItem('rnms_offline_raster_opacity');
    return saved ? parseFloat(saved) : 1.0;
  });

  const [files, setFiles] = useState<OfflineFile[]>([]);
  const [uploadedTileCount, setUploadedTileCount] = useState<number>(0);
  const [headerInfo, setHeaderInfo] = useState<Header | null>(null);
  const [offlineStyle, setOfflineStyle] = useState<'satellite' | 'street'>('street');
  const [error, setError] = useState<string>('');

  // Tool toggles
  const [showSites, setShowSites] = useState<boolean>(true);
  const [showPlaces, setShowPlaces] = useState<boolean>(true);
  const [showLinks, setShowLinks] = useState<boolean>(true);
  const [showLinkMetrics, setShowLinkMetrics] = useState<boolean>(true);
  const [selectedLinkInfo, setSelectedLinkInfo] = useState<{
    link: RFLink;
    source: Site;
    target: Site;
    distanceKm: number;
    snr: number;
    rsl: number;
    fspl: number;
    diffractionLossDB: number;
    status: 'CLEAR' | 'MARGINAL' | 'TERRAIN BLOCKED' | 'OFFLINE';
    color: string;
    bearingAtoB: number;
    bearingBtoA: number;
    losResult: LOSAnalysisResult;
    isTerrainBlocked: boolean;
  } | null>(null);

  // Cisco Packet Tracer Link Wiring Mode State
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectingSource, setConnectingSource] = useState<Site | null>(null);
  const [connectToast, setConnectToast] = useState<string | null>(null);

  // Cisco Packet Tracer Site-to-Site click handler
  const handleSiteClickForConnection = (clickedSite: Site) => {
    if (!isConnecting) return;

    if (!connectingSource) {
      setConnectingSource(clickedSite);
      setConnectToast(`🔌 Source: ${clickedSite.name} selected. Now click Target Station.`);
    } else {
      if (connectingSource.id === clickedSite.id) {
        setConnectToast(`⚠️ Cannot connect a station to itself.`);
        return;
      }

      // Check if link already exists
      const existing = links.find(
        (l) =>
          (l.sourceSiteId === connectingSource.id && l.targetSiteId === clickedSite.id) ||
          (l.sourceSiteId === clickedSite.id && l.targetSiteId === connectingSource.id)
      );

      if (existing) {
        setConnectToast(`⚠️ Link already exists between ${connectingSource.name} and ${clickedSite.name}.`);
        setConnectingSource(null);
        setIsConnecting(false);
        return;
      }

      // Create new link
      const distanceKm = calculateDistanceKm(
        connectingSource.lat,
        connectingSource.lng,
        clickedSite.lat,
        clickedSite.lng
      );
      const freqMHz = connectingSource.txFreqMHz || clickedSite.txFreqMHz || 435.0;
      const txPower = connectingSource.txPowerW
        ? Number((10 * Math.log10(connectingSource.txPowerW * 1000)).toFixed(1))
        : 43;

      const newLink: RFLink = {
        id: `link-${Date.now()}`,
        sourceSiteId: connectingSource.id,
        targetSiteId: clickedSite.id,
        equipmentId: null,
        distanceKm: Number(distanceKm.toFixed(2)),
        frequencyMHz: freqMHz,
        txPowerDBm: txPower,
        txAntennaGainDBi: 6,
        rxAntennaGainDBi: 6,
        txCableLossDB: 1.5,
        rxCableLossDB: 1.5,
        fadeMarginDB: 15,
      };

      addLink(newLink);
      setConnectToast(
        `✅ RF Link Established: ${connectingSource.name} ➔ ${clickedSite.name} (${distanceKm.toFixed(1)} km)`
      );
      setConnectingSource(null);
      setIsConnecting(false);
    }
  };
  const [showCoverageRings, setShowCoverageRings] = useState<boolean>(false);
  const [coverageRadiusKm, setCoverageRadiusKm] = useState<number>(25);
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<[number, number][]>([]);
  const [mouseCoords, setMouseCoords] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [showInspector, setShowInspector] = useState<boolean>(false);
  const [activeSearchPin, setActiveSearchPin] = useState<{
    lat: number;
    lng: number;
    name: string;
    category?: string;
  } | null>(null);

  const isElectron = Boolean(window.rnmsOffline?.isElectron || window.rnmsOffline?.selectMapFolder);

  // Setters with persistent storage
  const setFilePath = (p: string) => {
    setFilePathState(p);
    localStorage.setItem('rnms_offline_file_path', p);
  };
  const setActiveFileSource = (
    s: 'embedded' | 'electron-file' | 'web-file' | 'electron-folder' | 'web-folder' | 'none'
  ) => {
    setActiveFileSourceState(s);
    localStorage.setItem('rnms_offline_active_source', s);
  };
  const setActiveFileName = (n: string) => {
    setActiveFileNameState(n);
    localStorage.setItem('rnms_offline_file_name', n);
  };
  const setMapFolder = (f: string) => {
    setMapFolderState(f);
    localStorage.setItem('rnms_offline_map_folder', f);
  };
  const setRasterOpacity = (op: number) => {
    setRasterOpacityState(op);
    localStorage.setItem('rnms_offline_raster_opacity', String(op));
  };

  // Initialize MapLibre
  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: container.current,
      center: [69.3451, 30.3753],
      zoom: 5,
      minZoom: 2,
      maxZoom: 22,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': theme === 'light' ? '#e2e8f0' : '#0f172a',
            },
          },
        ],
      },
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: 'metric' }), 'bottom-left');

    map.on('mousemove', (e) => {
      setMouseCoords({
        lat: e.lngLat.lat,
        lng: e.lngLat.lng,
        zoom: map.getZoom(),
      });
      onStatus?.(
        `${e.lngLat.lat.toFixed(5)}° N, ${e.lngLat.lng.toFixed(5)}° E  |  Zoom ${map
          .getZoom()
          .toFixed(1)}  |  ${toDMS(e.lngLat.lat, true)}, ${toDMS(e.lngLat.lng, false)}`
      );
    });

    map.on('error', (e) => {
      if (e.error?.message && !e.error.message.includes('404')) {
        setError(e.error.message);
      }
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = undefined;
    };
  }, [onStatus, theme]);

  // Update Background color on theme change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer('background')) {
      map.setPaintProperty('background', 'background-color', theme === 'light' ? '#e2e8f0' : '#0f172a');
    }
  }, [theme]);

  // Clean and render Vector & Raster PMTiles
  const applyPMTilesArchive = useCallback(
    async (sourceUrl: string, pmtilesInstance: PMTiles, labelName: string) => {
      const map = mapRef.current;
      if (!map) return;

      if (!map.isStyleLoaded()) {
        map.once('load', () => {
          void applyPMTilesArchive(sourceUrl, pmtilesInstance, labelName);
        });
        return;
      }

      setError('');
      onStatus?.(`Reading ${labelName} metadata…`);

      try {
        const header = await pmtilesInstance.getHeader();
        setHeaderInfo(header);

        const sourceId = 'rnms-offline-pmtiles';

        // Clear existing custom layers and source
        const existingLayers = map.getStyle().layers || [];
        for (const l of existingLayers) {
          if (l.id !== 'background' && !l.id.startsWith('measure-') && !l.id.startsWith('coverage-')) {
            map.removeLayer(l.id);
          }
        }
        if (map.getSource(sourceId)) {
          map.removeSource(sourceId);
        }

        const isRaster = isRasterType(header.tileType);

        if (isRaster) {
          map.addSource(sourceId, {
            type: 'raster',
            url: sourceUrl,
            tileSize: 256,
            minzoom: header.minZoom || 0,
            maxzoom: header.maxZoom || 14,
          });
          map.addLayer({
            id: 'rnms-offline-raster',
            type: 'raster',
            source: sourceId,
            paint: {
              'raster-opacity': rasterOpacity,
              'raster-resampling': 'linear',
              'raster-fade-duration': 0,
            },
          });
        } else {
          // Vector PMTiles
          map.addSource(sourceId, {
            type: 'vector',
            url: sourceUrl,
          });

          const metadata: any = await pmtilesInstance.getMetadata();
          const vectorLayers: Array<{ id: string }> = Array.isArray(metadata?.vector_layers)
            ? metadata.vector_layers
            : [];

          const colorPalette = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#64748b'];

          vectorLayers.forEach((layer, i) => {
            const cleanId = String(layer.id).replace(/[^a-zA-Z0-9_-]/g, '_');
            const lIdLower = layer.id.toLowerCase();

            // Water
            if (lIdLower.includes('water')) {
              map.addLayer({
                id: `rnms-fill-${cleanId}`,
                type: 'fill',
                source: sourceId,
                'source-layer': layer.id,
                paint: { 'fill-color': '#60a5fa', 'fill-opacity': 0.45 },
              });
              map.addLayer({
                id: `rnms-line-${cleanId}`,
                type: 'line',
                source: sourceId,
                'source-layer': layer.id,
                paint: { 'line-color': '#2563eb', 'line-width': 1.2 },
              });
            }
            // Landcover / Greenery
            else if (
              lIdLower.includes('land') ||
              lIdLower.includes('park') ||
              lIdLower.includes('green')
            ) {
              map.addLayer({
                id: `rnms-fill-${cleanId}`,
                type: 'fill',
                source: sourceId,
                'source-layer': layer.id,
                paint: { 'fill-color': '#34d399', 'fill-opacity': 0.2 },
              });
            }
            // Roads
            else if (
              lIdLower.includes('road') ||
              lIdLower.includes('transport') ||
              lIdLower.includes('highway')
            ) {
              map.addLayer({
                id: `rnms-line-${cleanId}`,
                type: 'line',
                source: sourceId,
                'source-layer': layer.id,
                paint: {
                  'line-color': theme === 'light' ? '#475569' : '#94a3b8',
                  'line-width': lIdLower.includes('motorway') || lIdLower.includes('primary') ? 2 : 1,
                },
              });
            }
            // Buildings
            else if (lIdLower.includes('building') || lIdLower.includes('structure')) {
              map.addLayer({
                id: `rnms-fill-${cleanId}`,
                type: 'fill',
                source: sourceId,
                'source-layer': layer.id,
                paint: { 'fill-color': '#94a3b8', 'fill-opacity': 0.35 },
              });
            }
            // Fallback
            else {
              const color = colorPalette[i % colorPalette.length];
              map.addLayer({
                id: `rnms-fill-${cleanId}`,
                type: 'fill',
                source: sourceId,
                'source-layer': layer.id,
                paint: { 'fill-color': color, 'fill-opacity': 0.25 },
              });
              map.addLayer({
                id: `rnms-line-${cleanId}`,
                type: 'line',
                source: sourceId,
                'source-layer': layer.id,
                paint: { 'line-color': color, 'line-width': 1 },
              });
            }
          });
        }

        // Fit Bounds
        if (header.minLon && header.maxLon && header.minLon !== header.maxLon) {
          const bounds: [[number, number], [number, number]] = [
            [header.minLon, header.minLat],
            [header.maxLon, header.maxLat],
          ];
          map.fitBounds(bounds, { padding: 40, duration: 600, maxZoom: Math.min(header.maxZoom, 14) });
        }

        setActiveFileName(labelName);
        onStatus?.(
          `Loaded ${isRaster ? 'Raster' : 'Vector'} PMTiles "${labelName}" · Z${header.minZoom}–Z${header.maxZoom}`
        );
      } catch (err: any) {
        console.error('Error applying PMTiles:', err);
        setError(`Failed to read PMTiles archive: ${err.message || String(err)}`);
        onStatus?.('Error opening PMTiles archive');
      }
    },
    [onStatus, rasterOpacity, theme]
  );

  // Load Electron PMTiles file
  useEffect(() => {
    if (activeFileSource !== 'electron-file' || !filePath) return;
    const pmtiles = new PMTiles(formatLocalPmtilesUrl(filePath));
    void applyPMTilesArchive(
      formatPmtilesProtocolUrl(filePath),
      pmtiles,
      filePath.split(/[\\/]/).pop() || 'PMTiles Archive'
    );
  }, [activeFileSource, filePath, applyPMTilesArchive]);

  // Load Electron Folder PNG tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeFileSource !== 'electron-folder' || !mapFolder) return;

    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        // re-trigger
        setMapFolder(mapFolder);
      });
      return;
    }

    // Clear existing
    const existingLayers = map.getStyle().layers || [];
    for (const l of existingLayers) {
      if (l.id !== 'background' && !l.id.startsWith('measure-') && !l.id.startsWith('coverage-')) {
        map.removeLayer(l.id);
      }
    }
    const sourceId = 'rnms-offline-png';
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, {
      type: 'raster',
      tiles: [formatLocalTileTemplate(mapFolder)],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 14,
    });
    map.addLayer({
      id: 'rnms-offline-png-layer',
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': rasterOpacity,
        'raster-resampling': 'linear',
        'raster-fade-duration': 0,
      },
    });

    onStatus?.(`Connected to local tile folder: ${mapFolder}`);
  }, [activeFileSource, mapFolder, onStatus, rasterOpacity]);

  // Load Embedded Pakistan Offline Map
  const applyEmbeddedMap = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('load', () => applyEmbeddedMap());
      return;
    }

    const existingLayers = map.getStyle().layers || [];
    for (const l of existingLayers) {
      if (l.id !== 'background' && !l.id.startsWith('measure-') && !l.id.startsWith('coverage-')) {
        map.removeLayer(l.id);
      }
    }
    const sourceId = 'rnms-embedded-png-source';
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, {
      type: 'raster',
      tiles: ['uploaded-png://tile?z={z}&x={x}&y={y}'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 10,
    });
    map.addLayer({
      id: 'rnms-embedded-png-layer',
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': rasterOpacity,
        'raster-resampling': 'linear',
        'raster-fade-duration': 0,
      },
    });

    setActiveFileSource('embedded');
    setActiveFileName('Pakistan National Map (Built-in Offline)');
    setUploadedTileCount(276);
    map.fitBounds(
      [
        [60.5, 23.5],
        [78.0, 37.5],
      ],
      { padding: 30, duration: 600 }
    );
    onStatus?.('Loaded Built-in Pakistan National Offline Map');
  }, [onStatus, rasterOpacity]);

  // Load Web Uploaded PNG tiles
  const applyWebUploadedTiles = useCallback(
    (count: number, folderLabel: string) => {
      const map = mapRef.current;
      if (!map) return;

      if (!map.isStyleLoaded()) {
        map.once('load', () => applyWebUploadedTiles(count, folderLabel));
        return;
      }

      const existingLayers = map.getStyle().layers || [];
      for (const l of existingLayers) {
        if (l.id !== 'background' && !l.id.startsWith('measure-') && !l.id.startsWith('coverage-')) {
          map.removeLayer(l.id);
        }
      }
      const sourceId = 'rnms-web-png-source';
      if (map.getSource(sourceId)) map.removeSource(sourceId);

      map.addSource(sourceId, {
        type: 'raster',
        tiles: ['uploaded-png://tile?z={z}&x={x}&y={y}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 12,
      });
      map.addLayer({
        id: 'rnms-web-png-layer',
        type: 'raster',
        source: sourceId,
        paint: {
          'raster-opacity': rasterOpacity,
          'raster-resampling': 'linear',
          'raster-fade-duration': 0,
        },
      });

      setActiveFileSource('web-folder');
      setActiveFileName(folderLabel);
      setUploadedTileCount(count);
      onStatus?.(`Loaded ${count.toLocaleString()} uploaded PNG map tiles`);
    },
    [onStatus, rasterOpacity]
  );

  // Restore Offline Map on component mount (Default to Built-in Pakistan Map)
  useEffect(() => {
    const savedSource = localStorage.getItem('rnms_offline_active_source') || 'embedded';
    if (savedSource === 'embedded' || savedSource === 'none') {
      applyEmbeddedMap();
    } else if (savedSource === 'web-folder') {
      restoreOfflineTilesFromStore().then(({ tileCount, metadata }) => {
        if (tileCount > 0) {
          const label = metadata?.name || `Cached Offline Tiles (${tileCount.toLocaleString()})`;
          applyWebUploadedTiles(tileCount, label);
          if (metadata?.bounds) {
            const b = metadata.bounds;
            mapRef.current?.fitBounds(
              [
                [b.minLng, b.minLat],
                [b.maxLng, b.maxLat],
              ],
              { padding: 40, duration: 800 }
            );
          }
        } else {
          applyEmbeddedMap();
        }
      });
    }
  }, [applyEmbeddedMap, applyWebUploadedTiles]);

  // Manual File Upload Handlers (PMTiles, ZIP & PNG Directory)
  const handlePMTilesFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    // Inspect binary header
    let isZip = file.name.toLowerCase().endsWith('.zip');
    let isPmtiles = file.name.toLowerCase().endsWith('.pmtiles');

    try {
      const slice = await file.slice(0, 8).arrayBuffer();
      if (slice.byteLength >= 4) {
        const dv = new DataView(slice);
        // ZIP magic bytes: 'PK\x03\x04' (0x504B0304)
        if (dv.getUint32(0, false) === 0x504b0304) {
          isZip = true;
          isPmtiles = false;
        }
        // PMTiles magic bytes: 'PM' (19792 / 0x4D50)
        if (dv.getUint16(0, true) === 19792) {
          isPmtiles = true;
          isZip = false;
        }
      }
    } catch {}

    if (isZip) {
      onStatus?.(`Unpacking offline ZIP archive "${file.name}"...`);
      try {
        const res = await importOfflineZipArchive(file);
        applyWebUploadedTiles(res.tileCount, res.name);
        if (res.metadata?.bounds) {
          const b = res.metadata.bounds;
          mapRef.current?.fitBounds(
            [
              [b.minLng, b.minLat],
              [b.maxLng, b.maxLat],
            ],
            { padding: 40, duration: 800 }
          );
        }
        onStatus?.(`Loaded ${res.tileCount.toLocaleString()} tiles from ${file.name}`);
      } catch (err: any) {
        setError(`Failed to unpack ZIP archive: ${err.message || String(err)}`);
      }
      e.target.value = '';
      return;
    }

    if (isPmtiles) {
      try {
        const fileSource = new FileSource(file);
        const pmtiles = new PMTiles(fileSource);
        pmtilesProtocol.add(pmtiles);
        const sourceUrl = `pmtiles://${fileSource.getKey()}`;

        setActiveFileSource('web-file');
        await applyPMTilesArchive(sourceUrl, pmtiles, file.name);
      } catch (err: any) {
        setError(`Failed to read PMTiles file: ${err.message || String(err)}`);
      }
      e.target.value = '';
      return;
    }

    // Try fallback as ZIP archive
    try {
      const res = await importOfflineZipArchive(file);
      applyWebUploadedTiles(res.tileCount, res.name);
      onStatus?.(`Loaded ${res.tileCount.toLocaleString()} tiles from ${file.name}`);
    } catch {
      setError(
        `File "${file.name}" is not a valid PMTiles or ZIP map archive. Please upload a .pmtiles file or an offline .zip bundle.`
      );
    }
    e.target.value = '';
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setError('');

    const tilesMap = new Map<string, Blob>();
    let tileCount = 0;
    const reg = /(?:^|\/|\\)(?:([a-zA-Z0-9_-]+)\/)?(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg|webp)$/i;

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const relPath = file.webkitRelativePath || file.name;
      const match = relPath.match(reg);
      if (match) {
        const layer = match[1] || '';
        const z = match[2];
        const x = match[3];
        const y = match[4];

        if (layer) {
          tilesMap.set(`${layer}_${z}_${x}_${y}`, file);
          tilesMap.set(`${layer}/${z}/${x}/${y}`, file);
        }
        tilesMap.set(`${z}_${x}_${y}`, file);
        tilesMap.set(`${z}/${x}/${y}`, file);
        tileCount++;
      }
    }

    if (tileCount === 0) {
      setError('No standard tiles found in folder. Expected structure: z/x/y.png (e.g. 10/583/392.png)');
      return;
    }

    const folderLabel = `${fileList[0].webkitRelativePath?.split('/')[0] || 'Uploaded Tiles'} (${tileCount.toLocaleString()} tiles)`;
    await saveTilesToOfflineStore(tilesMap, { name: folderLabel, tileCount });
    applyWebUploadedTiles(tileCount, folderLabel);
    e.target.value = '';
  };

  // Drag & Drop Handler
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    setError('');

    const fileList = Array.from(e.dataTransfer.files) as File[];
    if (fileList.length === 0) return;

    const primaryFile = fileList[0];

    // Inspect binary header of first file
    let isZip = primaryFile.name.toLowerCase().endsWith('.zip');
    let isPmtiles = primaryFile.name.toLowerCase().endsWith('.pmtiles');

    try {
      const slice = await primaryFile.slice(0, 8).arrayBuffer();
      if (slice.byteLength >= 4) {
        const dv = new DataView(slice);
        if (dv.getUint32(0, false) === 0x504b0304) {
          isZip = true;
          isPmtiles = false;
        }
        if (dv.getUint16(0, true) === 19792) {
          isPmtiles = true;
          isZip = false;
        }
      }
    } catch {}

    // 1. Check if ZIP archive
    if (isZip) {
      onStatus?.(`Unpacking offline ZIP archive "${primaryFile.name}"...`);
      try {
        const res = await importOfflineZipArchive(primaryFile);
        applyWebUploadedTiles(res.tileCount, res.name);
        if (res.metadata?.bounds) {
          const b = res.metadata.bounds;
          mapRef.current?.fitBounds(
            [
              [b.minLng, b.minLat],
              [b.maxLng, b.maxLat],
            ],
            { padding: 40, duration: 800 }
          );
        }
        onStatus?.(`Loaded ${res.tileCount.toLocaleString()} tiles from ${primaryFile.name}`);
      } catch (err: any) {
        setError(`Failed to unpack ZIP archive: ${err.message || String(err)}`);
      }
      return;
    }

    // 2. Check if PMTiles file
    if (isPmtiles) {
      try {
        const fileSource = new FileSource(primaryFile);
        const pmtiles = new PMTiles(fileSource);
        pmtilesProtocol.add(pmtiles);
        const sourceUrl = `pmtiles://${fileSource.getKey()}`;
        setActiveFileSource('web-file');
        await applyPMTilesArchive(sourceUrl, pmtiles, primaryFile.name);
      } catch (err: any) {
        setError(`Failed to read PMTiles archive: ${err.message || String(err)}`);
      }
      return;
    }

    // 3. Check if PNG tile batch
    const tilesMap = new Map<string, Blob>();
    let tileCount = 0;
    const reg = /(?:^|\/|\\)(?:([a-zA-Z0-9_-]+)\/)?(\d+)\/(\d+)\/(\d+)\.(png|jpg|jpeg|webp)$/i;

    fileList.forEach((file) => {
      const match = (file.webkitRelativePath || file.name).match(reg);
      if (match) {
        const layer = match[1] || '';
        const z = match[2];
        const x = match[3];
        const y = match[4];
        if (layer) {
          tilesMap.set(`${layer}_${z}_${x}_${y}`, file);
          tilesMap.set(`${layer}/${z}/${x}/${y}`, file);
        }
        tilesMap.set(`${z}_${x}_${y}`, file);
        tilesMap.set(`${z}/${x}/${y}`, file);
        tileCount++;
      }
    });

    if (tileCount > 0) {
      const label = `Dropped Tiles (${tileCount.toLocaleString()} tiles)`;
      await saveTilesToOfflineStore(tilesMap, { name: label, tileCount });
      applyWebUploadedTiles(tileCount, label);
    } else {
      setError('Dropped file is not a valid PMTiles archive (.pmtiles), offline ZIP bundle (.zip), or tile folder.');
    }
  };

  // Electron Dialogs
  const handleElectronChooseFolder = async () => {
    try {
      const folder = await window.rnmsOffline?.selectMapFolder?.();
      if (!folder) return;
      setMapFolder(folder);
      const result = await window.rnmsOffline?.scanMapFolder?.(folder);
      const all = result ?? [];
      const pmtiles = all.filter((f) => f.extension === '.pmtiles');
      const pngs = all.filter(
        (f) => f.extension === '.png' || f.extension === '.jpg' || f.extension === '.webp'
      );
      setFiles(pmtiles);

      if (pmtiles.length) {
        setFilePath(pmtiles[0].path);
        setActiveFileSource('electron-file');
      } else if (pngs.length) {
        setActiveFileSource('electron-folder');
      }
      onStatus?.(
        `${pmtiles.length} PMTiles archive(s) • ${pngs.length.toLocaleString()} raster tile(s) found in selected directory`
      );
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  const handleElectronChooseFile = async () => {
    try {
      const selected = await window.rnmsOffline?.selectMapFile?.();
      if (selected) {
        setFilePath(selected);
        setActiveFileSource('electron-file');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
  };

  // Reset / Switch to Built-in Pakistan Offline Map
  const handleResetOfflineMap = () => {
    setFilePath('');
    setMapFolder('');
    setHeaderInfo(null);
    setError('');
    clearAllOfflineTiles();
    setUploadedTileCount(0);
    localStorage.removeItem('rnms_offline_file_path');
    localStorage.removeItem('rnms_offline_map_folder');
    localStorage.removeItem('rnms_offline_file_name');
    localStorage.setItem('rnms_offline_active_source', 'embedded');

    applyEmbeddedMap();
    onStatus?.('Switched to Embedded Pakistan Offline Map');
  };

  // Cisco Packet Tracer Live Wire Preview while dragging in Offline Map with Real DEM LOS
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous live wire markers
    liveWireMarkersRef.current.forEach((m) => m.remove());
    liveWireMarkersRef.current = [];

    const wireSourceId = 'rnms-live-wire-offline-source';
    const wireGlowLayerId = 'rnms-live-wire-offline-glow';
    const wireLayerId = 'rnms-live-wire-offline-line';

    if (!isConnecting || !connectingSource) {
      if (map.getLayer(wireLayerId)) map.removeLayer(wireLayerId);
      if (map.getLayer(wireGlowLayerId)) map.removeLayer(wireGlowLayerId);
      if (map.getSource(wireSourceId)) map.removeSource(wireSourceId);
      return;
    }

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (!isConnecting || !connectingSource) return;

      // Snap to candidate target site if mouse is close (~12km)
      const candidateSite = sites.find((s) => {
        if (s.id === connectingSource.id) return false;
        const d = calculateDistanceKm(e.lngLat.lat, e.lngLat.lng, s.lat, s.lng);
        return d < 12;
      });

      const targetLng = candidateSite ? candidateSite.lng : e.lngLat.lng;
      const targetLat = candidateSite ? candidateSite.lat : e.lngLat.lat;
      const distanceKm = Math.max(
        0.1,
        calculateDistanceKm(connectingSource.lat, connectingSource.lng, targetLat, targetLng)
      );
      const freqMHz = connectingSource.txFreqMHz || (candidateSite ? candidateSite.txFreqMHz : 400) || 400;

      // Live LOS analysis
      const losResult = analyzeLOS({
        txLat: connectingSource.lat,
        txLng: connectingSource.lng,
        rxLat: targetLat,
        rxLng: targetLng,
        txElevationM: connectingSource.elevation,
        rxElevationM: candidateSite?.elevation,
        txTowerHeightM: connectingSource.antennaHeightM || 20,
        rxTowerHeightM: candidateSite?.antennaHeightM || 20,
        frequencyMHz: freqMHz,
        samplePointsCount: 20,
      });

      const isBlocked =
        losResult.status === 'OBSTRUCTED' ||
        (losResult.worstPoint && losResult.worstPoint.clearanceM < 0);
      const deficitM = Math.abs(losResult.worstPoint?.clearanceM || 0);
      const wireColor = isBlocked ? '#ef4444' : '#06b6d4';

      // Dynamic Live SNR Calculation during wire dragging
      const fspl = calculateFSPL(distanceKm, freqMHz);
      const txPower = connectingSource.txPowerW
        ? 10 * Math.log10(connectingSource.txPowerW * 1000)
        : 43;
      const txGain = connectingSource.antennaGainDBi || 6;
      const rxGain = candidateSite?.antennaGainDBi || 6;
      const diffLoss = isBlocked
        ? (losResult.diffractionLossDB || Math.min(45, 18 + deficitM * 0.7))
        : 0;
      const rsl = txPower + txGain + rxGain - 3.0 - (fspl + diffLoss);
      const estimatedSnr = rsl - (-137);

      const data: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {
          color: wireColor,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [connectingSource.lng, connectingSource.lat],
            [targetLng, targetLat],
          ],
        },
      };

      if (map.getSource(wireSourceId)) {
        (map.getSource(wireSourceId) as maplibregl.GeoJSONSource).setData(data);
      } else {
        map.addSource(wireSourceId, {
          type: 'geojson',
          data,
        });

        map.addLayer({
          id: wireGlowLayerId,
          type: 'line',
          source: wireSourceId,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 8,
            'line-opacity': 0.35,
          },
        });

        map.addLayer({
          id: wireLayerId,
          type: 'line',
          source: wireSourceId,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 3.5,
            'line-dasharray': [2, 2],
            'line-opacity': 0.95,
          },
        });
      }

      // Update live wire midpoint badge
      liveWireMarkersRef.current.forEach((m) => m.remove());
      liveWireMarkersRef.current = [];

      const midLng = (connectingSource.lng + targetLng) / 2;
      const midLat = (connectingSource.lat + targetLat) / 2;

      const badgeEl = document.createElement('div');
      badgeEl.className = 'rnms-live-wire-badge select-none pointer-events-none';
      const label = isBlocked
        ? `🔴 BLOCKED (+${deficitM.toFixed(0)}m Peak)`
        : `🟢 CLEAR LOS ${candidateSite ? `➔ ${candidateSite.name}` : ''}`;
      const snrDisplay = isBlocked
        ? 'SNR: Lost'
        : `SNR: ${estimatedSnr > 0 ? `+${estimatedSnr.toFixed(1)}` : estimatedSnr.toFixed(1)} dB`;

      badgeEl.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.96); border: 2px solid ${wireColor}; border-radius: 8px; padding: 3px 9px; color: #f8fafc; font-family: ui-monospace, monospace; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 6px; box-shadow: 0 0 16px ${wireColor}80, 0 4px 10px rgba(0,0,0,0.6); backdrop-filter: blur(6px); white-space: nowrap; animation: pulse 1.5s infinite;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${wireColor}; box-shadow: 0 0 8px ${wireColor};"></span>
          <span style="color: #e2e8f0;">Air: <b>${distanceKm.toFixed(1)} km</b></span>
          <span style="color: #64748b;">•</span>
          <span style="color: ${isBlocked ? '#f87171' : '#38bdf8'}; font-weight: 800;">${snrDisplay}</span>
          <span style="color: #64748b;">•</span>
          <span style="color: ${wireColor};">${label}</span>
        </div>
      `;

      const midMarker = new maplibregl.Marker({ element: badgeEl, anchor: 'center' })
        .setLngLat([midLng, midLat])
        .addTo(map);

      liveWireMarkersRef.current.push(midMarker);

      // Peak obstacle marker if blocked
      if (isBlocked && losResult.worstPoint) {
        const obsEl = document.createElement('div');
        obsEl.className = 'rnms-obstruction-badge select-none pointer-events-none';
        obsEl.innerHTML = `
          <div style="background: rgba(220, 38, 38, 0.95); border: 2px solid #ffffff; border-radius: 9999px; padding: 2px 8px; color: #ffffff; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 4px; box-shadow: 0 0 16px rgba(239, 68, 68, 0.9); backdrop-filter: blur(4px); animation: pulse 1.5s infinite;">
            <span>⚠️</span>
            <span>PEAK BLOCK +${deficitM.toFixed(0)}m</span>
          </div>
        `;
        const obsMarker = new maplibregl.Marker({ element: obsEl, anchor: 'center' })
          .setLngLat([losResult.worstPoint.lng, losResult.worstPoint.lat])
          .addTo(map);

        liveWireMarkersRef.current.push(obsMarker);
      }
    };

    map.on('mousemove', onMouseMove);

    return () => {
      map.off('mousemove', onMouseMove);
      liveWireMarkersRef.current.forEach((m) => m.remove());
      liveWireMarkersRef.current = [];
      if (map.getLayer(wireLayerId)) map.removeLayer(wireLayerId);
      if (map.getLayer(wireGlowLayerId)) map.removeLayer(wireGlowLayerId);
      if (map.getSource(wireSourceId)) map.removeSource(wireSourceId);
    };
  }, [isConnecting, connectingSource, sites]);

  // Render RF Sites Markers on Offline Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!showSites) return;

    sites.forEach((site) => {
      const el = document.createElement('div');
      el.className = 'rnms-site-marker cursor-pointer transition-transform hover:scale-110 relative';

      const typeColors: Record<string, string> = {
        repeater: '#10b981',
        'base-station': '#2563eb',
        subscriber: '#f59e0b',
        'microwave-node': '#8b5cf6',
        relay: '#06b6d4',
      };

      const color = typeColors[site.type] || '#3b82f6';
      const isSelected = connectingSource?.id === site.id;

      el.innerHTML = `
        ${isSelected ? '<div style="position: absolute; top: -8px; left: -8px; width: 42px; height: 42px; border-radius: 50%; border: 2.5px solid #06b6d4; animation: ping 1.2s cubic-bezier(0, 0, 0.2, 1) infinite; box-shadow: 0 0 12px #06b6d4;"></div>' : ''}
        <div style="background-color: ${color}; width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
          <svg style="width: 14px; height: 14px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2v20m0-20l7 7m-7-7L5 9m7 13l7-7m-7 7l-7-7"/>
          </svg>
        </div>
      `;

      const popupHtml = `
        <div style="font-family: system-ui, sans-serif; min-width: 180px; padding: 4px;">
          <div style="font-weight: 700; font-size: 13px; color: #0f172a; margin-bottom: 2px;">${site.name}</div>
          <div style="font-size: 10px; font-weight: 700; color: ${color}; text-transform: uppercase; margin-bottom: 6px;">${site.type.replace('-', ' ')}</div>
          <div style="font-size: 11px; color: #475569; display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px;">
            <div><b>Elevation:</b> ${site.elevation}m AMSL</div>
            <div><b>Coords:</b> ${site.lat.toFixed(4)}°, ${site.lng.toFixed(4)}°</div>
            ${site.txFreqMHz ? `<div><b>TX Freq:</b> ${site.txFreqMHz} MHz</div>` : ''}
            ${site.equipmentType ? `<div><b>Equipment:</b> ${site.equipmentType}</div>` : ''}
          </div>
          <button id="btn-connect-offline-${site.id}" style="width: 100%; background: #0891b2; color: white; border: none; border-radius: 6px; padding: 6px 8px; font-size: 11px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px;">
            🔌 Connect Link To Another Station
          </button>
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(popupHtml);

      popup.on('open', () => {
        const btn = document.getElementById(`btn-connect-offline-${site.id}`);
        if (btn) {
          btn.onclick = (e) => {
            e.stopPropagation();
            popup.remove();
            setIsConnecting(true);
            setConnectingSource(site);
            setConnectToast(`🔌 Source: ${site.name} selected. Now click Target Station.`);
          };
        }
      });

      el.addEventListener('click', (e) => {
        if (isConnecting) {
          e.stopPropagation();
          popup.remove();
          handleSiteClickForConnection(site);
        }
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([site.lng, site.lat]);

      if (!isConnecting) {
        marker.setPopup(popup);
      }

      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [sites, showSites, isConnecting, connectingSource]);

  // Render Pakistan Cities, Towns, Passes & Landmarks Vector Overlay on Offline Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        // Trigger once style loaded
      });
      return;
    }

    const sourceId = 'rnms-offline-places-source';
    const circleLayerId = 'rnms-offline-places-circles';
    const labelLayerId = 'rnms-offline-places-labels';

    if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
    if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    if (!showPlaces) return;

    const placesGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: 'FeatureCollection',
      features: PAKISTAN_CITIES.map((c, i) => ({
        type: 'Feature',
        id: i,
        properties: {
          name: c.name,
          category: c.category,
          elevation: c.elevationM,
          color:
            c.category === 'Cantonment/Base'
              ? '#ef4444'
              : c.category === 'Mountain/Pass'
              ? '#f59e0b'
              : '#06b6d4',
        },
        geometry: {
          type: 'Point',
          coordinates: [c.lng, c.lat],
        },
      })),
    };

    map.addSource(sourceId, {
      type: 'geojson',
      data: placesGeoJSON,
    });

    // Place Circle Nodes
    map.addLayer({
      id: circleLayerId,
      type: 'circle',
      source: sourceId,
      minzoom: 4,
      maxzoom: 22,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 8, 4.5, 12, 6.5, 16, 8],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.85,
      },
    });

    // Place Text Labels
    map.addLayer({
      id: labelLayerId,
      type: 'symbol',
      source: sourceId,
      minzoom: 5,
      maxzoom: 22,
      layout: {
        'text-field': ['concat', ['get', 'name'], '\n', ['to-string', ['get', 'elevation']], 'm AMSL'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9, 8, 11, 12, 13, 16, 15],
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-optional': true,
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
      },
      paint: {
        'text-color': theme === 'light' ? '#0f172a' : '#f8fafc',
        'text-halo-color': theme === 'light' ? '#ffffff' : '#020617',
        'text-halo-width': 2.5,
      },
    });

    // Click handler for places popup
    const onPlaceClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return;
      const feat = e.features[0];
      const props = feat.properties as any;
      const coords = (feat.geometry as GeoJSON.Point).coordinates;

      new maplibregl.Popup({ offset: 12 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(`
          <div style="padding: 6px 8px; font-family: system-ui, sans-serif; min-width: 190px;">
            <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 2px;">${props.name}</div>
            <div style="font-size: 10px; font-weight: 700; color: ${props.color}; text-transform: uppercase; margin-bottom: 6px;">${props.category}</div>
            <div style="font-size: 11px; color: #475569; font-family: monospace; line-height: 1.5;">
              <div>🏔️ Elevation: <b>${props.elevation}m AMSL</b></div>
              <div>📍 Coords: ${coords[1].toFixed(4)}°N, ${coords[0].toFixed(4)}°E</div>
            </div>
          </div>
        `)
        .addTo(map);
    };

    map.on('click', circleLayerId, onPlaceClick);
    map.on('mouseenter', circleLayerId, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', circleLayerId, () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.off('click', circleLayerId, onPlaceClick);
      if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
      if (map.getLayer(circleLayerId)) map.removeLayer(circleLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [showPlaces, theme]);

  // Render Site-to-Site RF Links & Connectivity on Offline Map
  useEffect(() => {
    // Clear previous midpoint badges
    linkMarkersRef.current.forEach((m) => m.remove());
    linkMarkersRef.current = [];

    const map = mapRef.current;
    if (!map) return;

    if (!map.isStyleLoaded()) {
      map.once('load', () => {
        // Trigger re-render once style is ready
      });
      return;
    }

    const sourceId = 'rnms-offline-links-source';
    const glowLayerId = 'rnms-offline-links-glow';
    const lineLayerId = 'rnms-offline-links-line';

    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getLayer(glowLayerId)) map.removeLayer(glowLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    if (!showLinks || links.length === 0) return;

    const features: any[] = [];

    links.forEach((link) => {
      const s = sites.find((site) => site.id === link.sourceSiteId);
      const t = sites.find((site) => site.id === link.targetSiteId);
      if (!s || !t || isNaN(s.lat) || isNaN(s.lng) || isNaN(t.lat) || isNaN(t.lng)) return;

      const distanceKm = calculateDistanceKm(s.lat, s.lng, t.lat, t.lng);
      const freqMHz = link.frequencyMHz || 400;
      const fspl = calculateFSPL(distanceKm, freqMHz);
      const txTowerM = s.antennaHeightM || 20;
      const rxTowerM = t.antennaHeightM || 20;

      // High-precision terrain LOS profile calculation
      const losResult = analyzeLOS({
        txLat: s.lat,
        txLng: s.lng,
        rxLat: t.lat,
        rxLng: t.lng,
        txElevationM: s.elevation,
        rxElevationM: t.elevation,
        txTowerHeightM: txTowerM,
        rxTowerHeightM: rxTowerM,
        frequencyMHz: freqMHz,
        samplePointsCount: 30,
      });

      const isTerrainBlocked =
        losResult.status === 'OBSTRUCTED' ||
        (losResult.worstPoint && losResult.worstPoint.clearanceM < 0);
      const diffractionLossDB = losResult.diffractionLossDB || 0;

      const txPower = link.txPowerDBm ?? 43;
      const txGain = link.txAntennaGainDBi ?? 6;
      const rxGain = link.rxAntennaGainDBi ?? 6;
      const txLoss = link.txCableLossDB ?? 1.5;
      const rxLoss = link.rxCableLossDB ?? 1.5;
      const effectiveRsl =
        txPower + txGain + rxGain - txLoss - rxLoss - (fspl + diffractionLossDB);
      const bandwidthHz = (link.channelBandwidthKHz || 12.5) * 1000;
      const noiseFloor = -174 + 10 * Math.log10(bandwidthHz);
      const effectiveSnr = effectiveRsl - noiseFloor;
      const bearingAtoB = calculateBearing(s.lat, s.lng, t.lat, t.lng);
      const bearingBtoA = (bearingAtoB + 180) % 360;

      let status: 'CLEAR' | 'MARGINAL' | 'TERRAIN BLOCKED' | 'OFFLINE' = 'CLEAR';
      let color = '#22c55e'; // green

      if (s.status === 'offline' || t.status === 'offline') {
        status = 'OFFLINE';
        color = '#94a3b8'; // gray
      } else if (isTerrainBlocked) {
        status = 'TERRAIN BLOCKED';
        color = '#ef4444'; // vibrant red for terrain blocked
      } else if (losResult.status === 'MARGINAL' || effectiveSnr < 22) {
        status = 'MARGINAL';
        color = '#f59e0b'; // amber
      } else {
        status = 'CLEAR';
        color = effectiveSnr >= 35 ? '#10b981' : '#22c55e'; // emerald / green
      }

      const linkInfo = {
        link,
        source: s,
        target: t,
        distanceKm,
        snr: effectiveSnr,
        rsl: effectiveRsl,
        fspl,
        diffractionLossDB,
        status,
        color,
        bearingAtoB,
        bearingBtoA,
        losResult,
        isTerrainBlocked,
      };

      features.push({
        type: 'Feature',
        properties: {
          id: link.id,
          color,
          status,
          isTerrainBlocked,
          distanceKm: distanceKm.toFixed(1),
          snr: effectiveSnr.toFixed(1),
          rsl: effectiveRsl.toFixed(1),
          sourceName: s.name,
          targetName: t.name,
          freqMHz,
        },
        geometry: {
          type: 'LineString',
          coordinates: [
            [s.lng, s.lat],
            [t.lng, t.lat],
          ],
        },
      });

      // Interactive Midpoint Air Distance & SNR badge
      if (showLinkMetrics) {
        const midLng = (s.lng + t.lng) / 2;
        const midLat = (s.lat + t.lat) / 2;

        const el = document.createElement('div');
        el.className = 'rnms-link-badge select-none cursor-pointer transition-transform hover:scale-110';
        const iconEmoji = isTerrainBlocked ? '🔴' : color === '#f59e0b' ? '🟡' : '🟢';
        const snrText = isTerrainBlocked ? 'BLOCKED (NO LOS)' : `SNR: +${effectiveSnr.toFixed(1)} dB`;

        el.innerHTML = `
          <div style="background: rgba(15, 23, 42, 0.95); border: 2px solid ${color}; border-radius: 8px; padding: 3px 8px; color: #f8fafc; font-family: ui-monospace, monospace; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.6); backdrop-filter: blur(4px);">
            <span>${iconEmoji}</span>
            <span style="color: #e2e8f0;">Air: <b>${distanceKm.toFixed(1)} km</b></span>
            <span style="color: #64748b;">•</span>
            <span style="color: ${color}; font-weight: 800;">${snrText}</span>
          </div>
        `;

        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setSelectedLinkInfo(linkInfo);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([midLng, midLat])
          .addTo(map);

        linkMarkersRef.current.push(marker);
      }

      // Peak Obstruction Point Marker (if terrain blocks optical LOS)
      if (isTerrainBlocked && losResult.worstPoint) {
        const obsEl = document.createElement('div');
        obsEl.className = 'rnms-obstruction-badge select-none cursor-pointer transition-transform hover:scale-110';
        obsEl.innerHTML = `
          <div style="background: rgba(220, 38, 38, 0.95); border: 2px solid #ffffff; border-radius: 9999px; padding: 2px 8px; color: #ffffff; font-family: ui-monospace, monospace; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 4px; box-shadow: 0 0 16px rgba(239, 68, 68, 0.9), 0 4px 8px rgba(0,0,0,0.5); backdrop-filter: blur(4px); animation: pulse 1.5s infinite;">
            <span>⚠️</span>
            <span>PEAK BLOCK +${Math.abs(losResult.worstPoint.clearanceM).toFixed(0)}m</span>
          </div>
        `;

        obsEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setSelectedLinkInfo(linkInfo);
        });

        const obsMarker = new maplibregl.Marker({ element: obsEl, anchor: 'center' })
          .setLngLat([losResult.worstPoint.lng, losResult.worstPoint.lat])
          .addTo(map);

        linkMarkersRef.current.push(obsMarker);
      }
    });

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features,
      },
    });

    // Outer glow
    map.addLayer({
      id: glowLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 8,
        'line-opacity': 0.25,
        'line-blur': 3,
      },
    });

    // Inner sharp link line
    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.95,
      },
    });
  }, [links, sites, showLinks, showLinkMetrics]);

  // Render Coverage Rings
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = 'coverage-rings-source';
    const layerId = 'coverage-rings-layer';
    const lineLayerId = 'coverage-rings-line';

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    if (!showCoverageRings || sites.length === 0) return;

    const features = sites.map((site) => {
      const points = 64;
      const coords: [number, number][] = [];
      const distanceKm = coverageRadiusKm;
      const radiusLat = distanceKm / 111.32;
      const radiusLng = distanceKm / (111.32 * Math.cos((site.lat * Math.PI) / 180));

      for (let i = 0; i <= points; i++) {
        const theta = (i / points) * (2 * Math.PI);
        const lng = site.lng + radiusLng * Math.cos(theta);
        const lat = site.lat + radiusLat * Math.sin(theta);
        coords.push([lng, lat]);
      }

      return {
        type: 'Feature' as const,
        properties: { name: site.name, radius: distanceKm },
        geometry: {
          type: 'Polygon' as const,
          coordinates: [coords],
        },
      };
    });

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features,
      },
    });

    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': '#3b82f6',
        'fill-opacity': 0.15,
      },
    });

    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#2563eb',
        'line-width': 1.5,
        'line-dasharray': [3, 2],
      },
    });
  }, [showCoverageRings, coverageRadiusKm, sites]);

  // Measurement Tool Click Handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (!isMeasuring) return;
      const pt: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      setMeasurePoints((prev) => {
        if (prev.length >= 2) return [pt];
        return [...prev, pt];
      });
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [isMeasuring]);

  // Render Measurement Line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const sourceId = 'measure-line-source';
    const lineLayerId = 'measure-line-layer';
    const pointsLayerId = 'measure-points-layer';

    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getLayer(pointsLayerId)) map.removeLayer(pointsLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    if (measurePoints.length === 0) return;

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: measurePoints,
            },
          },
          ...measurePoints.map((pt, i) => ({
            type: 'Feature' as const,
            properties: { label: i === 0 ? 'Start' : 'End' },
            geometry: { type: 'Point' as const, coordinates: pt },
          })),
        ],
      },
    });

    map.addLayer({
      id: lineLayerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': '#ec4899',
        'line-width': 3,
        'line-dasharray': [2, 1],
      },
    });

    map.addLayer({
      id: pointsLayerId,
      type: 'circle',
      source: sourceId,
      filter: ['==', '$type', 'Point'],
      paint: {
        'circle-radius': 6,
        'circle-color': '#ec4899',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
  }, [measurePoints]);

  const measurementStats = useMemo(() => {
    if (measurePoints.length < 2) return null;
    const [p1, p2] = measurePoints;
    const distKm = calculateDistanceKm(p1[1], p1[0], p2[1], p2[0]);
    const bearing = calculateBearing(p1[1], p1[0], p2[1], p2[0]);
    return {
      distanceKm: distKm,
      distanceMi: distKm * 0.621371,
      bearingDeg: bearing,
    };
  }, [measurePoints]);

  const handleSelectSearchLocation = (loc: {
    lat: number;
    lng: number;
    zoom?: number;
    name: string;
    category?: string;
  }) => {
    const map = mapRef.current;
    if (!map) return;

    setActiveSearchPin(loc);

    map.flyTo({
      center: [loc.lng, loc.lat],
      zoom: loc.zoom || 12,
      duration: 1200,
      essential: true,
    });

    if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
      targetMarkerRef.current = null;
    }

    const pinEl = document.createElement('div');
    pinEl.className = 'rnms-search-pin animate-bounce';
    pinEl.innerHTML = `
      <div style="background-color: #ef4444; width: 32px; height: 32px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); display: flex; align-items: center; justify-content: center; border: 2.5px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.4);">
        <div style="transform: rotate(45deg); width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
      </div>
    `;

    const popup = new maplibregl.Popup({ offset: 20 }).setHTML(`
      <div style="font-family: system-ui, sans-serif; padding: 4px;">
        <div style="font-weight: 800; font-size: 13px; color: #0f172a;">${loc.name}</div>
        <div style="font-size: 10px; font-weight: 700; color: #ef4444; text-transform: uppercase; margin-bottom: 6px;">${loc.category || 'Target'}</div>
        <div style="font-size: 11px; color: #475569; font-family: monospace;">
          ${loc.lat.toFixed(5)}°, ${loc.lng.toFixed(5)}°
        </div>
      </div>
    `);

    const marker = new maplibregl.Marker({ element: pinEl })
      .setLngLat([loc.lng, loc.lat])
      .setPopup(popup)
      .addTo(map);

    targetMarkerRef.current = marker;
    marker.togglePopup();
  };

  const handleClearPin = () => {
    setActiveSearchPin(null);
    if (targetMarkerRef.current) {
      targetMarkerRef.current.remove();
      targetMarkerRef.current = null;
    }
  };

  const handleFitBounds = () => {
    const map = mapRef.current;
    if (!map || !headerInfo) return;
    if (headerInfo.minLon && headerInfo.maxLon) {
      map.fitBounds(
        [
          [headerInfo.minLon, headerInfo.minLat],
          [headerInfo.maxLon, headerInfo.maxLat],
        ],
        { padding: 40, duration: 600 }
      );
    }
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-slate-950 select-none flex flex-col p-0 m-0"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden File Inputs for Manual Upload */}
      <input
        ref={pmtilesInputRef}
        type="file"
        accept=".pmtiles,.zip"
        onChange={handlePMTilesFileUpload}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        onChange={handleFolderUpload}
        className="hidden"
      />

      {/* Top Floating Control Bar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: Mode Switcher & Search Bar */}
        <div className="pointer-events-auto flex items-center gap-2 w-full max-w-lg">
          {onSwitchToOnline && (
            <div className="flex items-center rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-800 shadow-lg text-xs">
              <button
                type="button"
                onClick={onSwitchToOnline}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 transition"
                title="Switch to Global Online Map"
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Online</span>
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-bold bg-emerald-600 text-white shadow-xs"
                title="Currently in Full Pakistan Offline Map Engine"
              >
                <WifiOff className="w-3.5 h-3.5" />
                <span>Offline</span>
              </button>
            </div>
          )}

          {/* Search Bar */}
          <div className="flex-1 min-w-[200px]">
            <MapSearchBar
              isOnline={false}
              hasActivePin={Boolean(activeSearchPin)}
              onSelectLocation={handleSelectSearchLocation}
              onClearPin={handleClearPin}
              placeholder="Search Pakistan cities, bases, sites, coordinates..."
            />
          </div>
        </div>

        {/* Offline Upload & Layer Controls */}
        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1.5 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 text-xs">
          {/* Built-in Pakistan Map Button */}
          <button
            type="button"
            onClick={applyEmbeddedMap}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg transition shadow-xs',
              activeFileSource === 'embedded'
                ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
            title="Switch to Embedded Pakistan National Offline Map (Built-in)"
          >
            <span>🇵🇰 Built-in Pakistan Map</span>
          </button>

          {/* Upload PMTiles / ZIP Button */}
          <button
            type="button"
            onClick={() => {
              if (isElectron) handleElectronChooseFile();
              else pmtilesInputRef.current?.click();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
            title="Upload or Open PMTiles (.pmtiles) or ZIP Offline Package (.zip)"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload (.zip / .pmtiles)</span>
          </button>

          {/* Upload PNG Tiles Folder Button */}
          <button
            type="button"
            onClick={() => {
              if (isElectron) handleElectronChooseFolder();
              else folderInputRef.current?.click();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition"
            title="Upload or Open PNG Tiles Folder (z/x/y.png)"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upload Folder</span>
          </button>

          {/* Reload Stored Tiles Button */}
          <button
            type="button"
            onClick={async () => {
              const res = await restoreOfflineTilesFromStore();
              if (res.tileCount > 0) {
                applyWebUploadedTiles(res.tileCount, res.metadata?.name || `Cached Tiles (${res.tileCount})`);
                if (res.metadata?.bounds) {
                  const b = res.metadata.bounds;
                  mapRef.current?.fitBounds([[b.minLng, b.minLat], [b.maxLng, b.maxLat]], { padding: 40 });
                }
                onStatus?.(`Reloaded ${res.tileCount.toLocaleString()} offline tiles from cache`);
              } else {
                onStatus?.('No offline tiles found in cache. Upload a .zip or .pmtiles package.');
              }
            }}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Reload offline tiles from cache"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Quick PMTiles File Switcher (if multiple exist in scanned folder) */}
          {files.length > 1 && (
            <select
              value={filePath}
              onChange={(e) => {
                setFilePath(e.target.value);
                setActiveFileSource('electron-file');
              }}
              className="text-xs border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 font-semibold"
            >
              {files.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.relative}
                </option>
              ))}
            </select>
          )}

          {/* Satellite vs Vector Mode Switcher */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => {
                setOfflineStyle('satellite');
                const map = mapRef.current;
                if (map) {
                  if (map.getLayer('rnms-offline-raster')) {
                    map.setLayoutProperty('rnms-offline-raster', 'visibility', 'visible');
                  }
                  if (map.getLayer('rnms-offline-png-layer')) {
                    map.setLayoutProperty('rnms-offline-png-layer', 'visibility', 'visible');
                  }
                  if (map.getLayer('rnms-web-png-layer')) {
                    map.setLayoutProperty('rnms-web-png-layer', 'visibility', 'visible');
                  }
                }
              }}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1',
                offlineStyle === 'satellite'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              )}
              title="Satellite Layer View"
            >
              <span>🛰️ Satellite</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setOfflineStyle('street');
                const map = mapRef.current;
                if (map) {
                  if (map.getLayer('rnms-offline-raster')) {
                    map.setLayoutProperty('rnms-offline-raster', 'visibility', 'none');
                  }
                  if (map.getLayer('rnms-offline-png-layer')) {
                    map.setLayoutProperty('rnms-offline-png-layer', 'visibility', 'none');
                  }
                  if (map.getLayer('rnms-web-png-layer')) {
                    map.setLayoutProperty('rnms-web-png-layer', 'visibility', 'none');
                  }
                }
              }}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] font-bold transition flex items-center gap-1',
                offlineStyle === 'street'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
              )}
              title="Street / Vector Map View"
            >
              <span>🗺️ Vector</span>
            </button>
          </div>

          {/* Opacity Control for Raster / Satellite Tiles */}
          {offlineStyle === 'satellite' && activeFileSource !== 'none' && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-bold">
              <Sliders className="w-3 h-3 text-slate-400" />
              <span>Opacity</span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={rasterOpacity}
                onChange={(e) => {
                  const op = Number(e.target.value);
                  setRasterOpacity(op);
                  const map = mapRef.current;
                  if (map) {
                    if (map.getLayer('rnms-offline-raster')) {
                      map.setPaintProperty('rnms-offline-raster', 'raster-opacity', op);
                    }
                    if (map.getLayer('rnms-offline-png-layer')) {
                      map.setPaintProperty('rnms-offline-png-layer', 'raster-opacity', op);
                    }
                    if (map.getLayer('rnms-web-png-layer')) {
                      map.setPaintProperty('rnms-web-png-layer', 'raster-opacity', op);
                    }
                  }
                }}
                className="w-14 h-1 accent-blue-600 cursor-pointer"
              />
            </div>
          )}

          {/* Cisco Packet Tracer RF Link Wiring Button */}
          <button
            type="button"
            onClick={() => {
              if (isConnecting) {
                setIsConnecting(false);
                setConnectingSource(null);
                setConnectToast(null);
              } else {
                setIsConnecting(true);
                setConnectingSource(null);
                setConnectToast('🔌 Packet Tracer Wire Tool: Click 1st RF Station (Source)');
              }
            }}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-lg transition shadow-xs',
              isConnecting
                ? 'bg-cyan-600 hover:bg-cyan-700 text-white ring-2 ring-cyan-400'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
            title="Cisco Packet Tracer style RF Link Wiring Tool"
          >
            <Cable className="w-3.5 h-3.5 text-cyan-500" />
            <span className="hidden sm:inline">{isConnecting ? 'Wiring Mode' : 'Connect Stations'}</span>
          </button>

          {/* Toggle Sites Overlay */}
          <button
            type="button"
            onClick={() => setShowSites(!showSites)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-lg border transition',
              showSites
                ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
            title="Toggle RF Sites overlay"
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sites ({sites.length})</span>
          </button>

          {/* Toggle Pakistan Places & Cities */}
          <button
            type="button"
            onClick={() => setShowPlaces(!showPlaces)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-lg border transition',
              showPlaces
                ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
            title="Toggle Pakistan Cities, Landmarks, and Places overlay"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden sm:inline">Places ({PAKISTAN_CITIES.length})</span>
          </button>

          {/* Toggle RF Links Connectivity */}
          <button
            type="button"
            onClick={() => setShowLinks(!showLinks)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-lg border transition',
              showLinks
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
            title="Toggle Site-to-Site RF Links Connectivity Lines"
          >
            <Wifi className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Links ({links.length})</span>
          </button>

          {/* Toggle Link Metrics (Air Distance & SNR) */}
          {showLinks && links.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLinkMetrics(!showLinkMetrics)}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 font-semibold rounded-lg border transition text-[11px]',
                showLinkMetrics
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/60 dark:border-indigo-800 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
              title="Toggle Air Distance & SNR Labels on Links"
            >
              <Zap className="w-3 h-3" />
              <span className="hidden sm:inline">SNR & Dist</span>
            </button>
          )}

          {/* Toggle Coverage Rings */}
          <button
            type="button"
            onClick={() => setShowCoverageRings(!showCoverageRings)}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-lg border transition',
              showCoverageRings
                ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/60 dark:border-purple-800 dark:text-purple-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
            title="Toggle Coverage Range Rings"
          >
            <Layers className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rings</span>
          </button>

          {/* Distance Measurement Tool */}
          <button
            type="button"
            onClick={() => {
              setIsMeasuring(!isMeasuring);
              if (isMeasuring) setMeasurePoints([]);
            }}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 font-semibold rounded-lg border transition',
              isMeasuring
                ? 'bg-pink-600 border-pink-700 text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            )}
            title="Measure distance and azimuth bearing"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isMeasuring ? 'Measuring...' : 'Measure'}</span>
          </button>

          {/* Header Info / Inspector Toggle */}
          {headerInfo && (
            <button
              type="button"
              onClick={() => setShowInspector(!showInspector)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Inspect PMTiles archive metadata"
            >
              <Info className="w-4 h-4 text-blue-500" />
            </button>
          )}

          {/* Fit Bounds Button */}
          {headerInfo && (
            <button
              type="button"
              onClick={handleFitBounds}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Fit map to archive bounds"
            >
              <Maximize2 className="w-4 h-4 text-emerald-500" />
            </button>
          )}

          {/* Eject / Reset Offline Map */}
          {activeFileSource !== 'none' && (
            <button
              type="button"
              onClick={handleResetOfflineMap}
              className="p-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition"
              title="Unload active offline map"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* MapLibre Canvas Container */}
      <div ref={container} className="w-full h-full flex-1" />

      {/* Drag & Drop Visual Prompt Overlay */}
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 bg-blue-950/80 backdrop-blur-sm border-4 border-dashed border-blue-400 rounded-xl flex flex-col items-center justify-center text-white animate-in fade-in">
          <Upload className="w-16 h-16 text-blue-400 mb-3 animate-bounce" />
          <h3 className="text-xl font-bold">Drop Offline Map Files Here</h3>
          <p className="text-sm text-blue-200 mt-1">
            Accepts <b>.pmtiles</b> archives (Vector/Raster) or <b>z/x/y.png</b> map tile bundles
          </p>
        </div>
      )}

      {/* Measurement HUD */}
      {isMeasuring && (
        <div className="absolute top-16 left-3 z-20 bg-slate-900/90 text-white border border-pink-500/50 rounded-xl p-3 shadow-xl backdrop-blur-md max-w-xs animate-in fade-in">
          <div className="flex items-center justify-between font-bold text-xs text-pink-400 mb-1.5">
            <span className="flex items-center gap-1.5">
              <Ruler className="w-4 h-4" /> Distance & Azimuth Tool
            </span>
            <button
              type="button"
              onClick={() => setMeasurePoints([])}
              className="text-[10px] text-slate-400 hover:text-white"
            >
              Reset
            </button>
          </div>
          <p className="text-[11px] text-slate-300 mb-2">
            {measurePoints.length === 0 && 'Click map to place starting point (TX)'}
            {measurePoints.length === 1 && 'Click second point on map to measure distance (RX)'}
            {measurePoints.length >= 2 && 'Measurement complete. Click again to start new line.'}
          </p>

          {measurementStats && (
            <div className="grid grid-cols-2 gap-2 text-center font-mono">
              <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
                <div className="text-[9px] text-slate-400 uppercase">Geodesic Distance</div>
                <div className="text-sm font-bold text-pink-400">
                  {measurementStats.distanceKm.toFixed(2)} km
                </div>
                <div className="text-[10px] text-slate-400">
                  ({measurementStats.distanceMi.toFixed(2)} mi)
                </div>
              </div>
              <div className="p-2 bg-slate-800 rounded-lg border border-slate-700">
                <div className="text-[9px] text-slate-400 uppercase">Bearing Angle</div>
                <div className="text-sm font-bold text-emerald-400">
                  {measurementStats.bearingDeg.toFixed(1)}°
                </div>
                <div className="text-[10px] text-slate-400">Azimuth</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coverage Rings Radius Slider */}
      {showCoverageRings && (
        <div className="absolute top-16 right-3 z-20 bg-white/90 dark:bg-slate-900/90 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 shadow-lg backdrop-blur-md w-56 animate-in fade-in">
          <div className="flex justify-between items-center text-xs font-bold mb-1">
            <span>Coverage Radius</span>
            <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
              {coverageRadiusKm} km
            </span>
          </div>
          <input
            type="range"
            min="5"
            max="150"
            step="5"
            value={coverageRadiusKm}
            onChange={(e) => setCoverageRadiusKm(Number(e.target.value))}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-[9px] text-slate-400 font-mono mt-0.5">
            <span>5 km</span>
            <span>50 km</span>
            <span>150 km</span>
          </div>
        </div>
      )}

      {/* PMTiles Inspector Drawer */}
      {showInspector && headerInfo && (
        <div className="absolute bottom-12 right-3 z-20 bg-slate-900/95 text-white border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md max-w-sm text-xs space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-1.5">
            <span className="flex items-center gap-1.5 text-blue-400">
              <FileCheck className="w-4 h-4" /> PMTiles Archive Specs
            </span>
            <button
              type="button"
              onClick={() => setShowInspector(false)}
              className="text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
            <div className="p-1.5 bg-slate-800/80 rounded">
              <span className="text-slate-400 block text-[9px]">FILE NAME</span>
              <span className="font-bold truncate block">{activeFileName || 'archive.pmtiles'}</span>
            </div>
            <div className="p-1.5 bg-slate-800/80 rounded">
              <span className="text-slate-400 block text-[9px]">TILE TYPE</span>
              <span className="font-bold text-emerald-400">
                {isRasterType(headerInfo.tileType) ? 'Raster Imagery' : 'Vector MVT'}
              </span>
            </div>
            <div className="p-1.5 bg-slate-800/80 rounded">
              <span className="text-slate-400 block text-[9px]">ZOOM RANGE</span>
              <span className="font-bold">
                Z{headerInfo.minZoom} – Z{headerInfo.maxZoom}
              </span>
            </div>
            <div className="p-1.5 bg-slate-800/80 rounded">
              <span className="text-slate-400 block text-[9px]">TILE COUNT</span>
              <span className="font-bold">{headerInfo.numTileEntries.toLocaleString()}</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            Bounds: [{headerInfo.minLon.toFixed(2)}, {headerInfo.minLat.toFixed(2)}] to [
            {headerInfo.maxLon.toFixed(2)}, {headerInfo.maxLat.toFixed(2)}]
          </div>
        </div>
      )}

      {/* Error Alert Box */}
      {error && (
        <div className="absolute bottom-12 left-3 right-3 z-30 bg-red-900/90 text-red-100 border border-red-500 rounded-xl p-3 text-xs flex items-center justify-between shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="p-1 text-red-300 hover:text-white shrink-0 ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Empty State Banner (if no offline map files loaded yet) */}
      {activeFileSource === 'none' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none p-4">
          <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-2xl p-6 max-w-md text-center shadow-2xl text-white pointer-events-auto space-y-4">
            <div className="w-12 h-12 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/30">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">No Offline Map Archive Loaded</h3>
              <p className="text-xs text-slate-400 mt-1">
                Upload an offline map <b>.zip bundle</b> (downloaded from Online Map), a <b>.pmtiles</b> archive, or a folder of <b>PNG map tiles</b>.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <button
                type="button"
                onClick={() => {
                  if (isElectron) handleElectronChooseFile();
                  else pmtilesInputRef.current?.click();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition"
              >
                <Upload className="w-4 h-4" /> Upload (.zip / .pmtiles)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (isElectron) handleElectronChooseFolder();
                  else folderInputRef.current?.click();
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
              >
                <FolderOpen className="w-4 h-4" /> Upload PNG Folder
              </button>
            </div>
            <div className="text-[11px] text-slate-500 pt-1">
              Tip: You can also drag and drop <b>.zip</b> packages, <b>.pmtiles</b>, or tile folders directly onto this window.
            </div>
          </div>
        </div>
      )}

      {/* Selected RF Link Details Inspector Card */}
      {selectedLinkInfo && (
        <div className="absolute bottom-12 left-3 z-30 w-84 sm:w-[420px] bg-slate-900/95 text-white rounded-2xl border border-slate-700 shadow-2xl p-4 backdrop-blur-md animate-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full animate-pulse shadow-sm"
                style={{ backgroundColor: selectedLinkInfo.color }}
              />
              <span className="font-bold text-xs text-slate-200 uppercase tracking-wider">
                RF Link Connectivity & LOS
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase"
                style={{
                  backgroundColor: `${selectedLinkInfo.color}25`,
                  color: selectedLinkInfo.color,
                  border: `1px solid ${selectedLinkInfo.color}60`,
                }}
              >
                {selectedLinkInfo.isTerrainBlocked
                  ? '🔴 BLOCKED (NO LOS)'
                  : selectedLinkInfo.status}
              </span>
              <button
                type="button"
                onClick={() => setSelectedLinkInfo(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Terrain Blockage Alert Banner */}
          {selectedLinkInfo.isTerrainBlocked ? (
            <div className="bg-red-950/70 border border-red-500/80 rounded-xl p-2.5 mb-3 flex items-start gap-2 text-xs text-red-200 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-red-300">
                  Terrain Blocked — Line of Sight Severed
                </div>
                <div className="text-[11px] text-red-300/80 mt-0.5">
                  Mountain peak at{' '}
                  <b>{selectedLinkInfo.losResult.worstPoint?.distanceKm.toFixed(1)} km</b> rises{' '}
                  <b>
                    +{Math.abs(selectedLinkInfo.losResult.worstPoint?.clearanceM || 0).toFixed(0)}m
                  </b>{' '}
                  into direct optical ray. Link cannot close without repeater or higher towers.
                </div>
              </div>
            </div>
          ) : selectedLinkInfo.status === 'MARGINAL' ? (
            <div className="bg-amber-950/70 border border-amber-500/80 rounded-xl p-2 mb-3 flex items-center gap-2 text-xs text-amber-200 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-[11px]">
                <b>Fresnel Zone Encroached:</b> Terrain incurs{' '}
                <b>+{selectedLinkInfo.diffractionLossDB.toFixed(1)} dB</b> knife-edge diffraction loss.
              </div>
            </div>
          ) : (
            <div className="bg-emerald-950/60 border border-emerald-500/60 rounded-xl p-2 mb-3 flex items-center gap-2 text-xs text-emerald-200 animate-in fade-in">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="text-[11px]">
                <b>Clear Line of Sight:</b> Full optical & 60% Fresnel clearance verified (+
                {selectedLinkInfo.losResult.worstPoint?.clearanceM.toFixed(0)}m margin).
              </div>
            </div>
          )}

          {/* Site-to-Site Nodes */}
          <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/60 mb-3 flex items-center justify-between text-xs">
            <div className="min-w-0">
              <div className="font-bold text-blue-400 truncate">{selectedLinkInfo.source.name}</div>
              <div className="text-[10px] text-slate-400">{selectedLinkInfo.source.elevation}m AMSL</div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500 mx-2 shrink-0" />
            <div className="text-right min-w-0">
              <div className="font-bold text-emerald-400 truncate">{selectedLinkInfo.target.name}</div>
              <div className="text-[10px] text-slate-400">{selectedLinkInfo.target.elevation}m AMSL</div>
            </div>
          </div>

          {/* Key RF & Terrain Metrics */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
            <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 font-sans">Air Distance</div>
              <div className="font-bold text-white text-sm">
                {selectedLinkInfo.distanceKm.toFixed(2)} km
              </div>
              <div className="text-[9px] text-slate-500 font-sans">
                {(selectedLinkInfo.distanceKm * 0.621371).toFixed(2)} miles
              </div>
            </div>

            <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 font-sans">SNR Value</div>
              <div className="font-bold text-sm" style={{ color: selectedLinkInfo.color }}>
                {selectedLinkInfo.isTerrainBlocked ? 'BLOCKED' : `${selectedLinkInfo.snr.toFixed(1)} dB`}
              </div>
              <div className="text-[9px] text-slate-500 font-sans">
                {selectedLinkInfo.isTerrainBlocked ? 'Path Deficit' : 'Signal-to-Noise'}
              </div>
            </div>

            <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 font-sans">Received Power (RSL)</div>
              <div className="font-bold text-white text-xs">{selectedLinkInfo.rsl.toFixed(1)} dBm</div>
              <div className="text-[9px] text-slate-500 font-sans">
                Diffraction: +{selectedLinkInfo.diffractionLossDB.toFixed(1)} dB
              </div>
            </div>

            <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-400 font-sans">Terrain Clearance</div>
              <div
                className={cn(
                  'font-bold text-xs',
                  selectedLinkInfo.isTerrainBlocked
                    ? 'text-red-400'
                    : selectedLinkInfo.status === 'MARGINAL'
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                )}
              >
                {selectedLinkInfo.losResult.worstPoint
                  ? `${selectedLinkInfo.losResult.worstPoint.clearanceM >= 0 ? '+' : ''}${selectedLinkInfo.losResult.worstPoint.clearanceM.toFixed(1)} m`
                  : 'N/A'}
              </div>
              <div className="text-[9px] text-slate-500 font-sans">
                Worst at {selectedLinkInfo.losResult.worstPoint?.distanceKm.toFixed(1)} km
              </div>
            </div>
          </div>

          {/* Quick Analysis Actions & Delete Link */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                localStorage.setItem('rnms_selected_link_id', selectedLinkInfo.link.id);
                localStorage.setItem('rnms_selected_tx_id', selectedLinkInfo.source.id);
                localStorage.setItem('rnms_selected_rx_id', selectedLinkInfo.target.id);
                setCurrentView('los');
              }}
              className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Real DEM LOS</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentView('rf-links');
              }}
              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1 border border-slate-700 transition"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Budget</span>
            </button>
            <button
              type="button"
              onClick={() => {
                removeLink(selectedLinkInfo.link.id);
                setSelectedLinkInfo(null);
                setConnectToast('🗑️ RF Link Disconnected');
              }}
              className="px-2.5 py-2 bg-red-950/60 hover:bg-red-900 border border-red-800 text-red-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition"
              title="Delete/Disconnect this RF Link"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Cisco Packet Tracer Connection Mode HUD Banner */}
      {isConnecting && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 text-white border border-cyan-500/80 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md flex items-center gap-3 text-xs animate-in slide-in-from-top-3">
          <Cable className="w-4 h-4 text-cyan-400 animate-pulse" />
          <div>
            {!connectingSource ? (
              <span>
                <b>Step 1:</b> Click on the <b>Source RF Station</b> to start link wiring
              </span>
            ) : (
              <span>
                <b>Step 2:</b> Source: <b className="text-cyan-400">{connectingSource.name}</b> ➔ Now click the <b>Target RF Station</b>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIsConnecting(false);
              setConnectingSource(null);
              setConnectToast(null);
            }}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-bold text-[10px] border border-slate-700 transition ml-2"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Quick Connect Toast Notice */}
      {connectToast && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white border border-cyan-500/80 rounded-xl px-4 py-2 shadow-2xl backdrop-blur-md text-xs flex items-center gap-2 animate-in fade-in">
          <span>{connectToast}</span>
          <button
            type="button"
            onClick={() => setConnectToast(null)}
            className="text-slate-400 hover:text-white ml-2 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Bottom Status HUD */}
      <div className="absolute bottom-2 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none text-[11px] font-mono">
        <div className="bg-slate-900/85 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-800 shadow-md backdrop-blur-md pointer-events-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>
            {activeFileName ? `Active: ${activeFileName}` : 'Offline Map Engine Ready'}
          </span>
        </div>

        {mouseCoords && (
          <div className="bg-slate-900/85 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-800 shadow-md backdrop-blur-md pointer-events-auto flex items-center gap-3">
            <span>
              {mouseCoords.lat.toFixed(5)}° N, {mouseCoords.lng.toFixed(5)}° E
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-blue-400 font-bold">Zoom {mouseCoords.zoom.toFixed(1)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
