export type OfflineLayerId = 'satellite' | 'terrain' | 'street';

export interface OfflineMapStatus {
  mapsRoot: string;
  packageRoot: string;
  tilesRoot: string;
  satellite: boolean;
  terrain: boolean;
  street: boolean;
  labels: boolean;
  metadata: boolean;
  demTileCount: number;
  demTiles: string[];
  packageName: string;
  architecture: 'folder-tiles';
}

export interface OfflineMapMetadata {
  name?: string;
  description?: string;
  country?: string;
  bounds?: [number, number, number, number];
  minZoom?: number;
  maxZoom?: number;
  tileFormat?: 'jpg' | 'jpeg' | 'png' | 'webp';
  attribution?: string;
}

declare global {
  interface Window {
    rnmsOffline?: {
      getMapInfo?: () => Promise<Record<string, unknown>>;
      getFolderMapInfo?: () => Promise<OfflineMapStatus>;
      selectOfflineMapFolder?: () => Promise<string | null>;
      installOfflineMapFolder?: (folder: string) => Promise<OfflineMapStatus>;
      readMapText?: (fileName: string) => Promise<string | null>;
    };
  }
}
