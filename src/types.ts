export type View =
  | 'dashboard'
  | 'gis-map'
  | 'sites'
  | 'rf-links'
  | 'frequency'
  | 'coverage'
  | 'microwave'
  | 'simulation'
  | 'terrain'
  | 'reports'
  | 'database';

export interface Site {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevation: number;
  type: 'repeater' | 'base-station' | 'subscriber' | 'microwave-node';
}

export interface Equipment {
  id: string;
  manufacturer: string;
  model: string;
  band: 'VHF' | 'UHF' | 'Microwave';
  frequencyRange: string;
  txPowerDBm: number;
  rxSensitivityDBm: number;
  channelSpacingKHz: number;
  antennaConnector: string;
  notes: string;
}

export interface RFLink {
  id: string;
  sourceSiteId: string;
  targetSiteId: string;
  equipmentId: string | null;
  distanceKm: number;
  frequencyMHz: number;
  txPowerDBm: number;
  txAntennaGainDBi: number;
  rxAntennaGainDBi: number;
  txCableLossDB: number;
  rxCableLossDB: number;
  fadeMarginDB: number;
}
