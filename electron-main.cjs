const { app, BrowserWindow, Menu, shell, dialog, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
const LOCAL_SCHEME = 'local-pmtiles';
const TILE_SCHEME = 'local-map';

// These schemes are consumed by fetch(), MapLibre and PMTiles in the renderer.
// They must be registered as privileged BEFORE app.ready, otherwise Chromium can
// reject renderer fetches with the misleading "Failed to fetch" error.
protocol.registerSchemesAsPrivileged([
  { scheme: LOCAL_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: TILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 1024, minHeight: 700, title: 'Radio Network Management System v1.0', backgroundColor: '#0f172a', backgroundThrottling: false, autoHideMenuBar: false, webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'electron-preload.cjs'), webSecurity: true, allowRunningInsecureContent: false } });
  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(distPath)) mainWindow.loadFile(distPath); else if (fs.existsSync(rootPath)) mainWindow.loadFile(rootPath); else mainWindow.loadURL('http://localhost:3000');
  const template = [
    { label: 'File', submenu: [{ label: 'Reload Workspace', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() }, { type: 'separator' }, { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.toggleDevTools() }] },
    { label: 'Help', submenu: [{ label: 'About RNMS v1.0', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'Radio Network Management System v1.0', message: 'Radio Network Management System (RNMS) v1.0\nDeveloped by Tauqeer Aslam\n\nIntegrated offline GIS engine.' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('http:') || url.startsWith('https:')) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function scanFolder(folder) {
  if (!folder || !fs.existsSync(folder)) return [];
  const root = path.resolve(folder); const files = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(pmtiles|mbtiles|hgt|tif|tiff|geojson|png)$/i.test(entry.name)) { const stat = fs.statSync(full); files.push({ name: entry.name, path: full, relative: path.relative(root, full), size: stat.size, extension: path.extname(entry.name).toLowerCase() }); } } };
  walk(root); return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

function safeFilePath(value) {
  let decoded = decodeURIComponent(value || '');
  // Remove hostname prefix if present (e.g. pmtiles/D:/... -> D:/...)
  decoded = decoded.replace(/^[A-Za-z0-9_-]+\/+([A-Za-z]:)/, '$1');
  // Accept /C:/... or ///C:/... and normalize to C:/... on Windows
  decoded = decoded.replace(/^\/+([A-Za-z]:[\\/])/, '$1');
  decoded = decoded.replace(/^\/+/, '');
  return path.normalize(decoded);
}

function fileResponse(filePath, request, contentType) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return new Response('Not found', { status: 404 });
  const stat = fs.statSync(filePath);
  const range = request.headers.get('range');
  let start = 0; let end = stat.size - 1;
  const match = range && range.match(/bytes=(\d+)-(\d*)/);
  if (match) { start = Number(match[1]); if (match[2]) end = Number(match[2]); }
  start = Math.max(0, Math.min(start, Math.max(0, stat.size - 1)));
  end = Math.max(start, Math.min(end, Math.max(0, stat.size - 1)));
  const length = stat.size === 0 ? 0 : end - start + 1;
  const buffer = length ? Buffer.allocUnsafe(length) : Buffer.alloc(0);
  if (length) { const fd = fs.openSync(filePath, 'r'); try { fs.readSync(fd, buffer, 0, length, start); } finally { fs.closeSync(fd); } }
  const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Content-Length': String(length) };
  if (match) { headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`; return new Response(buffer, { status: 206, headers }); }
  return new Response(buffer, { status: 200, headers });
}

app.whenReady().then(() => {
  protocol.handle(LOCAL_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      let decoded = decodeURIComponent(url.pathname || '');
      let raw = decoded;
      if (!raw || raw === '/') {
        raw = decodeURIComponent(request.url.slice(`${LOCAL_SCHEME}://`.length));
      }
      const filePath = safeFilePath(raw);
      return fileResponse(filePath, request, 'application/octet-stream');
    } catch (error) { console.error('local-pmtiles:', error); return new Response('Bad local PMTiles request', { status: 500 }); }
  });

  protocol.handle(TILE_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const root = safeFilePath(url.searchParams.get('root') || '');
      const z = url.searchParams.get('z');
      const x = url.searchParams.get('x');
      const y = url.searchParams.get('y');
      const layer = url.searchParams.get('layer');
      if (!root || !/^\d+$/.test(z || '') || !/^\d+$/.test(x || '') || !/^\d+$/.test(y || '')) {
        return new Response('Bad tile request', { status: 400 });
      }
      
      const candidatePaths = [
        layer ? path.join(root, layer, z, x, `${y}.png`) : null,
        layer ? path.join(root, layer, z, x, `${y}.jpg`) : null,
        layer ? path.join(root, layer, z, x, `${y}.jpeg`) : null,
        layer ? path.join(root, layer, z, x, `${y}.webp`) : null,
        path.join(root, z, x, `${y}.png`),
        path.join(root, z, x, `${y}.jpg`),
        path.join(root, z, x, `${y}.jpeg`),
        path.join(root, z, x, `${y}.webp`),
      ].filter(Boolean);

      for (const p of candidatePaths) {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
          const ext = path.extname(p).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
          return fileResponse(p, request, mime);
        }
      }
      return new Response('Tile not found', { status: 404 });
    } catch (error) {
      console.error('local-map:', error);
      return new Response('Bad local tile request', { status: 500 });
    }
  });

  ipcMain.handle('offline:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select offline map-data folder (containing PMTiles or PNG tiles)',
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('offline:select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select offline PMTiles archive or map file',
      properties: ['openFile'],
      filters: [
        { name: 'PMTiles Map Archives (*.pmtiles)', extensions: ['pmtiles'] },
        { name: 'All Map Archives (*.pmtiles, *.mbtiles)', extensions: ['pmtiles', 'mbtiles'] },
        { name: 'All Files (*.*)', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('offline:scan-folder', (_event, folder) => scanFolder(folder));
  ipcMain.handle('offline:get-default-folder', () => path.join(app.getPath('userData'), 'maps'));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
