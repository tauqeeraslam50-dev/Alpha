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

export function calculateEarthBulge(distanceKm: number): number {
  // Approximate maximum earth bulge in meters at the midpoint of the path (assuming k-factor = 1.33)
  return (distanceKm * distanceKm) / (12.74 * 1.33);
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
