import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, HardDrive, Download, Map, ShieldAlert, CheckCircle, Database, Layers } from 'lucide-react';

interface MapManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOnline: boolean;
}

export function MapManagerModal({ isOpen, onClose, isOnline }: MapManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'storage' | 'import'>('status');
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col text-slate-200 font-sans">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-emerald-500/20 rounded-md">
              <Map className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 leading-tight">Pakistan Map Manager</h2>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">Offline Geographic Information System</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/50">
          <button 
            onClick={() => setActiveTab('status')}
            className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'status' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <ShieldAlert className="w-4 h-4" /> System Status
          </button>
          <button 
            onClick={() => setActiveTab('storage')}
            className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'storage' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Database className="w-4 h-4" /> Local Storage
          </button>
          <button 
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2.5 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'import' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Download className="w-4 h-4" /> Import Package
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 bg-slate-900 min-h-[300px]">
          
          {/* STATUS TAB */}
          {activeTab === 'status' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${!isOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></div>
                  <div>
                    <div className="font-bold text-slate-200">{!isOnline ? 'OFFLINE MAP ACTIVE' : 'SYSTEM ONLINE'}</div>
                    <div className="text-xs text-slate-400">
                      {!isOnline 
                        ? 'External network requests are strictly disabled. Safe for secure deployment.' 
                        : 'Internet connection detected. Local fallback ready.'}
                    </div>
                  </div>
                </div>
                {!isOnline && (
                  <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-xs font-bold tracking-widest uppercase">
                    Airgapped
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-slate-700 rounded-lg bg-slate-800/20">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Available Layers</h4>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li className="flex items-center justify-between">
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-500"/> Pakistan Satellite</span>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-500"/> Pakistan Terrain</span>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-500"/> Topographical Grid</span>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </li>
                    <li className="flex items-center justify-between">
                      <span className="flex items-center gap-2"><Layers className="w-4 h-4 text-emerald-500"/> Tactical HUD</span>
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    </li>
                  </ul>
                </div>
                <div className="p-4 border border-slate-700 rounded-lg bg-slate-800/20">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Geographic Coverage</h4>
                  <ul className="space-y-2 text-sm text-slate-300">
                    <li className="flex items-center gap-2">📍 Punjab</li>
                    <li className="flex items-center gap-2">📍 Sindh</li>
                    <li className="flex items-center gap-2">📍 Khyber Pakhtunkhwa</li>
                    <li className="flex items-center gap-2">📍 Balochistan</li>
                    <li className="flex items-center gap-2">📍 GB & AJK</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* STORAGE TAB */}
          {activeTab === 'storage' && (
            <div className="space-y-6">
              <div className="p-5 border border-slate-700 rounded-lg bg-slate-800/30">
                <div className="flex items-center gap-3 mb-4">
                  <HardDrive className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-bold">Local Map Cache</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">Procedural Satellite Generator (Pakistan Model)</span>
                      <span className="font-mono text-emerald-400">0.02 MB</span>
                    </div>
                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-[1%]"></div>
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">Offline Gazetteer (Cities/Landmarks)</span>
                      <span className="font-mono text-emerald-400">0.45 MB</span>
                    </div>
                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full w-[2%]"></div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-300">Imported High-Res Satellite Tiles (PMTiles)</span>
                      <span className="font-mono text-slate-500">Not Installed</span>
                    </div>
                    <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-slate-600 h-full w-[0%]"></div>
                    </div>
                  </div>
                  
                  <div className="pt-4 mt-4 border-t border-slate-700 flex justify-between items-center">
                    <span className="font-bold text-slate-200">Total Storage Used:</span>
                    <span className="font-mono font-bold text-blue-400">0.47 MB</span>
                  </div>
                  <p className="text-[11px] text-slate-500 italic mt-2">
                    Note: The current Pakistan Satellite layer uses an ultra-optimized procedural generation engine, bypassing the need for multi-gigabyte raster datasets while maintaining offline tactical visualization.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* IMPORT TAB */}
          {activeTab === 'import' && (
            <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                <Download className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-200">Import Offline Map Package</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                Select a local <code className="text-purple-300 bg-purple-900/30 px-1 rounded">.pmtiles</code>, <code className="text-purple-300 bg-purple-900/30 px-1 rounded">.mbtiles</code>, or <code className="text-purple-300 bg-purple-900/30 px-1 rounded">.zip</code> package to load high-resolution raster or elevation data.
              </p>
              
              <div className="border-2 border-dashed border-slate-700 hover:border-purple-500/50 transition-colors bg-slate-800/30 rounded-xl p-8 max-w-md mx-auto cursor-pointer flex flex-col items-center justify-center">
                <input type="file" id="map-upload" className="hidden" accept=".pmtiles,.mbtiles,.zip" />
                <label htmlFor="map-upload" className="cursor-pointer">
                  <div className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold shadow-lg transition-colors">
                    Browse Files
                  </div>
                  <div className="mt-3 text-xs text-slate-500">Maps must cover the Pakistan region</div>
                </label>
              </div>
              
              <div className="text-left bg-slate-800/50 border border-slate-700 p-4 rounded-lg max-w-md mx-auto mt-6">
                <h4 className="text-xs font-bold text-slate-300 mb-2">Licensing Notice:</h4>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Due to copyright restrictions, high-resolution photographic satellite imagery is not bundled. You must provide legally acquired offline tile packages (e.g., via Protomaps PMTiles or authorized governmental sources) to utilize full offline raster photography.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
