const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rnmsOffline', {
  getMapInfo: () => ipcRenderer.invoke('offline-map-info'),
  loadDemTile: (tileName) => ipcRenderer.invoke('offline-dem-tile', tileName),
  listDemTiles: () => ipcRenderer.invoke('offline-dem-list')
});
