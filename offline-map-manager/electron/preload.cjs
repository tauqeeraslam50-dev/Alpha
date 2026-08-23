const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mapManager', {
  selectMapFolder: () => ipcRenderer.invoke('select-map-folder'),
});
