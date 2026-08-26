import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, MapPin, Radio, Compass, X, Loader2, Navigation, Layers, Globe } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { searchOfflineLocations } from '../lib/offlineGeo';
import { cn } from '../lib/utils';

export interface SearchResultItem {
  id: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
  elevationM?: number;
  source: 'site' | 'offline-gazetteer' | 'coordinate' | 'online-geocoder';
  details?: string;
  siteId?: string;
}

interface MapSearchBarProps {
  onSelectLocation: (loc: {
    lat: number;
    lng: number;
    zoom?: number;
    name: string;
    category?: string;
    elevationM?: number;
    source?: string;
    siteId?: string;
  }) => void;
  onClearPin?: () => void;
  hasActivePin?: boolean;
  isOnline?: boolean;
  placeholder?: string;
  className?: string;
}

export function MapSearchBar({
  onSelectLocation,
  onClearPin,
  hasActivePin = false,
  isOnline = false,
  placeholder = 'Search cities, sites, landmarks, coordinates (e.g. 33.68, 73.04)...',
  className,
}: MapSearchBarProps) {
  const { sites, theme } = useAppContext();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [onlineResults, setOnlineResults] = useState<SearchResultItem[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<any>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Offline results: Sites + Gazetteer + Coordinate parsing
  const offlineResults = useMemo<SearchResultItem[]>(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const qLower = trimmed.toLowerCase();
    const results: SearchResultItem[] = [];

    // 1. Match project RF sites
    const matchedSites = sites.filter(
      (s) =>
        s.name.toLowerCase().includes(qLower) ||
        s.id.toLowerCase().includes(qLower) ||
        s.type.toLowerCase().includes(qLower) ||
        (s.equipmentType && s.equipmentType.toLowerCase().includes(qLower))
    );

    matchedSites.slice(0, 6).forEach((s) => {
      results.push({
        id: `site-${s.id}`,
        name: s.name,
        category: `RF ${s.type.replace('-', ' ').toUpperCase()}`,
        lat: s.lat,
        lng: s.lng,
        elevationM: s.elevation,
        source: 'site',
        siteId: s.id,
        details: `${s.equipmentType || 'RF Node'} · TX ${s.txFreqMHz ? s.txFreqMHz + ' MHz' : 'N/A'} · ${s.elevation}m AMSL`,
      });
    });

    // 2. Match offline gazetteer & coordinate input
    const geoMatches = searchOfflineLocations(trimmed);
    geoMatches.slice(0, 10).forEach((item, index) => {
      results.push({
        id: `geo-${index}-${item.displayName}`,
        name: item.displayName.split(' - ')[0] || item.displayName,
        category: item.type,
        lat: item.lat,
        lng: item.lng,
        elevationM: item.elevationM,
        source: item.isCoordinateMatch ? 'coordinate' : 'offline-gazetteer',
        details: item.isCoordinateMatch
          ? `Lat: ${item.lat.toFixed(5)}°, Lon: ${item.lng.toFixed(5)}°`
          : `${item.elevationM ? item.elevationM + 'm AMSL · ' : ''}Pakistan Gazetteer`,
      });
    });

    return results;
  }, [query, sites]);

  // Online Geocoding with English Results (when in online mode)
  useEffect(() => {
    const trimmed = query.trim();
    if (!isOnline || trimmed.length < 3) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    // Do not query online geocoder if it's already a direct coordinate format
    if (/^(-?\d+(\.\d+)?)[,\s\t]+(-?\d+(\.\d+)?)$/.test(trimmed)) {
      setOnlineResults([]);
      return;
    }

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(async () => {
      setIsSearchingOnline(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          trimmed
        )}&accept-language=en&limit=5`;
        const res = await fetch(url, {
          headers: {
            'Accept-Language': 'en',
          },
        });
        if (res.ok) {
          const data = await res.json();
          const mapped: SearchResultItem[] = data.map((item: any) => ({
            id: `online-${item.place_id}`,
            name: item.display_name.split(',')[0] || item.display_name,
            category: item.type ? item.type.toUpperCase() : 'LOCATION',
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            source: 'online-geocoder',
            details: item.display_name,
          }));
          setOnlineResults(mapped);
        }
      } catch (err) {
        console.warn('Online geocoder request failed:', err);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 350);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query, isOnline]);

  // Combine and deduplicate
  const allResults = useMemo(() => {
    const combined = [...offlineResults];
    onlineResults.forEach((onlineItem) => {
      // Don't add duplicate names if already found offline
      if (!combined.some((c) => Math.abs(c.lat - onlineItem.lat) < 0.01 && Math.abs(c.lng - onlineItem.lng) < 0.01)) {
        combined.push(onlineItem);
      }
    });
    return combined.slice(0, 12);
  }, [offlineResults, onlineResults]);

  const handleSelect = (item: SearchResultItem) => {
    setIsOpen(false);
    setQuery(item.name);
    const zoomLevel = item.source === 'coordinate' ? 14 : item.source === 'site' ? 13 : 11;
    onSelectLocation({
      lat: item.lat,
      lng: item.lng,
      zoom: zoomLevel,
      name: item.name,
      category: item.category,
      elevationM: item.elevationM,
      source: item.source,
      siteId: item.siteId,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || allResults.length === 0) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % allResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + allResults.length) % allResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[highlightIndex]) {
        handleSelect(allResults[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    setOnlineResults([]);
    if (onClearPin && hasActivePin) {
      onClearPin();
    }
    inputRef.current?.focus();
  };

  const getSourceIcon = (source: SearchResultItem['source'], category: string) => {
    if (source === 'site') return <Radio className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
    if (source === 'coordinate') return <Compass className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    if (category.toLowerCase().includes('cantonment') || category.toLowerCase().includes('base')) {
      return <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    }
    if (source === 'online-geocoder') return <Globe className="w-3.5 h-3.5 text-cyan-500 shrink-0" />;
    return <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />;
  };

  return (
    <div ref={containerRef} className={cn('relative w-full max-w-md', className)}>
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-md transition-all backdrop-blur-md',
          theme === 'light'
            ? 'bg-white/95 border-slate-300 text-slate-900 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200'
            : 'bg-slate-900/95 border-slate-700 text-slate-100 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-900/40'
        )}
      >
        <Search className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-xs font-medium focus:outline-hidden placeholder:text-slate-400 placeholder:text-xs"
        />

        {isSearchingOnline && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />}

        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {hasActivePin && !query && onClearPin && (
          <button
            type="button"
            onClick={onClearPin}
            className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-200 transition shrink-0"
            title="Clear current target pin"
          >
            Clear Pin
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {isOpen && query.trim().length > 0 && (
        <div
          className={cn(
            'absolute left-0 right-0 top-full mt-1.5 rounded-lg border shadow-xl overflow-hidden z-[500] max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-100',
            theme === 'light' ? 'bg-white border-slate-200 divide-y divide-slate-100' : 'bg-slate-900 border-slate-700 divide-y divide-slate-800'
          )}
        >
          {allResults.length > 0 ? (
            <div>
              {allResults.map((item, idx) => {
                const isSelected = idx === highlightIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    className={cn(
                      'w-full text-left px-3 py-2 flex items-start gap-2.5 transition text-xs',
                      isSelected
                        ? theme === 'light'
                          ? 'bg-blue-50 text-blue-900'
                          : 'bg-blue-950/70 text-blue-100'
                        : theme === 'light'
                        ? 'hover:bg-slate-50 text-slate-800'
                        : 'hover:bg-slate-800 text-slate-200'
                    )}
                  >
                    <div className="mt-0.5">{getSourceIcon(item.source, item.category)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate">{item.name}</span>
                        <span
                          className={cn(
                            'text-[9px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 font-mono',
                            item.source === 'site'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                              : item.source === 'coordinate'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300'
                              : item.source === 'online-geocoder'
                              ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          )}
                        >
                          {item.category}
                        </span>
                      </div>
                      {item.details && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">
                          {item.details}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500">
              <Navigation className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
              <div>No locations found for &ldquo;{query}&rdquo;</div>
              <div className="text-[10px] text-slate-400 mt-1">
                Try searching city names, cantonments, or enter coordinates like <b>33.6844, 73.0479</b>
              </div>
            </div>
          )}

          {/* Footer info badge */}
          <div
            className={cn(
              'px-3 py-1.5 text-[10px] flex items-center justify-between font-mono',
              theme === 'light' ? 'bg-slate-50 text-slate-500' : 'bg-slate-950 text-slate-400'
            )}
          >
            <span>{allResults.length} matches found</span>
            <span>{isOnline ? 'Online + Offline Search' : '100% Offline Gazetteer'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
