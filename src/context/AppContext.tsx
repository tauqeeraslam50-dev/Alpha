import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Site, RFLink, Equipment, View } from '../types';

interface AppState {
  currentView: View;
  setCurrentView: (view: View) => void;
  sites: Site[];
  addSite: (site: Site) => void;
  links: RFLink[];
  addLink: (link: RFLink) => void;
  equipmentDB: Equipment[];
}

const defaultEquipment: Equipment[] = [
  { id: 'e1', manufacturer: 'Motorola', model: 'SLR 5500', band: 'VHF', frequencyRange: '136-174', txPowerDBm: 47, rxSensitivityDBm: -119, channelSpacingKHz: 12.5, antennaConnector: 'N-Type', notes: 'Standard VHF Repeater' },
  { id: 'e2', manufacturer: 'Kenwood', model: 'NXR-710', band: 'VHF', frequencyRange: '136-174', txPowerDBm: 44, rxSensitivityDBm: -118, channelSpacingKHz: 12.5, antennaConnector: 'N-Type', notes: 'Digital Repeater' },
  { id: 'e3', manufacturer: 'Cambium', model: 'PTP 670', band: 'Microwave', frequencyRange: '4900-6050', txPowerDBm: 27, rxSensitivityDBm: -95, channelSpacingKHz: 20000, antennaConnector: 'Integrated', notes: 'High Capacity Backhaul' },
];

const defaultSites: Site[] = [
  { id: 's1', name: 'SITE-01 (HQ)', lat: 34.0522, lng: -118.2437, elevation: 150, type: 'base-station' },
  { id: 's2', name: 'REPEATER-01 (Mt. Wilson)', lat: 34.2239, lng: -118.0610, elevation: 1740, type: 'repeater' },
  { id: 's3', name: 'SITE-02 (Branch)', lat: 34.1478, lng: -118.1445, elevation: 200, type: 'base-station' },
];

const defaultLinks: RFLink[] = [
  { id: 'l1', sourceSiteId: 's1', targetSiteId: 's2', equipmentId: 'e1', distanceKm: 25.4, frequencyMHz: 155.5, txPowerDBm: 47, txAntennaGainDBi: 6, rxAntennaGainDBi: 6, txCableLossDB: 1.5, rxCableLossDB: 1.5, fadeMarginDB: 20 },
  { id: 'l2', sourceSiteId: 's2', targetSiteId: 's3', equipmentId: 'e1', distanceKm: 12.2, frequencyMHz: 155.5, txPowerDBm: 47, txAntennaGainDBi: 6, rxAntennaGainDBi: 6, txCableLossDB: 1.5, rxCableLossDB: 1.5, fadeMarginDB: 20 },
];

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [sites, setSites] = useState<Site[]>(defaultSites);
  const [links, setLinks] = useState<RFLink[]>(defaultLinks);
  const [equipmentDB] = useState<Equipment[]>(defaultEquipment);

  const addSite = (site: Site) => setSites([...sites, site]);
  const addLink = (link: RFLink) => setLinks([...links, link]);

  return (
    <AppContext.Provider value={{
      currentView, setCurrentView,
      sites, addSite,
      links, addLink,
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
