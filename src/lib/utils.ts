import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Math/RF Utils
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateEarthBulge(d1Km: number, d2Km?: number, kFactor: number = 1.333): number {
  // If d2Km is not provided, calculate max bulge at midpoint
  if (d2Km === undefined) {
    d2Km = d1Km / 2;
    d1Km = d1Km / 2;
  }
  // Earth bulge in meters at a specific point along the path
  // h = (d1 * d2) / (12.74 * K)
  return (d1Km * d2Km) / (12.74 * kFactor);
}

export function calculateFresnelZone(distanceKm: number, frequencyMHz: number, n: number = 1): number {
  if (distanceKm <= 0 || frequencyMHz <= 0) return 0;
  // Maximum n-th Fresnel zone radius at the midpoint of the path
  // F_n = 8.66 * sqrt( (n * distanceKm) / (frequencyMHz / 1000) )
  const freqGHz = frequencyMHz / 1000;
  return 8.66 * Math.sqrt((n * distanceKm) / freqGHz);
}

export function calculateFSPL(distanceKm: number, frequencyMHz: number): number {
  if (distanceKm <= 0 || frequencyMHz <= 0) return 0;
  // Free Space Path Loss = 20 * log10(d) + 20 * log10(f) + 32.44
  return 20 * Math.log10(distanceKm) + 20 * Math.log10(frequencyMHz) + 32.44;
}

export function calculateReceivedPower(link: any, fspl: number): number {
  // Prx = Ptx + Gtx + Grx - Ltx_cable - Lrx_cable - FSPL
  return link.txPowerDBm + link.txAntennaGainDBi + link.rxAntennaGainDBi - link.txCableLossDB - link.rxCableLossDB - fspl;
}

/**
 * Radio Horizon Calculation taking into account standard atmospheric refraction (k=4/3)
 * @param ht_m Transmitter antenna height in meters above ground level
 * @param hr_m Receiver antenna height in meters above ground level
 * @param kFactor Atmospheric refraction index (default 1.333)
 * @returns Horizon distance in kilometers
 */
export function calculateRadioHorizon(ht_m: number, hr_m: number, kFactor: number = 1.333): number {
  const safeHt = Math.max(ht_m, 1);
  const safeHr = Math.max(hr_m, 1);
  // d_horizon (km) = 3.57 * sqrt(k) * (sqrt(h1) + sqrt(h2)) = 4.124 * (sqrt(h1) + sqrt(h2))
  return 3.57 * Math.sqrt(kFactor) * (Math.sqrt(safeHt) + Math.sqrt(safeHr));
}

/**
 * Okumura-Hata empirical path loss model for VHF/UHF Land Mobile & Base station communications (150 - 1500 MHz)
 */
export function calculateHataDistance(
  allowableLossDB: number, 
  freqMHz: number, 
  ht_m: number, 
  hr_m: number, 
  env: 'urban' | 'suburban' | 'rural' | 'dense-urban' = 'suburban'
): number {
  const f = Math.min(Math.max(freqMHz, 100), 2000);
  const ht = Math.min(Math.max(ht_m, 5), 300); // Base height 5m to 300m
  const hr = Math.min(Math.max(hr_m, 1), 20);  // Mobile height 1m to 20m

  // Mobile antenna correction factor a(hm)
  const aHm = (1.1 * Math.log10(f) - 0.7) * hr - (1.56 * Math.log10(f) - 0.8);

  // Urban basic loss constant A
  let A = 69.55 + 26.16 * Math.log10(f) - 13.82 * Math.log10(ht) - aHm;
  
  if (env === 'suburban') {
    A = A - 2 * Math.pow(Math.log10(f / 28), 2) - 5.4;
  } else if (env === 'rural') {
    A = A - 4.78 * Math.pow(Math.log10(f), 2) + 18.33 * Math.log10(f) - 40.94;
  } else if (env === 'dense-urban') {
    A = A + 3.0; // Additional building penetration and multi-path clutter
  }

  const B = 44.9 - 6.55 * Math.log10(ht);

  if (allowableLossDB <= A) {
    return 0.1; // Below 100 meters
  }

  const log10d = (allowableLossDB - A) / B;
  const d = Math.pow(10, log10d);
  return Math.max(d, 0.1);
}

/**
 * Egli Propagation Model (Standard for VHF/UHF tactical rolling terrain 30 - 1000 MHz)
 */
