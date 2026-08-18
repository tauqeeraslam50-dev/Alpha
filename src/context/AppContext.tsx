import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Site, RFLink, Equipment, View } from '../types';

interface AppState {
  currentView: View;
  setCurrentView: (view: View) => void;
  sites: Site[];
  addSite: (site: Site) => void;
  removeSite: (id: string) => void;
  updateSite: (site: Site) => void;
  links: RFLink[];
  addLink: (link: RFLink) => void;
  updateLink: (link: RFLink) => void;
  equipmentDB: Equipment[];
}

const defaultEquipment: Equipment[] = [
  { id: 'e1', manufacturer: 'Motorola', model: 'SLR 5500', band: 'VHF', frequencyRange: '136-174', txPowerDBm: 47, rxSensitivityDBm: -119, channelSpacingKHz: 12.5, antennaConnector: 'N-Type', notes: 'Standard VHF Repeater' },
  { id: 'e2', manufacturer: 'Kenwood', model: 'NXR-710', band: 'VHF', frequencyRange: '136-174', txPowerDBm: 44, rxSensitivityDBm: -118, channelSpacingKHz: 12.5, antennaConnector: 'N-Type', notes: 'Digital Repeater' },
  { id: 'e3', manufacturer: 'Cambium', model: 'PTP 670', band: 'Microwave', frequencyRange: '4900-6050', txPowerDBm: 27, rxSensitivityDBm: -95, channelSpacingKHz: 20000, antennaConnector: 'Integrated', notes: 'High Capacity Backhaul' },
];

const defaultSites: Site[] = [
  { id: 's1', name: 'SITE-01 (Islamabad HQ)', lat: 33.6844, lng: 73.0479, elevation: 508, type: 'base-station', radioType: 'base', txPowerW: 50 },
  { id: 's2', name: 'REPEATER-01 (Murree)', lat: 33.9070, lng: 73.3943, elevation: 2291, type: 'repeater', radioType: 'base', txPowerW: 50 },
  { id: 's3', name: 'SITE-02 (Rawalpindi)', lat: 33.5973, lng: 73.0479, elevation: 500, type: 'base-station', radioType: 'vehicular', txPowerW: 25 },
];

const defaultLinks: RFLink[] = [
  { id: 'l1', sourceSiteId: 's1', targetSiteId: 's2', equipmentId: 'e1', distanceKm: 40.5, frequencyMHz: 155.5, txPowerDBm: 47, txAntennaGainDBi: 6, rxAntennaGainDBi: 6, txCableLossDB: 1.5, rxCableLossDB: 1.5, fadeMarginDB: 20 },
  { id: 'l2', sourceSiteId: 's2', targetSiteId: 's3', equipmentId: 'e1', distanceKm: 45.2, frequencyMHz: 155.5, txPowerDBm: 47, txAntennaGainDBi: 6, rxAntennaGainDBi: 6, txCableLossDB: 1.5, rxCableLossDB: 1.5, fadeMarginDB: 20 },
];

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sites, setSites] = useState<Site[]>(defaultSites);
  const [links, setLinks] = useState<RFLink[]>(defaultLinks);
  const [equipmentDB] = useState<Equipment[]>(defaultEquipment);

  const addSite = (site: Site) => setSites([...sites, site]);
  const removeSite = (id: string) => {
    setSites(sites.filter(s => s.id !== id));
    // Remove links connected to the deleted site
    setLinks(links.filter(l => l.sourceSiteId !== id && l.targetSiteId !== id));
  };
  const updateSite = (updatedSite: Site) => {
    setSites(sites.map(s => s.id === updatedSite.id ? updatedSite : s));
  };
  const addLink = (link: RFLink) => setLinks([...links, link]);

  const updateLink = (updatedLink: RFLink) => {
    setLinks(links.map(l => l.id === updatedLink.id ? updatedLink : l));
  };

  return (
    <AppContext.Provider value={{
      currentView, setCurrentView,
      sites, addSite, removeSite, updateSite,
      links, addLink, updateLink,
      equipmentDB
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
