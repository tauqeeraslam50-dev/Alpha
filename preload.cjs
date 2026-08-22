const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rnmsOffline', {
  getMapInfo: () => ipcRenderer.invoke('offline-map-info'),
  loadDemTile: (tileName) => ipcRenderer.invoke('offline-dem-tile', tileName),
  listDemTiles: () => ipcRenderer.invoke('offline-dem-list'),
  selectMapFiles: () => ipcRenderer.invoke('offline-select-map-files'),
  selectDemFolder: () => ipcRenderer.invoke('offline-select-dem-folder'),
  installMapFiles: (files) => ipcRenderer.invoke('offline-install-map-files', files),
  installDemFolder: (folder) => ipcRenderer.invoke('offline-install-dem-folder', folder),
  removeMapAsset: (name) => ipcRenderer.invoke('offline-remove-map-asset', name),
  validateAssets: () => ipcRenderer.invoke('offline-validate-assets'),
  readPMTilesRange: (fileName, start, length) => ipcRenderer.invoke('offline-read-pmtiles-range', fileName, start, length),
  onMapUploadProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('offline-map-upload-progress', listener);
    return () => ipcRenderer.removeListener('offline-map-upload-progress', listener);
  }
});
