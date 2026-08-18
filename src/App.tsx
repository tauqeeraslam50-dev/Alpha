/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { Sidebar, Header, StatusBar } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { GISMap } from './components/GISMap';
import { SitesNodes } from './components/SitesNodes';
import { RFLinkBudget } from './components/RFLinkBudget';
import { TerrainProfile } from './components/TerrainProfile';
import { EquipmentDB } from './components/EquipmentDB';
import { Simulation } from './components/Simulation';
import { Reports } from './components/Reports';
import { CoveragePrediction } from './components/CoveragePrediction';
import { FrequencyPlanning } from './components/FrequencyPlanning';

function MainContent() {
  const { currentView } = useAppContext();

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <Dashboard />;
      case 'gis-map': return <GISMap />;
      case 'sites': return <SitesNodes />;
      case 'rf-links': return <RFLinkBudget />;
      case 'frequency': return <FrequencyPlanning />;
      case 'terrain': return <TerrainProfile />;
      case 'coverage': return <CoveragePrediction />;
      case 'database': return <EquipmentDB />;
      case 'simulation': return <Simulation />;
      case 'reports': return <Reports />;
      default:
        return (
          <div className="flex items-center justify-center h-full p-6">
            <div className="w-full h-full flex flex-col items-center justify-center bg-white border border-slate-300 rounded-xl shadow-sm">
              <div className="text-6xl mb-4 opacity-30">📡</div>
              <h2 className="text-xl font-bold text-slate-700">Module in Development</h2>
              <p className="mt-2 text-sm text-slate-500 font-medium">
                The <span className="uppercase text-blue-600 font-bold mx-1">{currentView.replace('-', ' ')}</span> module is currently being engineered.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <main className="flex-1 flex flex-col relative bg-slate-200 overflow-y-auto">
      <div className="absolute inset-0 bg-[#e5e7eb] opacity-40 pointer-events-none min-h-full" style={{ backgroundImage: 'radial-gradient(#94a3b8 0.5px, transparent 0.5px)', backgroundSize: '20px 20px' }}></div>
      <div className="relative z-10 flex-1 flex flex-col">
        {renderView()}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AppProvider>
      <div className="flex flex-col h-screen bg-[#f8fafc] text-slate-900 font-sans overflow-hidden">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <MainContent />
        </div>
        <StatusBar />
      </div>
    </AppProvider>
  );
}