export function calculateEgliDistance(allowableLossDB: number, freqMHz: number, ht_m: number, hr_m: number): number {
  const f = Math.min(Math.max(freqMHz, 30), 1000);
  const ht = Math.max(ht_m, 1);
  const hr = Math.max(hr_m, 1);

  // PL = 20*log10(f) + 40*log10(d) - 20*log10(ht) - 20*log10(hr) + 85.9
  const log10d = (allowableLossDB - 20 * Math.log10(f) + 20 * Math.log10(ht) + 20 * Math.log10(hr) - 85.9) / 40;
  const d = Math.pow(10, log10d);
  return Math.max(d, 0.1);
}

export interface RealisticRangeParams {
  txPowerDBm: number;
  txGainDBi: number;
  rxGainDBi: number;
  txLossDB: number;
  rxLossDB: number;
  rxSensDBm: number;
  fadeMarginDB: number;
  freqMHz: number;
  ht_m?: number;
  hr_m?: number;
  environment?: string; // 'los' | 'rural' | 'suburban' | 'urban' | 'dense-urban'
}

/**
 * Computes realistic communication distances and coverage boundaries based on standard
 * ITU-R P.1546 / Okumura-Hata / Egli models, incorporating earth curvature and diffraction limits.
 */
export function calculateRealisticRange(params: RealisticRangeParams): {
  reliableRangeKm: number;
  maxRangeKm: number;
  radioHorizonKm: number;
  modelUsed: string;
} {
  const ht = params.ht_m && params.ht_m > 0 ? params.ht_m : 30; // default 30m tower
  const hr = params.hr_m && params.hr_m > 0 ? params.hr_m : 2;  // default 2m receiver
  const env = params.environment || 'suburban';

  // 1. Calculate Radio Horizon (Earth Curvature)
  const radioHorizon = calculateRadioHorizon(ht, hr);
  // Maximum diffraction propagation distance beyond the optical/radio horizon (typically ~1.25x - 1.35x horizon)
  const diffractionHorizonLimit = radioHorizon * 1.35;

  // 2. Link Budget Max Allowable Path Loss
  const eirp = params.txPowerDBm + params.txGainDBi - params.txLossDB;
  const totalMaxLoss = eirp + params.rxGainDBi - params.rxLossDB - params.rxSensDBm;
  const reliableLoss = totalMaxLoss - params.fadeMarginDB;

  let maxDist = 0;
  let reliableDist = 0;
  let modelUsed = 'Okumura-Hata';

  if (env === 'los' || params.freqMHz >= 2500) {
    // Microwave or direct Line-Of-Sight
    modelUsed = params.freqMHz >= 2500 ? 'Free Space LOS (Microwave)' : 'Free Space LOS';
    const calculateDistanceFSPL = (pl: number) => {
      const log10d = (pl - 20 * Math.log10(params.freqMHz) - 32.44) / 20;
      return Math.pow(10, log10d);
    };
    maxDist = Math.min(calculateDistanceFSPL(totalMaxLoss), diffractionHorizonLimit);
    reliableDist = Math.min(calculateDistanceFSPL(reliableLoss), diffractionHorizonLimit);
  } else if (params.freqMHz < 150) {
    // VHF Low / High tactical band using Egli
    modelUsed = 'Egli Rolling Terrain';
    const dMaxEgli = calculateEgliDistance(totalMaxLoss, params.freqMHz, ht, hr);
    const dRelEgli = calculateEgliDistance(reliableLoss, params.freqMHz, ht, hr);
    maxDist = Math.min(dMaxEgli, diffractionHorizonLimit);
    reliableDist = Math.min(dRelEgli, diffractionHorizonLimit);
  } else {
    // VHF High / UHF (150 MHz - 2400 MHz) using Okumura-Hata
    modelUsed = `Okumura-Hata (${env})`;
    const hataEnv = (env === 'dense-urban' ? 'dense-urban' : env === 'urban' ? 'urban' : env === 'rural' ? 'rural' : 'suburban');
    const dMaxHata = calculateHataDistance(totalMaxLoss, params.freqMHz, ht, hr, hataEnv);
    const dRelHata = calculateHataDistance(reliableLoss, params.freqMHz, ht, hr, hataEnv);
    maxDist = Math.min(dMaxHata, diffractionHorizonLimit);
    reliableDist = Math.min(dRelHata, diffractionHorizonLimit);
  }

  return {
    reliableRangeKm: Math.max(Number(reliableDist.toFixed(2)), 0.1),
    maxRangeKm: Math.max(Number(maxDist.toFixed(2)), 0.1),
    radioHorizonKm: Number(radioHorizon.toFixed(1)),
    modelUsed
  };
}

