import React, { useState, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  Database as DBIcon, Plus, Search, Trash2, Cpu, Radio, Zap, Activity, 
  Info, X, Download, Upload, Copy, CheckCircle2, ArrowRight, Settings2, Sliders, Shield
} from 'lucide-react';
import { Equipment, Site } from '../types';
import { downloadStringAsFile } from '../lib/utils';

export function EquipmentDB() {
  const { equipmentDB, addEquipment, removeEquipment, updateSite, sites, theme } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [bandFilter, setBandFilter] = useState<'all' | 'DMR' | 'SDR' | 'VHF' | 'UHF' | 'Microwave'>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedEqForAssign, setSelectedEqForAssign] = useState<Equipment | null>(null);
  const [targetSiteId, setTargetSiteId] = useState<string>('');
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New Equipment Form State
  const [newEq, setNewEq] = useState<Partial<Equipment>>({
    manufacturer: '',
    model: '',
    band: 'DMR',
    equipmentType: 'DMR Tier II',
    frequencyRange: '136-174 / 400-470',
    txPowerDBm: 47,
    rxSensitivityDBm: -120,
    channelSpacingKHz: 12.5,
    antennaConnector: 'N-Type Female',
    notes: '',
    dmrTimeslots: 2,
    colorCode: 1,
    vocoder: 'AMBE+2',
    sdrBandwidthMHz: 5.0,
    sdrSamplingRateMSps: 20.0,
    waveform: 'QPSK / 4-FSK Tactical',
    duplexShiftMHz: 4.6
  });

  const showNotification = (msg: string) => {
    setNotificationMsg(msg);
    setTimeout(() => setNotificationMsg(null), 3500);
  };

  const handleAddEquipment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEq.manufacturer || !newEq.model) return;

    const created: Equipment = {
      id: `eq_${Date.now()}`,
      manufacturer: newEq.manufacturer,
      model: newEq.model,
      band: (newEq.band || 'DMR') as any,
      equipmentType: newEq.equipmentType as any,
      frequencyRange: newEq.frequencyRange || '136-174',
      txPowerDBm: Number(newEq.txPowerDBm) || 47,
      rxSensitivityDBm: Number(newEq.rxSensitivityDBm) || -120,
      channelSpacingKHz: Number(newEq.channelSpacingKHz) || 12.5,
      antennaConnector: newEq.antennaConnector || 'N-Type',
      notes: newEq.notes || '',
      dmrTimeslots: newEq.band === 'DMR' ? Number(newEq.dmrTimeslots) || 2 : undefined,
      colorCode: newEq.band === 'DMR' ? Number(newEq.colorCode) || 1 : undefined,
      vocoder: newEq.band === 'DMR' ? newEq.vocoder || 'AMBE+2' : undefined,
      sdrBandwidthMHz: newEq.band === 'SDR' ? Number(newEq.sdrBandwidthMHz) || 5.0 : undefined,
      sdrSamplingRateMSps: newEq.band === 'SDR' ? Number(newEq.sdrSamplingRateMSps) || 20.0 : undefined,
      waveform: newEq.band === 'SDR' ? newEq.waveform || 'Tactical CPM' : undefined,
      duplexShiftMHz: Number(newEq.duplexShiftMHz) || 0
    };

    addEquipment(created);
    setIsAddModalOpen(false);
    showNotification(`Added ${created.manufacturer} ${created.model} to Equipment Catalog`);
    
    // Reset Form
    setNewEq({
      manufacturer: '',
      model: '',
      band: 'DMR',
      equipmentType: 'DMR Tier II',
      frequencyRange: '136-174 / 400-470',
      txPowerDBm: 47,
      rxSensitivityDBm: -120,
      channelSpacingKHz: 12.5,
      antennaConnector: 'N-Type Female',
      notes: '',
      dmrTimeslots: 2,
      colorCode: 1,
      vocoder: 'AMBE+2',
      sdrBandwidthMHz: 5.0,
      sdrSamplingRateMSps: 20.0,
      waveform: 'QPSK / 4-FSK Tactical',
      duplexShiftMHz: 4.6
    });
  };

  const handleCloneEquipment = (eq: Equipment) => {
    const cloned: Equipment = {
      ...eq,
      id: `eq_${Date.now()}`,
      model: `${eq.model} (Copy)`
    };
    addEquipment(cloned);
    showNotification(`Cloned ${cloned.manufacturer} ${cloned.model}`);
  };

  const handleOpenAssign = (eq: Equipment) => {
    setSelectedEqForAssign(eq);
    if (sites.length > 0) {
      setTargetSiteId(sites[0].id);
    }
    setIsAssignModalOpen(true);
  };

  const handleApplyToSite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEqForAssign || !targetSiteId) return;

    const targetSite = sites.find(s => s.id === targetSiteId);
    if (!targetSite) return;

    const powerWatts = Math.round(Math.pow(10, selectedEqForAssign.txPowerDBm / 10) / 1000);

    const updatedSite: Site = {
      ...targetSite,
      equipmentType: selectedEqForAssign.band as any,
      txPowerW: powerWatts > 0 ? powerWatts : 25,
      channelSpacingKHz: selectedEqForAssign.channelSpacingKHz,
      duplexOffsetMHz: selectedEqForAssign.duplexShiftMHz,
      dmrColorCode: selectedEqForAssign.colorCode,
      sdrBandwidthMHz: selectedEqForAssign.sdrBandwidthMHz
    };

    updateSite(updatedSite);
    setIsAssignModalOpen(false);
    showNotification(`Successfully configured ${targetSite.name} with ${selectedEqForAssign.model} parameters`);
  };

  const handleExportCatalog = () => {
    const jsonStr = JSON.stringify(equipmentDB, null, 2);
    downloadStringAsFile(jsonStr, 'rnms_equipment_catalog_v1.0.json', 'application/json');
    showNotification('Exported equipment catalog (.json)');
  };

  const handleImportCatalog = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (Array.isArray(data)) {
          data.forEach(item => {
            if (item.manufacturer && item.model) {
              addEquipment({
                ...item,
                id: `eq_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`
              });
            }
          });
          showNotification(`Imported ${data.length} equipment specifications into catalog`);
        }
      } catch {
        alert('Invalid JSON file format for equipment catalog.');
      }
    };
    reader.readAsText(file);
  };

  const filteredEquipment = equipmentDB.filter(eq => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = eq.manufacturer.toLowerCase().includes(term) ||
      eq.model.toLowerCase().includes(term) ||
      eq.notes.toLowerCase().includes(term) ||
      (eq.equipmentType && eq.equipmentType.toLowerCase().includes(term)) ||
      (eq.waveform && eq.waveform.toLowerCase().includes(term));

    const matchesBand = bandFilter === 'all' || eq.band === bandFilter;
    return matchesSearch && matchesBand;
  });

  const dmrCount = equipmentDB.filter(e => e.band === 'DMR').length;
  const sdrCount = equipmentDB.filter(e => e.band === 'SDR').length;
  const vhfCount = equipmentDB.filter(e => e.band === 'VHF').length;
  const uhfCount = equipmentDB.filter(e => e.band === 'UHF').length;
  const mwCount = equipmentDB.filter(e => e.band === 'Microwave').length;
  const hfCount = equipmentDB.filter(e => e.band === 'HF').length;
  const multiCount = equipmentDB.filter(e => e.band === 'Multiband').length;

  return (
    <div className={`p-4 md:p-6 h-full flex flex-col overflow-hidden ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}>
      {/* Toast Notification */}
      {notificationMsg && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4" />
          <span>{notificationMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Equipment & Radio Transceiver Database</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage tactical DMR Tier II/III, SDR transceivers, VHF/UHF repeaters, and microwave ODU/IDU hardware
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportCatalog} 
            accept=".json" 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
            title="Import Equipment JSON Catalog"
          >
            <Upload className="w-3.5 h-3.5" />
            Import
          </button>
          <button 
            onClick={handleExportCatalog}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
            title="Export Equipment JSON Catalog"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Equipment
          </button>
        </div>
      </div>

      {/* Equipment Category Counters Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-4 flex-shrink-0">
        <div 
          onClick={() => setBandFilter('all')}
          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
            bandFilter === 'all' 
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Radios</div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-white mt-0.5">{equipmentDB.length}</div>
          </div>
          <DBIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 opacity-60" />
        </div>

        <div 
          onClick={() => setBandFilter('SDR')}
          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
            bandFilter === 'SDR' 
              ? 'bg-cyan-50/80 dark:bg-cyan-950/40 border-cyan-500 ring-2 ring-cyan-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Tactical SDR</div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-white mt-0.5">{sdrCount}</div>
          </div>
          <Cpu className="w-4 h-4 text-cyan-600 dark:text-cyan-400 opacity-60" />
        </div>

        <div 
          onClick={() => setBandFilter('Multiband')}
          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
            bandFilter === 'Multiband' 
              ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Multiband</div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-white mt-0.5">{multiCount}</div>
          </div>
          <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400 opacity-60" />
        </div>

        <div 
          onClick={() => setBandFilter('HF')}
          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
            bandFilter === 'HF' 
              ? 'bg-orange-50/80 dark:bg-orange-950/40 border-orange-500 ring-2 ring-orange-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">HF (1.5-30)</div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-white mt-0.5">{hfCount}</div>
          </div>
          <Radio className="w-4 h-4 text-orange-600 dark:text-orange-400 opacity-60" />
        </div>

        <div 
          onClick={() => setBandFilter('VHF')}
          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
            bandFilter === 'VHF' 
              ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">VHF (136-174)</div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-white mt-0.5">{vhfCount}</div>
          </div>
          <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400 opacity-60" />
        </div>

        <div 
          onClick={() => setBandFilter('UHF')}
          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
            bandFilter === 'UHF' 
              ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">UHF (400-470)</div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-white mt-0.5">{uhfCount}</div>
          </div>
          <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400 opacity-60" />
        </div>

        <div 
          onClick={() => setBandFilter('DMR')}
          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
            bandFilter === 'DMR' 
              ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">DMR Tier II</div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-white mt-0.5">{dmrCount}</div>
          </div>
          <Radio className="w-4 h-4 text-purple-600 dark:text-purple-400 opacity-60" />
        </div>

        <div 
          onClick={() => setBandFilter('Microwave')}
          className={`p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${
            bandFilter === 'Microwave' 
              ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/20' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Microwave</div>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-white mt-0.5">{mwCount}</div>
          </div>
          <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 opacity-60" />
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="mb-3 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between flex-shrink-0">
        <div className="relative flex-1 max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input 
            type="text" 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="block w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500" 
            placeholder="Search manufacturer, model (e.g. Motorola, Hytera, Harris), vocoder, waveform..."
          />
        </div>

        {/* Category Pill Filters */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold gap-1 overflow-x-auto">
          {(['all', 'SDR', 'Multiband', 'HF', 'VHF', 'UHF', 'DMR', 'Microwave'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setBandFilter(tab)}
              className={`px-3 py-1.5 rounded-md transition-all whitespace-nowrap ${
                bandFilter === tab 
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 font-bold shadow-xs' 
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab === 'all' ? 'All Transceivers' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Equipment Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs rounded-xl overflow-hidden flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10">
              <tr>
                <th scope="col" className="px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Type / Band</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Manufacturer & Model</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Freq Range / Shift</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">DMR / SDR Specs</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">TX Power</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">RX Sens.</th>
                <th scope="col" className="px-5 py-3 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {filteredEquipment.map((eq) => (
                <tr key={eq.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <span className={`px-2.5 py-1 inline-flex text-[10px] font-bold uppercase tracking-wider rounded-md border shadow-2xs ${
                      eq.band === 'DMR' ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800' :
                      eq.band === 'SDR' ? 'bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800' :
                      eq.band === 'VHF' ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' :
                      eq.band === 'UHF' ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' :
                      'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                    }`}>
                      {eq.band}
                    </span>
                    {eq.equipmentType && (
                      <div className="text-[10px] text-slate-400 font-mono mt-1">{eq.equipmentType}</div>
                    )}
                  </td>
                  
                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="font-bold text-slate-800 dark:text-slate-200 text-sm">{eq.manufacturer}</div>
                    <div className="text-slate-500 dark:text-slate-400 font-medium">{eq.model}</div>
                    {eq.notes && (
                      <div className="text-[10px] text-slate-400 truncate max-w-xs mt-0.5" title={eq.notes}>
                        {eq.notes}
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-3.5 whitespace-nowrap">
                    <div className="font-mono text-slate-700 dark:text-slate-300 font-medium">{eq.frequencyRange} MHz</div>
                    {eq.duplexShiftMHz !== undefined && eq.duplexShiftMHz > 0 && (
                      <div className="text-[10px] text-blue-600 dark:text-blue-400 font-mono mt-0.5">
                        Shift: ±{eq.duplexShiftMHz} MHz
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-3.5">
                    {eq.band === 'DMR' && (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300">
                          <Radio className="w-3 h-3" />
                          <span>2-Slot TDMA (12.5 kHz)</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          CC: {eq.colorCode ?? 1} | Vocoder: {eq.vocoder || 'AMBE+2'}
                        </div>
                      </div>
                    )}

                    {eq.band === 'SDR' && (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                          <Cpu className="w-3 h-3" />
                          <span>BW: {eq.sdrBandwidthMHz || 5} MHz ({eq.sdrSamplingRateMSps || 20} MSps)</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          Waveform: {eq.waveform || 'Tactical Agility'}
                        </div>
                      </div>
                    )}

                    {eq.band !== 'DMR' && eq.band !== 'SDR' && (
                      <div className="text-slate-500 dark:text-slate-400 text-[11px]">
                        Spacing: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{eq.channelSpacingKHz} kHz</span>
                        <div className="text-[10px] text-slate-400 font-mono">{eq.antennaConnector}</div>
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-3.5 whitespace-nowrap font-mono text-slate-700 dark:text-slate-300 font-bold">
                    {eq.txPowerDBm} dBm
                    <div className="text-[10px] font-normal text-slate-400">
                      {(Math.pow(10, eq.txPowerDBm / 10) / 1000).toFixed(1)} W
                    </div>
                  </td>

                  <td className="px-5 py-3.5 whitespace-nowrap font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                    {eq.rxSensitivityDBm} dBm
                    <div className="text-[10px] font-normal text-slate-400">
                      {eq.channelSpacingKHz} kHz
                    </div>
                  </td>

                  <td className="px-5 py-3.5 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={() => handleOpenAssign(eq)}
                        className="px-2 py-1 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 font-semibold rounded text-[11px] transition flex items-center gap-1"
                        title="Apply this equipment specifications to a site"
                      >
                        <Settings2 className="w-3 h-3" />
                        <span>Assign</span>
                      </button>
                      <button 
                        onClick={() => handleCloneEquipment(eq)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded transition"
                        title="Duplicate / Clone Profile"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => removeEquipment(eq.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                        title="Delete Equipment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Equipment to Site Modal */}
      {isAssignModalOpen && selectedEqForAssign && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">Assign Equipment to Site</h3>
              </div>
              <button 
                onClick={() => setIsAssignModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleApplyToSite} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 space-y-1">
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">Selected Radio</span>
                <div className="font-bold text-slate-800 dark:text-white text-sm">
                  {selectedEqForAssign.manufacturer} {selectedEqForAssign.model}
                </div>
                <div className="text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                  {selectedEqForAssign.band} • {selectedEqForAssign.txPowerDBm} dBm ({(Math.pow(10, selectedEqForAssign.txPowerDBm / 10) / 1000).toFixed(1)}W) • {selectedEqForAssign.frequencyRange} MHz
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">Target Site Node</label>
                <select
                  value={targetSiteId}
                  onChange={e => setTargetSiteId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white font-medium"
                >
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.type} • {s.elevation}m AMSL)
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button 
                  type="button" 
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Apply to Site
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Equipment Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Radio className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className="font-bold text-slate-800 dark:text-white text-base">Add Radio Equipment / SDR Transceiver</h3>
              </div>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddEquipment} className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">Manufacturer</label>
                  <input 
                    type="text" 
                    required
                    value={newEq.manufacturer}
                    onChange={e => setNewEq({...newEq, manufacturer: e.target.value})}
                    placeholder="e.g. Motorola, Hytera, Harris"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">Model Name / Number</label>
                  <input 
                    type="text" 
                    required
                    value={newEq.model}
                    onChange={e => setNewEq({...newEq, model: e.target.value})}
                    placeholder="e.g. MOTOTRBO SLR 8000, USRP B210"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">Equipment Category / Band</label>
                  <select 
                    value={newEq.band}
                    onChange={e => {
                      const band = e.target.value as any;
                      let eqType = newEq.equipmentType;
                      if (band === 'DMR') eqType = 'DMR Tier II';
                      else if (band === 'SDR') eqType = 'Tactical SDR';
                      else if (band === 'VHF') eqType = 'Analog FM';
                      else if (band === 'UHF') eqType = 'Analog FM';
                      else if (band === 'Microwave') eqType = 'Microwave Backhaul';
                      setNewEq({...newEq, band, equipmentType: eqType});
                    }}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="DMR">DMR (Digital Mobile Radio)</option>
                    <option value="SDR">SDR (Software Defined Radio)</option>
                    <option value="VHF">VHF (136 - 174 MHz)</option>
                    <option value="UHF">UHF (400 - 470 MHz)</option>
                    <option value="Microwave">Microwave Point-to-Point</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">Frequency Range (MHz)</label>
                  <input 
                    type="text" 
                    value={newEq.frequencyRange}
                    onChange={e => setNewEq({...newEq, frequencyRange: e.target.value})}
                    placeholder="e.g. 136-174, 400-470, 30-512"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                  />
                </div>
              </div>

              {/* DMR Specific Fields */}
              {newEq.band === 'DMR' && (
                <div className="p-3 bg-purple-50/70 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800 space-y-3">
                  <div className="font-bold text-purple-800 dark:text-purple-300 text-[11px] flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5" />
                    DMR Digital TDMA Parameters
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[9px] mb-1">Color Code (0-15)</label>
                      <input 
                        type="number" 
                        min="0"
                        max="15"
                        value={newEq.colorCode || 1}
                        onChange={e => setNewEq({...newEq, colorCode: Number(e.target.value)})}
                        className="w-full px-2.5 py-1.5 border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[9px] mb-1">Duplex Shift (MHz)</label>
                      <input 
                        type="number" 
                        step="0.1"
                        value={newEq.duplexShiftMHz || 4.6}
                        onChange={e => setNewEq({...newEq, duplexShiftMHz: Number(e.target.value)})}
                        className="w-full px-2.5 py-1.5 border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[9px] mb-1">Vocoder Standard</label>
                      <input 
                        type="text" 
                        value={newEq.vocoder || 'AMBE+2'}
                        onChange={e => setNewEq({...newEq, vocoder: e.target.value})}
                        className="w-full px-2.5 py-1.5 border border-purple-200 dark:border-purple-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SDR Specific Fields */}
              {newEq.band === 'SDR' && (
                <div className="p-3 bg-cyan-50/70 dark:bg-cyan-950/40 rounded-xl border border-cyan-200 dark:border-cyan-800 space-y-3">
                  <div className="font-bold text-cyan-800 dark:text-cyan-300 text-[11px] flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5" />
                    SDR Tactical & Wideband Engine Parameters
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[9px] mb-1">RF Bandwidth (MHz)</label>
                      <input 
                        type="number" 
                        step="0.5"
                        value={newEq.sdrBandwidthMHz || 5.0}
                        onChange={e => setNewEq({...newEq, sdrBandwidthMHz: Number(e.target.value)})}
                        className="w-full px-2.5 py-1.5 border border-cyan-200 dark:border-cyan-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[9px] mb-1">Sampling (MSps)</label>
                      <input 
                        type="number" 
                        step="1"
                        value={newEq.sdrSamplingRateMSps || 20.0}
                        onChange={e => setNewEq({...newEq, sdrSamplingRateMSps: Number(e.target.value)})}
                        className="w-full px-2.5 py-1.5 border border-cyan-200 dark:border-cyan-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[9px] mb-1">Tactical Waveform</label>
                      <input 
                        type="text" 
                        value={newEq.waveform || 'ANW2 / COFDM'}
                        onChange={e => setNewEq({...newEq, waveform: e.target.value})}
                        className="w-full px-2.5 py-1.5 border border-cyan-200 dark:border-cyan-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">TX Power (dBm)</label>
                  <input 
                    type="number" 
                    value={newEq.txPowerDBm}
                    onChange={e => setNewEq({...newEq, txPowerDBm: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">RX Sensitivity (dBm)</label>
                  <input 
                    type="number" 
                    value={newEq.rxSensitivityDBm}
                    onChange={e => setNewEq({...newEq, rxSensitivityDBm: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">Channel Spacing (kHz)</label>
                  <input 
                    type="number" 
                    value={newEq.channelSpacingKHz}
                    onChange={e => setNewEq({...newEq, channelSpacingKHz: Number(e.target.value)})}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-300 uppercase text-[10px] mb-1">Antenna Connector & Notes</label>
                <input 
                  type="text" 
                  value={newEq.notes}
                  onChange={e => setNewEq({...newEq, notes: e.target.value})}
                  placeholder="e.g. N-Type 50Ω, IP67 Waterproof, Tactical Vehicular Rackmount"
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-slate-800 dark:text-white"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Save to Equipment Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
