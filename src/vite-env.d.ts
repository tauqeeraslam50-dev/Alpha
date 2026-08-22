/// <reference types="vite/client" />

declare module '*.png' { const content: string; export default content; }
declare module '*.jpg' { const content: string; export default content; }
declare module '*.svg' { const content: string; export default content; }

declare global {
  interface Window {
    rnmsOffline?: {
      getMapInfo: () => Promise<any>;
      loadDemTile: (tileName: string) => Promise<{ name: string; buffer: ArrayBuffer; size: number } | null>;
      listDemTiles: () => Promise<string[]>;
      selectMapFiles?: () => Promise<string[] | null>;
      selectDemFolder?: () => Promise<string | null>;
      installMapFiles?: (files: string[]) => Promise<any>;
      installDemFolder?: (folder: string) => Promise<any>;
      removeMapAsset?: (name: string) => Promise<any>;
      validateAssets?: () => Promise<any>;
      readPMTilesRange?: (fileName: string, start: number, length: number) => Promise<ArrayBuffer>;
      onMapUploadProgress?: (callback: (progress: {
        fileName: string;
        copiedBytes: number;
        totalBytes: number;
        percent: number;
        speedBytesPerSecond: number;
        status: 'uploading' | 'complete' | 'failed';
        error?: string;
      }) => void) => (() => void) | undefined;
    };
  }
}

export {};
