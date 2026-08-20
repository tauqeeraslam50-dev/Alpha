import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Site, RFLink, Equipment, View } from '../types';

export type Theme = 'light' | 'dark';

interface FrequencyBatchUpdate {
  sites?: Array<{ id: string; txFreqMHz: number; rxFreqMHz: number; duplexOffsetMHz?: number; equipmentType?: any; dmrColorCode?: number }>;
  links?: Array<{ id: string; frequencyMHz: number; txFreqMHz?: number; rxFreqMHz?: number; duplexOffsetMHz?: number; modulationType?: any; equipmentType?: any }>;
}

interface AppState {
  currentView: View;
  setCurrentView: (view: View) => void;
  sites: Site[];
  addSite: (site: Site) => void;
  removeSite: (id: string) => void;
  updateSite: (site: Site) => void;
  clearAllSites: () => void;
  links: RFLink[];
  addLink: (link: RFLink) => void;
  updateLink: (link: RFLink) => void;
  equipmentDB: Equipment[];
  addEquipment: (eq: Equipment) => void;
  updateEquipment: (eq: Equipment) => void;
  removeEquipment: (id: string) => void;
  batchUpdateFrequencies: (update: FrequencyBatchUpdate) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isAboutModalOpen: boolean;
  setIsAboutModalOpen: (open: boolean) => void;
  exportBackup: () => void;
  importBackup: (jsonData: string) => void;
}

