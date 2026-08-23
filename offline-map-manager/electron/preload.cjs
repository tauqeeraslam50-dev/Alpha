const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mapManager', {
  selectMapFolder: () => ipcRenderer.invoke('select-map-folder'),
  scanMapFolder: (folder) => ipcRenderer.invoke('scan-map-folder', folder),
});
