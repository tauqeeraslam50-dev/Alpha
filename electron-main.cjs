const { app, BrowserWindow, Menu, shell, dialog, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const LOCAL_SCHEME = 'local-pmtiles';

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 1024, minHeight: 700, title: 'Radio Network Management System v1.0', backgroundColor: '#0f172a', backgroundThrottling: false, autoHideMenuBar: false, webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'electron-preload.cjs'), webSecurity: true, allowRunningInsecureContent: false } });
  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(distPath)) mainWindow.loadFile(distPath); else if (fs.existsSync(rootPath)) mainWindow.loadFile(rootPath); else mainWindow.loadURL('http://localhost:3000');
  const template = [
    { label: 'File', submenu: [{ label: 'Reload Workspace', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() }, { type: 'separator' }, { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.toggleDevTools() }] },
    { label: 'Help', submenu: [{ label: 'About RNMS v1.0', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'Radio Network Management System v1.0', message: 'Radio Network Management System (RNMS) v1.0\\nDeveloped by Tauqeer Aslam\\n\\nIntegrated offline GIS engine.' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('http:') || url.startsWith('https:')) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function scanFolder(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  const root = path.resolve(folder); const files = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(pmtiles|mbtiles|hgt|tif|tiff|geojson)$/i.test(entry.name)) { const stat = fs.statSync(full); files.push({ name: entry.name, path: full, relative: path.relative(root, full), size: stat.size, extension: path.extname(entry.name).toLowerCase() }); } } };
  walk(root); return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

app.whenReady().then(() => {
  protocol.handle(LOCAL_SCHEME, async (request) => {
    try {
      const filePath = path.resolve(decodeURIComponent(request.url.slice(`${LOCAL_SCHEME}://`.length)));
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return new Response('Not found', { status: 404 });
      const stat = fs.statSync(filePath); const range = request.headers.get('range'); let start = 0; let end = stat.size - 1;
      const match = range && range.match(/bytes=(\d+)-(\d*)/);
      if (match) { start = Number(match[1]); if (match[2]) end = Number(match[2]); }
      start = Math.max(0, Math.min(start, stat.size - 1)); end = Math.max(start, Math.min(end, stat.size - 1));
      const length = end - start + 1; const buffer = Buffer.allocUnsafe(length); const fd = fs.openSync(filePath, 'r');
      try { fs.readSync(fd, buffer, 0, length, start); } finally { fs.closeSync(fd); }
      return new Response(buffer, { status: match ? 206 : 200, headers: { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Length': String(length), 'Content-Range': `bytes ${start}-${end}/${stat.size}` } });
    } catch (error) { console.error('local-pmtiles:', error); return new Response('Bad local map request', { status: 500 }); }
  });
  ipcMain.handle('offline:select-folder', async () => { const result = await dialog.showOpenDialog(mainWindow, { title: 'Select offline map-data folder', properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0]; });
  ipcMain.handle('offline:select-file', async () => { const result = await dialog.showOpenDialog(mainWindow, { title: 'Select offline PMTiles map', properties: ['openFile'], filters: [{ name: 'Map archives', extensions: ['pmtiles'] }] }); return result.canceled ? null : result.filePaths[0]; });
  ipcMain.handle('offline:scan-folder', (_event, folder) => scanFolder(folder));
  ipcMain.handle('offline:get-default-folder', () => path.join(app.getPath('userData'), 'maps'));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
