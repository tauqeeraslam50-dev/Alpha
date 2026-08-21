/// <reference types="vite/client" />

declare module '*.png' { const content: string; export default content; }
declare module '*.jpg' { const content: string; export default content; }
declare module '*.svg' { const content: string; export default content; }

declare global {
  interface Window {
    rnmsOffline?: {
      getMapInfo: () => Promise<{
        mapsRoot: string;
        demRoot: string;
        satelliteAvailable: boolean;
        terrainAvailable: boolean;
        satellitePMTilesAvailable: boolean;
        terrainPMTilesAvailable: boolean;
        demTileCount: number;
      }>;
      loadDemTile: (tileName: string) => Promise<{ name: string; buffer: ArrayBuffer; size: number } | null>;
      listDemTiles: () => Promise<string[]>;
      selectMapFiles?: () => Promise<string[] | null>;
      selectDemFolder?: () => Promise<string | null>;
      installMapFiles?: (files: string[]) => Promise<unknown>;
      installDemFolder?: (folder: string) => Promise<unknown>;
      removeMapAsset?: (name: string) => Promise<unknown>;
      validateAssets?: () => Promise<unknown>;
    };
  }
}

export {};
