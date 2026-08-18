import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Math/RF Utils
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
