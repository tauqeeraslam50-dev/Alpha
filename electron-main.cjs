const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'rnms', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let mainWindow = null;

function getAssetRoots() {
  const externalRoot = path.join(path.dirname(process.execPath), 'rnms-data');
  const bundledRoot = app.isPackaged ? path.join(process.resourcesPath, 'rnms-data') : path.join(__dirname, 'rnms-data');
  const root = fs.existsSync(externalRoot) ? externalRoot : bundledRoot;
  return { root, maps: path.join(root, 'maps'), dem: path.join(root, 'dem') };
}
function safeChild(root, requested) {
  const clean = path.basename(requested);
  const candidate = path.resolve(root, clean);
  return candidate.startsWith(path.resolve(root) + path.sep) ? candidate : null;
}
function registerOfflineGIS() {
  protocol.handle('rnms', async (request) => {
    const url = new URL(request.url);
    const roots = getAssetRoots();

    if (url.host === 'pmtiles') {
      const archive = path.basename(url.pathname);
      if (!/^[-a-z0-9_.]+\.pmtiles$/i.test(archive)) return new Response('Bad PMTiles request', { status: 400 });
      const file = safeChild(roots.maps, archive);
      if (!file || !fs.existsSync(file)) return new Response('PMTiles archive not installed', { status: 404 });
      const stat = fs.statSync(file);
      const range = request.headers.get('range');
      if (!range) return net.fetch(pathToFileURL(file).toString());
      const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
      if (!match) return new Response('Invalid Range', { status: 416, headers: { 'Accept-Ranges': 'bytes' } });
      const start = Number(match[1]);
      const requestedEnd = match[2] ? Number(match[2]) : stat.size - 1;
      if (!Number.isSafeInteger(start) || start < 0 || start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' } });
      const end = Math.min(Number.isSafeInteger(requestedEnd) ? requestedEnd : stat.size - 1, stat.size - 1);
      const stream = fs.createReadStream(file, { start, end });
      return new Response(stream, { status: 206, headers: { 'Content-Type': 'application/vnd.pmtiles', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Cache-Control': 'no-store' } });
    }

    const parts = url.pathname.split('/').filter(Boolean);
    if (url.host !== 'tiles' || parts.length !== 4) return new Response('Not found', { status: 404 });
    const layer = parts[0].replace(/[^a-z0-9_-]/gi, '');
    const z = parts[1].replace(/\D/g, '');
    const x = parts[2].replace(/\D/g, '');
    const file = parts[3].replace(/[^a-z0-9_.-]/gi, '');
    if (!z || !x || !file || !['jpg', 'jpeg', 'png', 'webp'].includes(path.extname(file).slice(1).toLowerCase())) return new Response('Bad tile request', { status: 400 });
    const tileRoot = path.join(roots.maps, 'tiles', layer, z, x);
    const tilePath = safeChild(tileRoot, file);
    if (!tilePath || !fs.existsSync(tilePath)) return new Response('Tile not installed', { status: 404 });
    return net.fetch(pathToFileURL(tilePath).toString());
  });
  ipcMain.handle('offline-map-info', async () => {
    const roots = getAssetRoots();
    const demTiles = fs.existsSync(roots.dem) ? fs.readdirSync(roots.dem).filter(f => /^(N|S)\d{2}(E|W)\d{3}\.hgt$/i.test(f)) : [];
    const satellitePMTiles = path.join(roots.maps, 'pakistan-satellite.pmtiles');
    const terrainPMTiles = path.join(roots.maps, 'pakistan-terrain.pmtiles');
    return {
      mapsRoot: roots.maps,
      demRoot: roots.dem,
      satelliteAvailable: fs.existsSync(satellitePMTiles) || fs.existsSync(path.join(roots.maps, 'tiles', 'satellite')),
      terrainAvailable: fs.existsSync(terrainPMTiles) || fs.existsSync(path.join(roots.maps, 'tiles', 'terrain')),
      satellitePMTilesAvailable: fs.existsSync(satellitePMTiles),
      terrainPMTilesAvailable: fs.existsSync(terrainPMTiles),
      demTileCount: demTiles.length
    };
  });
  ipcMain.handle('offline-dem-list', async () => {
    const roots = getAssetRoots();
    return fs.existsSync(roots.dem) ? fs.readdirSync(roots.dem).filter(f => /^(N|S)\d{2}(E|W)\d{3}\.hgt$/i.test(f)) : [];
  });
  ipcMain.handle('offline-dem-tile', async (_event, tileName) => {
    if (typeof tileName !== 'string' || !/^(N|S)\d{2}(E|W)\d{3}\.hgt$/i.test(tileName)) return null;
    const file = safeChild(getAssetRoots().dem, tileName);
    if (!file || !fs.existsSync(file)) return null;
    const buffer = fs.readFileSync(file);
    const samples = Math.sqrt(buffer.length / 2);
    if (!Number.isInteger(samples) || samples < 2 || samples > 7201) return null;
    return { name: path.basename(file), size: samples, buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 1024, minHeight: 700, title: 'Radio Network Management System v1.0 (Offline GIS Foundation)', backgroundColor: '#0f172a', autoHideMenuBar: false, webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.cjs'), webSecurity: false, allowRunningInsecureContent: true } });
  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(distPath)) mainWindow.loadFile(distPath); else if (fs.existsSync(rootPath)) mainWindow.loadFile(rootPath); else mainWindow.loadURL('http://localhost:3000');
  const template = [
    { label: 'File', submenu: [{ label: 'Reload Workspace', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() }, { type: 'separator' }, { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.toggleDevTools() }] },
    { label: 'Offline GIS', submenu: [{ label: 'PMTiles: primary offline raster architecture', enabled: false }, { label: 'DEM: SRTM/HGT local only', enabled: false }, { label: 'LOS terrain: DEM-backed when tiles installed', enabled: false }] },
    { label: 'Help', submenu: [{ label: 'About RNMS v1.0', click: () => require('electron').dialog.showMessageBox(mainWindow, { type: 'info', title: 'Radio Network Management System v1.0', message: 'Radio Network Management System (RNMS) v1.0\nDeveloped by Tauqeer Aslam\n\nOffline GIS Foundation: PMTiles + real SRTM/HGT DEM.' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('http:') || url.startsWith('https:')) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.whenReady().then(() => { registerOfflineGIS(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
