import type { OfflineLayerId, OfflineMapMetadata, OfflineMapStatus } from './types';

const DEFAULT_CENTER: [number, number] = [30.3753, 69.3451];
const DEFAULT_FORMAT = 'jpg';

export class OfflineMapEngine {
  private status: OfflineMapStatus | null = null;
  private metadata: OfflineMapMetadata | null = null;

  async refresh(): Promise<OfflineMapStatus | null> {
    this.status = (await window.rnmsOffline?.getMapInfo?.()) ?? null;
    if (this.status?.metadata || this.status?.metadataAvailable) {
      const raw = await window.rnmsOffline?.readMapText?.('metadata.json');
      if (raw) {
        try { this.metadata = JSON.parse(raw) as OfflineMapMetadata; } catch { this.metadata = null; }
      }
    }
    return this.status;
  }

  getStatus() { return this.status; }
  getMetadata() { return this.metadata; }
  getDefaultCenter(): [number, number] { return DEFAULT_CENTER; }

  hasLayer(layer: OfflineLayerId): boolean {
    if (!this.status) return false;
    return Boolean(this.status[layer]);
  }

  hasFolderLayer(layer: OfflineLayerId): boolean {
    if (!this.status) return false;
    if (layer === 'satellite') return Boolean(this.status.folderSatelliteAvailable);
    if (layer === 'street') return Boolean(this.status.folderStreetAvailable);
    return Boolean(this.status.folderTerrainAvailable);
  }

  hasPMTilesLayer(layer: OfflineLayerId): boolean {
    if (!this.status) return false;
    if (layer === 'satellite') return Boolean(this.status.satellitePMTilesAvailable);
    if (layer === 'terrain') return Boolean(this.status.terrainPMTilesAvailable);
    return false;
  }

  tileUrl(layer: OfflineLayerId, z: number, x: number, y: number): string {
    const format = this.metadata?.tileFormat || DEFAULT_FORMAT;
    return `rnms://tiles/${layer}/${z}/${x}/${y}.${format}`;
  }

  labelsUrl(): string { return 'rnms://geojson/pakistan-labels.geojson'; }

  async installPackage(): Promise<boolean> {
    const folder = await window.rnmsOffline?.selectOfflineMapFolder?.();
    if (!folder) return false;
    await window.rnmsOffline?.installOfflineMapFolder?.(folder);
    await this.refresh();
    return true;
  }
}

export const offlineMapEngine = new OfflineMapEngine();
