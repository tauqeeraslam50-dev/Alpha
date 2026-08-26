/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { Sidebar, Header, StatusBar } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Map } from './components/Map';
import { SitesNodes } from './components/SitesNodes';
import { RFLinkBudget } from './components/RFLinkBudget';
import { RealLOSProfiler } from './components/RealLOSProfiler';
import { EquipmentDB } from './components/EquipmentDB';
import { Simulation } from './components/Simulation';
import { Reports } from './components/Reports';
import { CoveragePrediction } from './components/CoveragePrediction';
import { FrequencyPlanning } from './components/FrequencyPlanning';
import { MicrowaveBackhaul } from './components/MicrowaveBackhaul';
import { AboutModal } from './components/AboutModal';

function MainContent() {
  const { currentView, theme } = useAppContext();

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'sites': return <SitesNodes />;
      case 'equipment': return <EquipmentDB />;
      case 'rf-links': return <RFLinkBudget />;
      case 'frequency': return <FrequencyPlanning />;
      case 'terrain': return <RealLOSProfiler />;
      case 'los': return <RealLOSProfiler />;
      case 'coverage': return <CoveragePrediction />;
      case 'microwave': return <MicrowaveBackhaul />;
      case 'simulation': return <Simulation />;
      case 'reports': return <Reports />;
      case 'database': return <EquipmentDB />;
      default: return <div className="flex items-center justify-center h-full p-6"><div className="w-full h-full flex flex-col items-center justify-center bg-white border border-slate-300 rounded-xl shadow-sm"><div className="text-6xl mb-4 opacity-30">📡</div><h2 className="text-xl font-bold text-slate-700">Module in Development</h2><p className="mt-2 text-sm text-slate-500 font-medium">The <span className="uppercase text-blue-600 font-bold mx-1">{currentView.replace('-', ' ')}</span> module is currently being engineered.</p></div></div>;
    }
  };

  return <main className={`flex-1 flex flex-col relative overflow-y-auto ${theme === 'light' ? 'bg-[#f1f5f9]' : 'bg-slate-950'}`}>
    <div className="absolute inset-0 opacity-40 pointer-events-none min-h-full" style={{ backgroundImage: theme === 'light' ? 'radial-gradient(#cbd5e1 0.75px, transparent 0.75px)' : 'radial-gradient(#334155 0.75px, transparent 0.75px)', backgroundSize: '20px 20px' }}></div>
    <div className="relative z-10 flex-1 flex flex-col">
      {/* Keep the map mounted while other modules are displayed. This preserves
          the MapLibre instance, PMTiles state, zoom and center during navigation. */}
      <div className={currentView === 'map' ? 'flex flex-1 min-h-0' : 'hidden'}>
        <Map />
      </div>
      {currentView !== 'map' && renderView()}
    </div>
  </main>;
}

function AppShell() {
  const { theme } = useAppContext();
  return <div className={`flex flex-col h-screen font-sans overflow-hidden transition-colors duration-200 ${theme === 'light' ? 'bg-[#f8fafc] text-slate-900' : 'bg-slate-900 text-slate-100 dark'}`}><Header /><div className="flex flex-1 overflow-hidden"><Sidebar /><MainContent /></div><StatusBar /><AboutModal /></div>;
}

export default function App() { return <AppProvider><AppShell /></AppProvider>; }
