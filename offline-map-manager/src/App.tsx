import { useState } from 'react';
import { FolderOpen, Layers3, Map, Database, Settings2, ShieldCheck } from 'lucide-react';

export function App() {
  const [status, setStatus] = useState('No offline map package installed');

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">OFFLINE GIS</div>
          <h1>Pakistan Offline Map Manager</h1>
          <p>Standalone map-data viewer and manager — no radio functions.</p>
        </div>
        <div className="offline-badge"><ShieldCheck size={16} /> OFFLINE MODE</div>
      </header>

      <aside className="sidebar">
        <button className="active"><Map size={18} /> Map Viewer</button>
        <button><Layers3 size={18} /> Map Layers</button>
        <button><Database size={18} /> Data Packages</button>
        <button><Settings2 size={18} /> Settings</button>

        <div className="data-card">
          <strong>Local map data</strong>
          <span>Nothing is downloaded automatically.</span>
          <button className="secondary" onClick={() => setStatus('Choose a local map-data folder') }>
            <FolderOpen size={16} /> Select Data Folder
          </button>
        </div>
      </aside>

      <main className="workspace">
        <section className="map-placeholder">
          <div className="map-grid" />
          <div className="map-message">
            <Map size={48} />
            <h2>Pakistan Offline Map</h2>
            <p>Install a compatible local map package to begin.</p>
            <button className="primary" onClick={() => setStatus('Map package selection will be connected to Electron file access next.')}>Open Map Package</button>
          </div>
          <div className="coordinates">Lat: — &nbsp;&nbsp; Lon: — &nbsp;&nbsp; Zoom: —</div>
        </section>

        <footer className="statusbar">
          <span>{status}</span>
          <span>Internet access: <b>Disabled</b></span>
        </footer>
      </main>
    </div>
  );
}
