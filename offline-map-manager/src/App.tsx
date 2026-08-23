import { useCallback, useEffect, useMemo, useState } from 'react';
import { Database, FolderOpen, Layers3, Map, RefreshCw, Settings2, ShieldCheck } from 'lucide-react';
import { OfflineMap } from './map';

type MapFile = { name: string; path: string; relative: string; size: number; extension: string };

const formatBytes = (n: number) => n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

export function App() {
  const [folder, setFolder] = useState('');
  const [files, setFiles] = useState<MapFile[]>([]);
  const [selected, setSelected] = useState('');
  const [status, setStatus] = useState('Select a local map-data folder to begin');
  const [tab, setTab] = useState<'map' | 'layers' | 'data' | 'settings'>('map');

  const scan = useCallback(async (path = folder) => {
    if (!path || !window.mapManager) return;
    const result = await window.mapManager.scanMapFolder(path);
    setFiles(result);
    const firstPmtiles = result.find((f) => f.extension === '.pmtiles');
    if (firstPmtiles && !selected) setSelected(firstPmtiles.path);
    setStatus(result.length ? `${result.length} local map-data files indexed` : 'No supported map-data files found');
  }, [folder, selected]);

  const chooseFolder = async () => {
    const chosen = await window.mapManager?.selectMapFolder();
    if (!chosen) return;
    setFolder(chosen);
    const result = await window.mapManager!.scanMapFolder(chosen);
    setFiles(result);
    const first = result.find((f) => f.extension === '.pmtiles');
    setSelected(first?.path || '');
    setStatus(result.length ? `${result.length} local map-data files indexed` : 'Folder selected — no supported files found');
  };

  useEffect(() => { void scan(); }, []);

  const categories = useMemo(() => ({
    satellite: files.filter(f => /satellite|imagery/i.test(f.relative)),
    terrain: files.filter(f => /terrain/i.test(f.relative)),
    places: files.filter(f => /place|city|road|vector/i.test(f.relative)),
    dem: files.filter(f => f.extension === '.hgt' || /dem/i.test(f.relative)),
  }), [files]);

  return <div className="app">
    <header className="topbar">
      <div><div className="eyebrow">OFFLINE GIS ENGINE</div><h1>Pakistan Offline Map Manager</h1><p>Standalone offline map engine and map-data manager</p></div>
      <div className="offline-badge"><ShieldCheck size={16} /> OFFLINE ONLY</div>
    </header>

    <aside className="sidebar">
      <button className={tab === 'map' ? 'active' : ''} onClick={() => setTab('map')}><Map size={18} /> Map Viewer</button>
      <button className={tab === 'layers' ? 'active' : ''} onClick={() => setTab('layers')}><Layers3 size={18} /> Map Layers</button>
      <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}><Database size={18} /> Data Packages</button>
      <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings2 size={18} /> Settings</button>

      <div className="data-card">
        <strong>Local map data</strong>
        <span>{folder || 'No folder selected'}</span>
        <button className="secondary" onClick={chooseFolder}><FolderOpen size={16} /> Select Data Folder</button>
        {folder && <button className="secondary" onClick={() => void scan()}><RefreshCw size={15} /> Rescan</button>}
      </div>

      <div className="inventory-mini">
        <div><b>{files.length}</b><span>Files</span></div>
        <div><b>{categories.satellite.length}</b><span>Satellite</span></div>
        <div><b>{categories.places.length}</b><span>Places/Roads</span></div>
        <div><b>{categories.dem.length}</b><span>DEM</span></div>
      </div>
    </aside>

    <main className="workspace">
      {tab === 'map' && <section className="map-panel">
        {!selected ? <div className="map-empty"><Map size={52}/><h2>Pakistan Offline Map</h2><p>Select a folder containing a compatible <b>.pmtiles</b> archive.</p><button className="primary" onClick={chooseFolder}><FolderOpen size={17}/> Open Map Data</button></div> : <OfflineMap filePath={selected} onStatus={setStatus} />}
        <div className="map-toolbar"><span>{selected ? selected : 'No PMTiles selected'}</span>{selected && <select value={selected} onChange={e => setSelected(e.target.value)}>{files.filter(f => f.extension === '.pmtiles').map(f => <option key={f.path} value={f.path}>{f.relative}</option>)}</select>}</div>
      </section>}

      {tab === 'layers' && <section className="content-panel"><h2>Map Layers</h2><p>Layers are discovered from the local map-data directory. Raster PMTiles are rendered as imagery; vector PMTiles are rendered with generic geometry and name labels.</p><div className="layer-grid"><div>Satellite <b>{categories.satellite.length ? 'AVAILABLE' : 'NOT INSTALLED'}</b></div><div>Terrain <b>{categories.terrain.length ? 'AVAILABLE' : 'NOT INSTALLED'}</b></div><div>Places / Roads <b>{categories.places.length ? 'AVAILABLE' : 'NOT INSTALLED'}</b></div><div>DEM <b>{categories.dem.length ? 'AVAILABLE' : 'NOT INSTALLED'}</b></div></div></section>}

      {tab === 'data' && <section className="content-panel"><h2>Data Packages</h2><p>Indexed local files. Large map datasets remain outside the executable so they can be updated independently.</p><div className="file-list">{files.map(f => <button key={f.path} onClick={() => f.extension === '.pmtiles' && (setSelected(f.path), setTab('map'))}><span>{f.relative}</span><small>{f.extension.toUpperCase()} · {formatBytes(f.size)}</small></button>)}</div>{!files.length && <div className="empty-note">No map data indexed.</div>}</section>}

      {tab === 'settings' && <section className="content-panel"><h2>Settings</h2><div className="setting"><span>Internet map fallback</span><b>DISABLED</b></div><div className="setting"><span>Automatic map downloads</span><b>DISABLED</b></div><div className="setting"><span>Map data location</span><code>{folder || 'Not selected'}</code></div></section>}

      <footer className="statusbar"><span>{status}</span><span>Files indexed: <b>{files.length}</b> · Internet: <b>Disabled</b></span></footer>
    </main>
  </div>;
}
