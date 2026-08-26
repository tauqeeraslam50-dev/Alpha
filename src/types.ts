export type View =
  | 'dashboard'
  | 'map'
  | 'sites'
  | 'equipment'
  | 'rf-links'
  | 'frequency'
  | 'coverage'
  | 'microwave'
  | 'simulation'
  | 'terrain'
  | 'los'
  | 'reports'
  | 'database';

export interface Site {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevation: number;
  type: 'repeater' | 'base-station' | 'subscriber' | 'microwave-node' | 'relay';
  status?: 'online' | 'offline' | 'standby';
  antennaHeightM?: number;
  antennaGainDBi?: number;
  radioType?: 'base' | 'vehicular' | 'walkie-talkie' | 'custom';
  equipmentType?: 'VHF' | 'UHF' | 'DMR' | 'SDR' | 'Microwave';
  txPowerW?: number;
  txFreqMHz?: number;
  rxFreqMHz?: number;
  duplexOffsetMHz?: number;
  dmrColorCode?: number;
  dmrTimeSlot?: 1 | 2;
  sdrBandwidthMHz?: number;
  channelSpacingKHz?: number;
}

export interface Equipment {
  id: string;
  manufacturer: string;
  model: string;
  band: 'HF' | 'VHF' | 'UHF' | 'Microwave' | 'DMR' | 'SDR' | 'Multiband';
  equipmentType?: 'DMR Tier II' | 'DMR Tier III' | 'Tactical SDR' | 'Wideband SDR' | 'Analog FM' | 'Digital Repeater' | 'Microwave Backhaul' | 'HF SDR' | 'Manpack SDR' | 'Handheld SDR' | 'Airborne SDR';
  frequencyRange: string;
  txPowerDBm: number;
  rxSensitivityDBm: number;
  channelSpacingKHz: number;
  antennaConnector: string;
  notes: string;
  dmrTimeslots?: number;
  colorCode?: number;
  vocoder?: string;
  sdrBandwidthMHz?: number;
  sdrSamplingRateMSps?: number;
  waveform?: string;
  duplexShiftMHz?: number;
}

export interface RFLink {
  id: string;
  sourceSiteId: string;
  targetSiteId: string;
  equipmentId: string | null;
  equipmentType?: 'VHF' | 'UHF' | 'Microwave' | 'DMR' | 'SDR';
  distanceKm: number;
  frequencyMHz: number;
  txFreqMHz?: number;
  rxFreqMHz?: number;
  duplexOffsetMHz?: number;
  channelBandwidthKHz?: number;
  modulationType?: 'Analog FM' | 'DMR 4FSK' | 'SDR QPSK' | 'SDR 16QAM' | 'QPSK' | '16QAM' | '64QAM' | '256QAM';
  txPowerDBm: number;
  txAntennaGainDBi: number;
  rxAntennaGainDBi: number;
  txCableLossDB: number;
  rxCableLossDB: number;
  fadeMarginDB: number;
}