const defaultEquipment: Equipment[] = [
  { 
    id: 'aselsan-4900', 
    manufacturer: 'Aselsan', 
    model: '4900 Series ATLAS Base/Repeater', 
    band: 'VHF', 
    equipmentType: 'Digital Repeater', 
    frequencyRange: '146-174 / 380-470', 
    txPowerDBm: 50, 
    rxSensitivityDBm: -120, 
    channelSpacingKHz: 12.5, 
    antennaConnector: 'N-Type Female', 
    notes: 'ATLAS P25 / APCO compliant base station & repeater',
  },
  { 
    id: 'aselsan-4700', 
    manufacturer: 'Aselsan', 
    model: '4700 Series VHF/UHF Mobile', 
    band: 'VHF', 
    equipmentType: 'Analog FM', 
    frequencyRange: '136-174 / 380-470', 
    txPowerDBm: 47, 
    rxSensitivityDBm: -118, 
    channelSpacingKHz: 12.5, 
    antennaConnector: 'BNC Female', 
    notes: 'Aselsan 4700 series professional mobile radio',
  },
  { 
    id: 'aselsan-3700', 
    manufacturer: 'Aselsan', 
    model: '3700 Series Handheld', 
    band: 'DMR', 
    equipmentType: 'DMR Tier II', 
    frequencyRange: '136-174 / 400-470', 
    txPowerDBm: 37, 
    rxSensitivityDBm: -119, 
    channelSpacingKHz: 12.5, 
    antennaConnector: 'SMA', 
    notes: 'Aselsan professional digital handheld radio',
  },
  { 
    id: 'aselsan-9651', 
    manufacturer: 'Aselsan', 
    model: 'PRC-9651 Tactical SDR', 
    band: 'SDR', 
    equipmentType: 'Tactical SDR', 
    frequencyRange: '30-512', 
    txPowerDBm: 40, 
    rxSensitivityDBm: -118, 
    channelSpacingKHz: 25, 
    antennaConnector: 'TNC', 
    notes: 'VHF/UHF Tactical Software Defined Radio',
  },
  { 
    id: 'e1', 
    manufacturer: 'Motorola Solutions', 
    model: 'MOTOTRBO SLR 5500', 
    band: 'DMR', 
    equipmentType: 'DMR Tier II', 
    frequencyRange: '136-174 / 400-470', 
    txPowerDBm: 47, 
    rxSensitivityDBm: -120, 
    channelSpacingKHz: 12.5, 
    antennaConnector: 'N-Type Female', 
    notes: '2-Slot TDMA Digital Repeater, IP Site Connect & Capacity Plus ready',
    dmrTimeslots: 2,
    colorCode: 1,
    vocoder: 'AMBE+2',
    duplexShiftMHz: 4.6
  },
  { 
    id: 'e2', 
    manufacturer: 'Hytera Communications', 
    model: 'MD785G DMR Mobile', 
    band: 'DMR', 
    equipmentType: 'DMR Tier II', 
    frequencyRange: '136-174 / 400-470', 
    txPowerDBm: 47, 
    rxSensitivityDBm: -118, 
    channelSpacingKHz: 12.5, 
    antennaConnector: 'BNC / PL-259', 
    notes: 'Vehicular & Fixed Station DMR Transceiver with GPS & Telemetry',
    dmrTimeslots: 2,
    colorCode: 1,
    vocoder: 'NVOC / AMBE+2',
    duplexShiftMHz: 5.0
  },
  { 
    id: 'e3', 
    manufacturer: 'Harris Corporation', 
    model: 'Falcon III AN/PRC-152A', 
    band: 'SDR', 
    equipmentType: 'Tactical SDR', 
    frequencyRange: '30-512', 
    txPowerDBm: 37, 
    rxSensitivityDBm: -116, 
    channelSpacingKHz: 25, 
    antennaConnector: 'TNC 50-Ohm', 
    notes: 'Wideband Tactical Software Defined Radio (ANW2, SINCGARS, HaveQuick)',
    sdrBandwidthMHz: 5.0,
    sdrSamplingRateMSps: 20.0,
    waveform: 'ANW2C / CPM Tactical',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'e4', 
    manufacturer: 'Ettus Research / NI', 
    model: 'USRP X310 SDR', 
    band: 'SDR', 
    equipmentType: 'Wideband SDR', 
    frequencyRange: '10-6000', 
    txPowerDBm: 30, 
    rxSensitivityDBm: -125, 
    channelSpacingKHz: 1400, 
    antennaConnector: 'SMA 50-Ohm', 
    notes: 'High-Performance 2x2 MIMO Software Defined Radio with dual 14-bit ADC',
    sdrBandwidthMHz: 20.0,
    sdrSamplingRateMSps: 100.0,
    waveform: 'COFDM / QPSK / 16-QAM',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'e5', 
    manufacturer: 'Motorola', 
    model: 'MTR3000 Base Station', 
    band: 'VHF', 
    equipmentType: 'Analog FM', 
    frequencyRange: '136-174', 
    txPowerDBm: 50, 
    rxSensitivityDBm: -119, 
    channelSpacingKHz: 25, 
    antennaConnector: 'N-Type', 
    notes: 'Continuous Duty High Power VHF Base Station (100W)',
    duplexShiftMHz: 0.6
  },
  { 
    id: 'e6', 
    manufacturer: 'Kenwood Communications', 
    model: 'NXR-710 NexEdge', 
    band: 'VHF', 
    equipmentType: 'Digital Repeater', 
    frequencyRange: '136-174', 
    txPowerDBm: 44, 
    rxSensitivityDBm: -118, 
    channelSpacingKHz: 12.5, 
    antennaConnector: 'N-Type', 
    notes: 'NXDN / Analog Mixed Mode Digital Repeater',
    duplexShiftMHz: 4.6
  },
  { 
    id: 'e7', 
    manufacturer: 'Cambium Networks', 
    model: 'PTP 670 Backhaul', 
    band: 'Microwave', 
    equipmentType: 'Microwave Backhaul', 
    frequencyRange: '4900-6050', 
    txPowerDBm: 27, 
    rxSensitivityDBm: -95, 
    channelSpacingKHz: 20000, 
    antennaConnector: 'Integrated / Dual N-Type', 
    notes: 'High Capacity Point-to-Point Backhaul with Dynamic Spectrum Optimization',
    duplexShiftMHz: 28.0
  },
  { 
    id: 'm1', 
    manufacturer: 'L3Harris', 
    model: 'Falcon III AN/PRC-117G', 
    band: 'Multiband', 
    equipmentType: 'Manpack SDR', 
    frequencyRange: '30-2000', 
    txPowerDBm: 43, // 20 Watts
    rxSensitivityDBm: -118, 
    channelSpacingKHz: 25, 
    antennaConnector: 'BNC / Type-N', 
    notes: 'Wideband Networking Manpack SDR (ANW2, SINCGARS, SATCOM)',
    sdrBandwidthMHz: 5.0,
    sdrSamplingRateMSps: 20.0,
    waveform: 'ANW2C / SRW / MUOS',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'm2', 
    manufacturer: 'L3Harris', 
    model: 'Falcon IV AN/PRC-163', 
    band: 'Multiband', 
    equipmentType: 'Handheld SDR', 
    frequencyRange: '30-2600', 
    txPowerDBm: 37, // 5 Watts
    rxSensitivityDBm: -117, 
    channelSpacingKHz: 25, 
    antennaConnector: 'TNC', 
    notes: 'Multi-channel Handheld SDR (Dual-channel, ISR video capable)',
    sdrBandwidthMHz: 10.0,
    sdrSamplingRateMSps: 40.0,
    waveform: 'TrellisWare TSM / SRW / SINCGARS',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'm3', 
    manufacturer: 'Thales', 
    model: 'AN/PRC-148 JEM', 
    band: 'Multiband', 
    equipmentType: 'Handheld SDR', 
    frequencyRange: '30-512', 
    txPowerDBm: 37, // 5 Watts
    rxSensitivityDBm: -116, 
    channelSpacingKHz: 25, 
    antennaConnector: 'TNC', 
    notes: 'Multiband Inter/Intra Team Radio (MBITR)',
    sdrBandwidthMHz: 2.5,
    sdrSamplingRateMSps: 10.0,
    waveform: 'SINCGARS / HAVEQUICK II / ANDVT',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'm4', 
    manufacturer: 'Aselsan', 
    model: '9661 HF SDR', 
    band: 'HF', 
    equipmentType: 'HF SDR', 
    frequencyRange: '1.6-30', 
    txPowerDBm: 43, // 20 Watts (Manpack)
    rxSensitivityDBm: -125, 
    channelSpacingKHz: 3, 
    antennaConnector: 'BNC', 
    notes: 'Software Defined HF Radio with ALE (Automatic Link Establishment) and Frequency Hopping',
    sdrBandwidthMHz: 0.024,
    sdrSamplingRateMSps: 2.0,
    waveform: 'STANAG 4539 / ALE 3G / BLOS',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'm5', 
    manufacturer: 'Codan', 
    model: 'Envoy X2', 
    band: 'HF', 
    equipmentType: 'HF SDR', 
    frequencyRange: '1.6-30', 
    txPowerDBm: 50, // 100 Watts (Base/Vehicle)
    rxSensitivityDBm: -125, 
    channelSpacingKHz: 3, 
    antennaConnector: 'UHF (SO-239)', 
    notes: 'Digital HF SDR with 3G ALE, Digital Voice, and IP networking over HF',
    sdrBandwidthMHz: 0.024,
    sdrSamplingRateMSps: 2.5,
    waveform: 'MIL-STD-188-141B ALE',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'm6', 
    manufacturer: 'Barrett', 
    model: '4050 HF SDR', 
    band: 'HF', 
    equipmentType: 'HF SDR', 
    frequencyRange: '1.5-30', 
    txPowerDBm: 51, // 150 Watts (Base/Vehicle)
    rxSensitivityDBm: -124, 
    channelSpacingKHz: 3, 
    antennaConnector: 'UHF (SO-239)', 
    notes: 'Advanced HF SDR Transceiver with touchscreen and multi-language IP network capabilities',
    sdrBandwidthMHz: 0.024,
    sdrSamplingRateMSps: 2.5,
    waveform: '2G/3G ALE / Frequency Hopping',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'm7', 
    manufacturer: 'Rockwell Collins', 
    model: 'AN/ARC-210 (Gen 6)', 
    band: 'Multiband', 
    equipmentType: 'Airborne SDR', 
    frequencyRange: '30-941', 
    txPowerDBm: 43, // 20-25 Watts typically
    rxSensitivityDBm: -115, 
    channelSpacingKHz: 25, 
    antennaConnector: 'Type-N / TNC', 
    notes: 'Advanced Airborne SDR. Supports SATCOM, HAVEQUICK, SINCGARS, and Link 16 interoperability.',
    sdrBandwidthMHz: 5.0,
    sdrSamplingRateMSps: 40.0,
    waveform: 'SATCOM / SINCGARS / HQ',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'm8', 
    manufacturer: 'Elbit Systems', 
    model: 'E-LynX Manpack', 
    band: 'Multiband', 
    equipmentType: 'Manpack SDR', 
    frequencyRange: '30-2000', 
    txPowerDBm: 43, // 20 Watts
    rxSensitivityDBm: -117, 
    channelSpacingKHz: 25, 
    antennaConnector: 'BNC / TNC', 
    notes: 'Multi-domain tactical SDR, concurrent voice/data, mobile ad-hoc networking (MANET)',
    sdrBandwidthMHz: 10.0,
    sdrSamplingRateMSps: 30.0,
    waveform: 'E-LynX MANET / ECCM',
    duplexShiftMHz: 0.0
  },
  { 
    id: 'm9', 
    manufacturer: 'Rohde & Schwarz', 
    model: 'SOVERON D (M3TR)', 
    band: 'Multiband', 
    equipmentType: 'Tactical SDR', 
    frequencyRange: '1.5-512', 
    txPowerDBm: 47, // 50 Watts (Vehicle config)
    rxSensitivityDBm: -120, 
    channelSpacingKHz: 25, 
    antennaConnector: 'Type-N', 
    notes: 'High-security multi-band/multi-role SDR for joint operations. EPM and high data rate.',
    sdrBandwidthMHz: 5.0,
    sdrSamplingRateMSps: 20.0,
    waveform: 'SECOS / R&S HDR',
    duplexShiftMHz: 0.0
  }
];

