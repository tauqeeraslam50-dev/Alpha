/// <reference types="vite/client" />

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module '*.svg' {
  const content: string;
  export default content;
}

declare global {
  interface Window {
    rnmsOffline?: {
      getMapInfo: () => Promise<{
        mapsRoot: string;
        demRoot: string;
        satelliteAvailable: boolean;
        terrainAvailable: boolean;
        demTileCount: number;
      }>;
      loadDemTile: (tileName: string) => Promise<{ name: string; buffer: ArrayBuffer; size: number } | null>;
      listDemTiles: () => Promise<string[]>;
    };
  }
}

export {};
