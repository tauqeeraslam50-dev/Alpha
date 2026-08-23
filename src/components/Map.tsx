import React, { useState } from 'react';
import { Map as MapIcon, Wifi, WifiOff } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { cn } from '../lib/utils';

type MapMode = 'online' | 'offline';

export function Map() {
  const { theme } = useAppContext();
  const [mode, setMode] = useState<MapMode>('online');

  return (
    <section className={cn('h-full flex flex-col p-4 sm:p-5', theme === 'light' ? 'text-slate-900' : 'text-slate-100')}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapIcon className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-bold">Map</h2>
        </div>
        <div className={cn('flex items-center rounded-lg border p-1', theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700')}>
          <button type="button" onClick={() => setMode('online')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold', mode === 'online' ? 'bg-blue-600 text-white' : 'text-slate-500')}>
            <Wifi className="w-3.5 h-3.5" /> Online Map
          </button>
          <button type="button" onClick={() => setMode('offline')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold', mode === 'offline' ? 'bg-emerald-600 text-white' : 'text-slate-500')}>
            <WifiOff className="w-3.5 h-3.5" /> Offline Map
          </button>
        </div>
      </div>

      {mode === 'online' ? (
        <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-200">
          <iframe
            title="Online OpenStreetMap"
            src="https://www.openstreetmap.org/export/embed.html?bbox=60%2C23%2C78%2C38&layer=mapnik"
            className="w-full h-full border-0"
          />
        </div>
      ) : (
        <div className={cn('flex-1 rounded-xl border flex items-center justify-center', theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800')}>
          <div className="text-center">
            <WifiOff className="w-10 h-10 mx-auto mb-3 text-slate-400" />
            <h3 className="font-bold">Offline Map</h3>
            <p className="text-xs text-slate-500 mt-2">Offline map integration will be added later.</p>
          </div>
        </div>
      )}
    </section>
  );
}
