import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FolderOpen, HardDrive, Map, RefreshCw, ShieldCheck, Satellite, Trash2, Mountain, Layers3, FileArchive, Info } from 'lucide-react';
import { useAppContext } from '../context/AppContext';

type AssetInfo = { name: string; sizeBytes: number; modified: string };
type GISInfo = { mapsRoot: string; demRoot: string; satelliteAvailable: boolean; terrainAvailable: boolean; satellitePMTilesAvailable?: boolean; terrainPMTilesAvailable?: boolean; satellite: AssetInfo | null; terrain: AssetInfo | null; demTileCount: number; demTiles: string[]; demResolution: string | null; pmtilesBaseUrl?: string };
type UploadProgress = { active: boolean; fileName: string; percent: number; copiedBytes: number; totalBytes: number; speedBytesPerSecond: number; status: 'uploading' | 'complete' | 'failed'; error?: string };
declare global { interface Window { rnmsOffline?: any } }

const emptyInfo: GISInfo = { mapsRoot: '', demRoot: '', satelliteAvailable: false, terrainAvailable: false, satellite: null, terrain: null, demTileCount: 0, demTiles: [], demResolution: null };
const fmt = (bytes?: number) => bytes == null ? '—' : bytes < 1024 ** 3 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
const dateFmt = (value?: string) => value ? new Date(value).toLocaleString() : '—';
const speedFmt = (bytes?: number) => bytes == null ? '0.0 MB/s' : `${(bytes / 1024 ** 2).toFixed(1)} MB/s`;

