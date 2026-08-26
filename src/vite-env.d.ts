/// <reference types="vite/client" />

declare module '*.png' { const content: string; export default content; }
declare module '*.jpg' { const content: string; export default content; }
declare module '*.svg' { const content: string; export default content; }

export interface OfflineMapFile {
  name: string;
  path: string;
  relative: string;
  size: number;
  extension: string;
}

declare global {
  interface Window {
    rnmsOffline?: {
      isElectron?: boolean;
      selectMapFolder?: () => Promise<string | null>;
      scanMapFolder?: (folder: string) => Promise<OfflineMapFile[]>;
      selectMapFile?: () => Promise<string | null>;
      getDefaultMapFolder?: () => Promise<string>;
      getMapInfo?: () => Promise<any>;
      getFolderMapInfo?: () => Promise<any>;
      loadDemTile?: (tileName: string) => Promise<{ name: string; buffer: ArrayBuffer; size: number } | null>;
      listDemTiles?: () => Promise<string[]>;
      selectMapFiles?: () => Promise<string[] | null>;
      selectDemFolder?: () => Promise<string | null>;
      installMapFiles?: (files: string[]) => Promise<any>;
      installDemFolder?: (folder: string) => Promise<any>;
      removeMapAsset?: (name: string) => Promise<any>;
      validateAssets?: () => Promise<any>;
      readPMTilesRange?: (fileName: string, start: number, length: number) => Promise<ArrayBuffer>;
      readMapText?: (fileName: string) => Promise<string | null>;
      selectOfflineMapFolder?: () => Promise<string | null>;
      installOfflineMapFolder?: (folder: string) => Promise<any>;
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
