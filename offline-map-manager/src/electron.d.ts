export {};

declare global {
  interface MapManagerAPI {
    selectMapFolder: () => Promise<string | null>;
    scanMapFolder: (folder: string) => Promise<Array<{ name: string; path: string; relative: string; size: number; extension: string }>>;
  }
  interface Window {
    mapManager?: MapManagerAPI;
  }
}