export function OfflineMapManager() {
  const { theme } = useAppContext();
  const [info, setInfo] = useState<GISInfo>(emptyInfo);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState<{ valid: boolean; warnings: string[] } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try { const result = await window.rnmsOffline?.getMapInfo?.(); if (result) setInfo(result); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const unsubscribe = window.rnmsOffline?.onMapUploadProgress?.((progress: UploadProgress) => {
      setUploadProgress({ ...progress, active: progress.status === 'uploading' });
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  const installMaps = async () => {
    setBusy(true);
    setMessage('');
    setUploadProgress(null);
    try {
      const files = await window.rnmsOffline?.selectMapFiles?.();
      if (!files?.length) { setMessage('No PMTiles file selected.'); return; }
      setUploadProgress({ active: true, fileName: files.length === 1 ? files[0].split(/[\\/]/).pop() || '' : `${files.length} PMTiles files`, percent: 0, copiedBytes: 0, totalBytes: 0, speedBytesPerSecond: 0, status: 'uploading' });
      const result = await window.rnmsOffline.installMapFiles(files);
      if (result.info) setInfo(result.info);
      if (result.installed?.length) {
        setUploadProgress(previous => previous ? { ...previous, active: false, percent: 100, status: 'complete' } : null);
        setMessage(`✓ Upload complete. Installed ${result.installed.length} archive(s). Skipped ${result.skipped?.length || 0}.`);
      } else {
        setUploadProgress(previous => previous ? { ...previous, active: false, status: 'failed', error: 'No PMTiles archive was installed.' } : null);
        setMessage('✕ Upload failed. No PMTiles archive was installed.');
      }
    } catch (error: any) {
      setUploadProgress(previous => previous ? { ...previous, active: false, status: 'failed', error: error?.message || String(error) } : null);
      setMessage(`✕ Upload failed: ${error?.message || String(error)}`);
    } finally { setBusy(false); }
  };

  const installDem = async () => {
    setBusy(true); setMessage('Select the folder containing genuine SRTM/HGT files.');
    try {
      const folder = await window.rnmsOffline?.selectDemFolder?.();
      if (!folder) { setMessage('No DEM folder selected.'); return; }
      const result = await window.rnmsOffline.installDemFolder(folder);
      setMessage(`Imported ${result.installed || 0} HGT tile(s); skipped ${result.skipped || 0}.`);
      if (result.info) setInfo(result.info);
    } finally { setBusy(false); }
  };

  const validate = async () => {
    setBusy(true);
    try { const result = await window.rnmsOffline?.validateAssets?.(); setValidation(result ?? { valid: false, warnings: ['Electron GIS bridge unavailable.'] }); if (result) setInfo(result); }
    finally { setBusy(false); }
  };

  const remove = async (name: string) => {
    if (!confirm(`Remove ${name} from the offline GIS data store?`)) return;
    setBusy(true);
    try { await window.rnmsOffline?.removeMapAsset?.(name); setMessage(`${name} removed.`); await refresh(); }
    finally { setBusy(false); }
  };

  const coverageNote = useMemo(() => {
    if (info.satelliteAvailable && info.demTileCount > 0) return 'Satellite imagery and real elevation data are available. Vector labels/places must be supplied as a separate vector map dataset before they can be rendered over imagery.';
    if (info.satelliteAvailable) return 'Satellite imagery is available. Add the corresponding HGT DEM tiles for real elevation/LOS calculations.';
    return 'Add your offline satellite PMTiles and HGT DEM data to begin.';
  }, [info]);

  const Status = ({ ok, label, detail, icon }: { ok: boolean; label: string; detail: string; icon?: React.ReactNode }) => (
    <div className={`rounded-xl border p-4 ${ok ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20' : 'border-rose-200 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/20'}`}>
      <div className="flex items-center gap-2">{icon || (ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-rose-600" />)}<b>{label}</b></div>
      <div className="text-xs mt-2 opacity-75">{detail}</div>
    </div>
  );

  return <div className={`p-4 md:p-6 space-y-5 h-full overflow-y-auto ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}>
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
      <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center"><Layers3 className="w-6 h-6" /></div><div><h2 className="text-xl font-bold">Offline GIS Data Manager</h2><p className="text-xs text-slate-500">Manage local satellite, terrain and real HGT elevation data without rebuilding the application.</p></div></div>
      <button disabled={busy} onClick={refresh} className="px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 text-xs font-bold"><RefreshCw className="inline w-4 h-4 mr-1" />Scan Data</button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Status ok={info.satelliteAvailable} label="Satellite PMTiles" detail={info.satellite ? `${fmt(info.satellite.sizeBytes)} · ${info.satellite.name}` : 'Not installed'} icon={<Satellite className={`w-5 h-5 ${info.satelliteAvailable ? 'text-emerald-600' : 'text-rose-600'}`} />} />
      <Status ok={info.terrainAvailable} label="Terrain PMTiles" detail={info.terrain ? `${fmt(info.terrain.sizeBytes)} · ${info.terrain.name}` : 'Not installed'} icon={<Mountain className={`w-5 h-5 ${info.terrainAvailable ? 'text-emerald-600' : 'text-rose-600'}`} />} />
      <Status ok={info.demTileCount > 0} label="Real HGT DEM" detail={info.demTileCount ? `${info.demTileCount} tile(s) · ${info.demResolution}` : 'No HGT elevation tiles'} icon={<Database className={`w-5 h-5 ${info.demTileCount > 0 ? 'text-emerald-600' : 'text-rose-600'}`} />} />
    </div>

    <section className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 p-4 flex gap-3"><Info className="w-5 h-5 shrink-0 text-blue-600 mt-0.5" /><div><b className="text-sm">Current GIS status</b><p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{coverageNote}</p></div></section>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="font-bold flex items-center gap-2"><FileArchive className="w-5 h-5 text-blue-600" />Map Data Library</h3>
        <p className="text-xs text-slate-500">Import large map archives into the external GIS data store. The executable stays small and datasets can be replaced later.</p>
        <button disabled={busy} onClick={installMaps} className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold"><FolderOpen className="inline w-4 h-4 mr-2" />Import PMTiles</button>

        {uploadProgress && <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="font-bold text-sm">{uploadProgress.status === 'uploading' ? 'Uploading PMTiles…' : uploadProgress.status === 'complete' ? '✓ Upload complete' : '✕ Upload failed'}</div><div className="text-xs text-slate-500 truncate">{uploadProgress.fileName || 'Preparing file…'}</div></div><div className="font-bold text-sm">{uploadProgress.percent.toFixed(1)}%</div></div>
          <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full bg-blue-600 transition-all duration-200" style={{ width: `${Math.min(100, Math.max(0, uploadProgress.percent))}%` }} /></div>
          <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-600 dark:text-slate-300"><span>{fmt(uploadProgress.copiedBytes)} / {fmt(uploadProgress.totalBytes)}</span><span>{speedFmt(uploadProgress.speedBytesPerSecond)}</span></div>
          {uploadProgress.status === 'failed' && uploadProgress.error && <div className="text-xs text-rose-600">{uploadProgress.error}</div>}
        </div>}

        <div className="space-y-2 text-xs">
          {info.satellite && <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800"><span><b>Satellite</b><br />{info.satellite.name} · {fmt(info.satellite.sizeBytes)}<br /><span className="opacity-60">{dateFmt(info.satellite.modified)}</span></span><button onClick={() => remove('pakistan-satellite.pmtiles')} className="text-rose-600 p-1"><Trash2 className="w-4 h-4" /></button></div>}
          {info.terrain && <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-800"><span><b>Terrain</b><br />{info.terrain.name} · {fmt(info.terrain.sizeBytes)}<br /><span className="opacity-60">{dateFmt(info.terrain.modified)}</span></span><button onClick={() => remove('pakistan-terrain.pmtiles')} className="text-rose-600 p-1"><Trash2 className="w-4 h-4" /></button></div>}
          {!info.satellite && !info.terrain && <div className="text-center py-5 text-slate-500">No map archives installed.</div>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h3 className="font-bold flex items-center gap-2"><Mountain className="w-5 h-5 text-emerald-600" />Elevation / DEM Library</h3>
        <p className="text-xs text-slate-500">Import a folder containing genuine one-degree HGT tiles. Supported SRTM sample dimensions are 1201×1201, 3601×3601 and 7201×7201.</p>
        <button disabled={busy} onClick={installDem} className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"><FolderOpen className="inline w-4 h-4 mr-2" />Import HGT Folder</button>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs"><b>Installed:</b> {info.demTileCount} · <b>Resolution:</b> {info.demResolution || '—'}<br /><b>DEM folder:</b> <span className="font-mono break-all">{info.demRoot || '—'}</span></div>
      </section>
    </div>

    <section className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 p-5"><h3 className="font-bold flex items-center gap-2"><Map className="w-5 h-5 text-amber-600" />Vector map and city labels</h3><p className="text-xs text-slate-600 dark:text-slate-300 mt-2">Satellite imagery contains pixels, not city/place names. For the final offline map we need a separate vector tile dataset containing places, roads and boundaries. Keep that dataset in the same GIS data area; it should be loaded above the satellite layer by the map renderer.</p><div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs"><div className="rounded-lg bg-white/70 dark:bg-slate-900/50 p-3"><b>Satellite</b><br />Imagery background</div><div className="rounded-lg bg-white/70 dark:bg-slate-900/50 p-3"><b>Vector</b><br />Cities, roads, places</div><div className="rounded-lg bg-white/70 dark:bg-slate-900/50 p-3"><b>DEM</b><br />Real elevation / LOS</div></div></section>

    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"><div className="flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h3 className="font-bold flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-amber-600" />GIS Integrity Check</h3><p className="text-xs text-slate-500">Checks installed archives and HGT dimensions before they are used by the GIS/LOS system.</p></div><button disabled={busy} onClick={validate} className="px-4 py-2 rounded-lg bg-slate-800 text-white text-xs font-bold"><Database className="inline w-4 h-4 mr-1" />Validate Installed Data</button></div>{validation && <div className={`rounded-lg p-3 text-xs ${validation.valid ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'}`}><b>{validation.valid ? 'Validation passed.' : 'Validation warnings:'}</b>{validation.warnings.length ? <ul className="list-disc ml-5 mt-1">{validation.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : ' No integrity warnings detected.'}</div>}{message && <div className="text-xs rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">{message}</div>}</section>

    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"><h3 className="font-bold flex items-center gap-2 mb-3"><HardDrive className="w-5 h-5 text-slate-500" />Recommended external GIS layout</h3><pre className="text-xs font-mono overflow-x-auto bg-slate-950 text-slate-200 rounded-lg p-4">{`RNMS/\n├── RNMS.exe\n└── rnms-data/\n    ├── maps/\n    │   ├── pakistan-satellite.pmtiles\n    │   └── pakistan-terrain.pmtiles\n    └── dem/\n        ├── NxxEyyy.hgt\n        └── ...`}</pre><p className="text-xs text-slate-500 mt-3">Keep large GIS datasets outside the executable. This makes updates and replacement of map data much easier.</p></section>
  </div>;
}
