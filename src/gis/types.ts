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
  satellitePMTilesAvailable?: boolean;
  terrainPMTilesAvailable?: boolean;
  folderSatelliteAvailable?: boolean;
  folderStreetAvailable?: boolean;
  folderTerrainAvailable?: boolean;
  labelsAvailable?: boolean;
  metadataAvailable?: boolean;
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