const defaultSites: Site[] = [
  { 
    id: 's1', 
    name: 'SITE-01 (Islamabad HQ)', 
    lat: 33.6844, 
    lng: 73.0479, 
    elevation: 508, 
    type: 'base-station', 
    radioType: 'base', 
    equipmentType: 'DMR', 
    txPowerW: 50, 
    txFreqMHz: 155.500, 
    rxFreqMHz: 150.900,
    duplexOffsetMHz: 4.600,
    dmrColorCode: 1,
    dmrTimeSlot: 1,
    channelSpacingKHz: 12.5
  },
  { 
    id: 's2', 
    name: 'REPEATER-01 (Murree Ridge)', 
    lat: 33.9070, 
    lng: 73.3943, 
    elevation: 2291, 
    type: 'repeater', 
    radioType: 'base', 
    equipmentType: 'DMR', 
    txPowerW: 50, 
    txFreqMHz: 155.500, 
    rxFreqMHz: 150.900,
    duplexOffsetMHz: 4.600,
    dmrColorCode: 1,
    dmrTimeSlot: 2,
    channelSpacingKHz: 12.5
  },
  { 
    id: 's3', 
    name: 'SITE-02 (Rawalpindi Tactical)', 
    lat: 33.5973, 
    lng: 73.0479, 
    elevation: 500, 
    type: 'base-station', 
    radioType: 'vehicular', 
    equipmentType: 'SDR', 
    txPowerW: 25, 
    txFreqMHz: 158.250, 
    rxFreqMHz: 158.250,
    duplexOffsetMHz: 0.000,
    sdrBandwidthMHz: 5.0,
    channelSpacingKHz: 25.0
  },
];

