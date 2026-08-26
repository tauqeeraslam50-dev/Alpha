const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('rnmsOffline', {
  isElectron: true,
  selectMapFolder: () => ipcRenderer.invoke('offline:select-folder'),
  scanMapFolder: (folder) => ipcRenderer.invoke('offline:scan-folder', folder),
  selectMapFile: () => ipcRenderer.invoke('offline:select-file'),
  getDefaultMapFolder: () => ipcRenderer.invoke('offline:get-default-folder')
});