/**
 * Calculates path loss (dB) at a specific distance using the selected model
 */
export function calculatePathLossAtDistance(
  distKm: number,
  freqMHz: number,
  ht_m: number = 30,
  hr_m: number = 2,
  env: string = 'suburban'
): number {
  if (distKm <= 0.05) return calculateFSPL(0.05, freqMHz);

  const f = Math.min(Math.max(freqMHz, 30), 2000);
  const ht = Math.min(Math.max(ht_m, 1), 300);
  const hr = Math.min(Math.max(hr_m, 1), 20);

  let pl = 0;
  if (env === 'los' || freqMHz >= 2500) {
    pl = calculateFSPL(distKm, freqMHz);
  } else if (freqMHz < 150) {
    // Egli Model: PL = 20*log10(f) + 40*log10(d) - 20*log10(ht) - 20*log10(hr) + 85.9
    pl = 20 * Math.log10(f) + 40 * Math.log10(distKm) - 20 * Math.log10(ht) - 20 * Math.log10(hr) + 85.9;
    pl = Math.max(pl, calculateFSPL(distKm, freqMHz));
  } else {
    // Okumura-Hata Model
    const aHm = (1.1 * Math.log10(f) - 0.7) * hr - (1.56 * Math.log10(f) - 0.8);
    let A = 69.55 + 26.16 * Math.log10(f) - 13.82 * Math.log10(ht) - aHm;

    if (env === 'suburban') {
      A = A - 2 * Math.pow(Math.log10(f / 28), 2) - 5.4;
    } else if (env === 'rural') {
      A = A - 4.78 * Math.pow(Math.log10(f), 2) + 18.33 * Math.log10(f) - 40.94;
    } else if (env === 'dense-urban') {
      A = A + 3.0;
    }

    const B = 44.9 - 6.55 * Math.log10(ht);
    pl = A + B * Math.log10(distKm);
    pl = Math.max(pl, calculateFSPL(distKm, freqMHz));
  }

  // Earth Curvature / Diffraction Penalty (Massive loss beyond Radio Horizon)
  const radioHorizon = calculateRadioHorizon(ht, hr);
  if (distKm > radioHorizon) {
    const excessDist = distKm - radioHorizon;
    // Add 1 to 2 dB of diffraction loss per km beyond horizon
    // Frequencies > 1GHz suffer more severe diffraction loss
    const diffractionPenaltyPerKm = freqMHz > 1000 ? 2.0 : 1.0; 
    pl += (excessDist * diffractionPenaltyPerKm);
  }

  return pl;
}

/**
 * Calculates received signal power (dBm) at a specific distance
 */
export function calculateRSSIAtDistance(
  distKm: number,
  txPowerDBm: number,
  txGainDBi: number,
  rxGainDBi: number,
  txLossDB: number,
  rxLossDB: number,
  freqMHz: number,
  ht_m: number = 30,
  hr_m: number = 2,
  env: string = 'suburban'
): number {
  const pl = calculatePathLossAtDistance(distKm, freqMHz, ht_m, hr_m, env);
  return txPowerDBm + txGainDBi + rxGainDBi - txLossDB - rxLossDB - pl;
}

/**
 * Bearing from point 1 to point 2 in degrees (0 - 360)
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const phi1 = lat1 * toRad;
  const phi2 = lat2 * toRad;
  const deltaLambda = (lon2 - lon1) * toRad;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (theta * toDeg + 360) % 360;
}

/**
 * Calculates destination point given starting point, distance (km), and bearing (deg)
 */
export function calculateDestinationPoint(
  lat: number,
  lon: number,
  distanceKm: number,
  bearingDeg: number
): { lat: number; lng: number } {
  const R = 6371; // Earth's radius in km
  const dByR = distanceKm / R;
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const phi1 = lat * toRad;
  const lambda1 = lon * toRad;
  const theta = bearingDeg * toRad;

  const sinPhi2 = Math.sin(phi1) * Math.cos(dByR) + Math.cos(phi1) * Math.sin(dByR) * Math.cos(theta);
  const phi2 = Math.asin(sinPhi2);
  const y = Math.sin(theta) * Math.sin(dByR) * Math.cos(phi1);
  const x = Math.cos(dByR) - Math.sin(phi1) * Math.sin(phi2);
  const lambda2 = lambda1 + Math.atan2(y, x);

  return {
    lat: phi2 * toDeg,
    lng: ((lambda2 * toDeg + 540) % 360) - 180
  };
}

// Export Utils
export function downloadStringAsFile(content: string, filename: string, type: string = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