const defaultLinks: RFLink[] = [
  { 
    id: 'l1', 
    sourceSiteId: 's1', 
    targetSiteId: 's2', 
    equipmentId: 'e1', 
    equipmentType: 'DMR',
    distanceKm: 40.5, 
    frequencyMHz: 155.500, 
    txFreqMHz: 155.500,
    rxFreqMHz: 150.900,
    duplexOffsetMHz: 4.600,
    channelBandwidthKHz: 12.5,
    modulationType: 'DMR 4FSK',
    txPowerDBm: 47, 
    txAntennaGainDBi: 6, 
    rxAntennaGainDBi: 6, 
    txCableLossDB: 1.5, 
    rxCableLossDB: 1.5, 
    fadeMarginDB: 20 
  },
  { 
    id: 'l2', 
    sourceSiteId: 's2', 
    targetSiteId: 's3', 
    equipmentId: 'e2', 
    equipmentType: 'DMR',
    distanceKm: 45.2, 
    frequencyMHz: 158.250, 
    txFreqMHz: 158.250,
    rxFreqMHz: 153.650,
    duplexOffsetMHz: 4.600,
    channelBandwidthKHz: 12.5,
    modulationType: 'DMR 4FSK',
    txPowerDBm: 47, 
    txAntennaGainDBi: 6, 
    rxAntennaGainDBi: 6, 
    txCableLossDB: 1.5, 
    rxCableLossDB: 1.5, 
    fadeMarginDB: 20 
  },
];

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  
  const [sites, setSites] = useState<Site[]>(() => {
    const saved = localStorage.getItem('rf-sites');
    return saved ? JSON.parse(saved) : defaultSites;
  });
  
  const [links, setLinks] = useState<RFLink[]>(() => {
    const saved = localStorage.getItem('rf-links');
    return saved ? JSON.parse(saved) : defaultLinks;
  });
  
  const [equipmentDB, setEquipmentDB] = useState<Equipment[]>(() => {
    const saved = localStorage.getItem('rf-equipment');
    return saved ? JSON.parse(saved) : defaultEquipment;
  });

  useEffect(() => {
    localStorage.setItem('rf-sites', JSON.stringify(sites));
  }, [sites]);

  useEffect(() => {
    localStorage.setItem('rf-links', JSON.stringify(links));
  }, [links]);

  useEffect(() => {
    localStorage.setItem('rf-equipment', JSON.stringify(equipmentDB));
  }, [equipmentDB]);

  const [theme, setTheme] = useState<Theme>('light');
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const addSite = (site: Site) => setSites(prev => [...prev, site]);
  
  const removeSite = (id: string) => {
    setSites(prev => prev.filter(s => s.id !== id));
    // Remove links connected to the deleted site
    setLinks(prev => prev.filter(l => l.sourceSiteId !== id && l.targetSiteId !== id));
  };
  
  const updateSite = (updatedSite: Site) => {
    setSites(prev => prev.map(s => s.id === updatedSite.id ? updatedSite : s));
  };

  const addLink = (link: RFLink) => setLinks(prev => [...prev, link]);
  
  const updateLink = (updatedLink: RFLink) => {
    setLinks(prev => prev.map(l => l.id === updatedLink.id ? updatedLink : l));
  };

  const addEquipment = (eq: Equipment) => setEquipmentDB(prev => [...prev, eq]);
  
  const updateEquipment = (updatedEq: Equipment) => {
    setEquipmentDB(prev => prev.map(e => e.id === updatedEq.id ? updatedEq : e));
  };
  
  const removeEquipment = (id: string) => {
    setEquipmentDB(prev => prev.filter(e => e.id !== id));
  };

  const clearAllSites = () => {
    setSites([]);
    setLinks([]);
  };

  const batchUpdateFrequencies = (update: FrequencyBatchUpdate) => {
    if (update.sites && update.sites.length > 0) {
      setSites(prev => prev.map(site => {
        const match = update.sites?.find(u => u.id === site.id);
        if (match) {
          return {
            ...site,
            txFreqMHz: match.txFreqMHz,
            rxFreqMHz: match.rxFreqMHz,
            duplexOffsetMHz: match.duplexOffsetMHz ?? site.duplexOffsetMHz,
            equipmentType: match.equipmentType ?? site.equipmentType,
            dmrColorCode: match.dmrColorCode ?? site.dmrColorCode
          };
        }
        return site;
      }));
    }

    if (update.links && update.links.length > 0) {
      setLinks(prev => prev.map(link => {
        const match = update.links?.find(u => u.id === link.id);
        if (match) {
          return {
            ...link,
            frequencyMHz: match.frequencyMHz,
            txFreqMHz: match.txFreqMHz ?? match.frequencyMHz,
            rxFreqMHz: match.rxFreqMHz ?? match.frequencyMHz,
            duplexOffsetMHz: match.duplexOffsetMHz ?? link.duplexOffsetMHz,
            modulationType: match.modulationType ?? link.modulationType,
            equipmentType: match.equipmentType ?? link.equipmentType
          };
        }
        return link;
      }));
    }
  };

  const exportBackup = () => {
    const data = { sites, links, equipmentDB };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rf-network-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (jsonData: string) => {
    try {
      const data = JSON.parse(jsonData);
      if (data.sites) setSites(data.sites);
      if (data.links) setLinks(data.links);
      if (data.equipmentDB) setEquipmentDB(data.equipmentDB);
      alert('Backup imported successfully!');
    } catch (e) {
      console.error("Failed to parse backup data", e);
      alert("Failed to parse backup file.");
    }
  };

  return (
    <AppContext.Provider value={{
      currentView, setCurrentView,
      sites, addSite, removeSite, updateSite, clearAllSites,
      links, addLink, updateLink,
      equipmentDB, addEquipment, updateEquipment, removeEquipment,
      batchUpdateFrequencies,
      theme, setTheme, toggleTheme,
      isAboutModalOpen, setIsAboutModalOpen,
      exportBackup, importBackup
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
