const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'rnms', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let mainWindow = null;

function getAssetRoots() {
  const packagedRoot = app.isPackaged ? path.join(process.resourcesPath, 'rnms-data') : path.join(__dirname, 'rnms-data');
  const externalRoot = path.join(path.dirname(process.execPath), 'rnms-data');
  const userRoot = path.join(app.getPath('userData'), 'rnms-data');
  fs.mkdirSync(path.join(userRoot, 'maps'), { recursive: true });
  fs.mkdirSync(path.join(userRoot, 'dem'), { recursive: true });
  const roots = [userRoot, externalRoot, packagedRoot].filter((root, i, a) => a.indexOf(root) === i);
  return { roots, writeRoot: userRoot, maps: path.join(userRoot, 'maps'), dem: path.join(userRoot, 'dem') };
}
function findAsset(subdir, name) {
  for (const root of getAssetRoots().roots) {
    const file = path.join(root, subdir, name);
    if (fs.existsSync(file)) return file;
  }
  return null;
}
function listHgtFiles() {
  const seen = new Set();
  const result = [];
  for (const root of getAssetRoots().roots) {
    const dir = path.join(root, 'dem');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (isHgt(name) && !seen.has(name.toUpperCase())) { seen.add(name.toUpperCase()); result.push(name.toUpperCase()); }
    }
  }
  return result.sort((a, b) => a.localeCompare(b));
}
function safeChild(root, requested) {
  const clean = path.basename(requested);
  const candidate = path.resolve(root, clean);
  return candidate.startsWith(path.resolve(root) + path.sep) ? candidate : null;
}
function isHgt(name) { return /^(N|S)\d{2}(E|W)\d{3}\.hgt$/i.test(name); }
function isPmtiles(name) { return /^[-a-z0-9_.]+\.pmtiles$/i.test(name); }
function fileInfo(file) {
  if (!file || !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  return { sizeBytes: stat.size, modified: stat.mtime.toISOString() };
}
function scanAssets() {
  const roots = getAssetRoots();
  const demTiles = listHgtFiles();
  const satellite = findAsset('maps', 'pakistan-satellite.pmtiles');
  const terrain = findAsset('maps', 'pakistan-terrain.pmtiles');
  const satelliteInfo = fileInfo(satellite);
  const terrainInfo = fileInfo(terrain);
  return {
    mapsRoot: roots.maps,
    demRoot: roots.dem,
    satelliteAvailable: Boolean(satelliteInfo), terrainAvailable: Boolean(terrainInfo),
    satellitePMTilesAvailable: Boolean(satelliteInfo), terrainPMTilesAvailable: Boolean(terrainInfo),
    satellite: satelliteInfo ? { name: 'pakistan-satellite.pmtiles', ...satelliteInfo } : null,
    terrain: terrainInfo ? { name: 'pakistan-terrain.pmtiles', ...terrainInfo } : null,
    demTileCount: demTiles.length, demTiles,
    demResolution: demTiles.length ? inferHgtResolution(findAsset('dem', demTiles[0])) : null
  };
}
function inferHgtResolution(file) {
  try {
    const samples = Math.sqrt(fs.statSync(file).size / 2);
    if (samples === 3601) return 'SRTM 1 arc-second (~30 m)';
    if (samples === 1201) return 'SRTM 3 arc-second (~90 m)';
    if (samples === 7201) return 'SRTM 0.5 arc-second (~15 m)';
    return `HGT ${samples}×${samples} samples`;
  } catch { return 'Unknown'; }
}
async function copyFileAtomic(source, destination) {
  const temp = `${destination}.part`;
  await fs.promises.copyFile(source, temp);
  await fs.promises.rename(temp, destination);
}
function registerOfflineGIS() {
  protocol.handle('rnms', async (request) => {
    const url = new URL(request.url);
    if (url.host === 'pmtiles') {
      const archive = path.basename(url.pathname);
      if (!isPmtiles(archive)) return new Response('Bad PMTiles request', { status: 400 });
      const file = findAsset('maps', archive);
      if (!file) return new Response('PMTiles archive not installed', { status: 404 });
      const stat = fs.statSync(file);
      const range = request.headers.get('range');
      if (!range) return net.fetch(pathToFileURL(file).toString());
      const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
      if (!match) return new Response('Invalid Range', { status: 416, headers: { 'Accept-Ranges': 'bytes' } });
      const start = Number(match[1]);
      const requestedEnd = match[2] ? Number(match[2]) : stat.size - 1;
      if (!Number.isSafeInteger(start) || start < 0 || start >= stat.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}`, 'Accept-Ranges': 'bytes' } });
      const end = Math.min(Number.isSafeInteger(requestedEnd) ? requestedEnd : stat.size - 1, stat.size - 1);
      return new Response(fs.createReadStream(file, { start, end }), { status: 206, headers: { 'Content-Type': 'application/vnd.pmtiles', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Cache-Control': 'no-store' } });
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.host !== 'tiles' || parts.length !== 4) return new Response('Not found', { status: 404 });
    const layer = parts[0].replace(/[^a-z0-9_-]/gi, ''), z = parts[1].replace(/\D/g, ''), x = parts[2].replace(/\D/g, ''), file = parts[3].replace(/[^a-z0-9_.-]/gi, '');
    if (!z || !x || !file || !['jpg','jpeg','png','webp'].includes(path.extname(file).slice(1).toLowerCase())) return new Response('Bad tile request', { status: 400 });
    const tilePath = safeChild(path.join(getAssetRoots().writeRoot, 'maps', 'tiles', layer, z, x), file);
    if (!tilePath || !fs.existsSync(tilePath)) return new Response('Tile not installed', { status: 404 });
    return net.fetch(pathToFileURL(tilePath).toString());
  });
  ipcMain.handle('offline-map-info', async () => scanAssets());
  ipcMain.handle('offline-validate-assets', async () => {
    const info = scanAssets(), warnings = [];
    if (info.satellite && info.satellite.sizeBytes < 1024) warnings.push('Satellite PMTiles file is unusually small and may be invalid.');
    if (info.terrain && info.terrain.sizeBytes < 1024) warnings.push('Terrain PMTiles file is unusually small and may be invalid.');
    const invalid = info.demTiles.filter(name => { try { const samples = Math.sqrt(fs.statSync(findAsset('dem', name)).size / 2); return !Number.isInteger(samples) || ![1201,3601,7201].includes(samples); } catch { return true; } });
    if (invalid.length) warnings.push(`${invalid.length} HGT file(s) have unsupported dimensions.`);
    return { valid: warnings.length === 0, warnings, ...info };
  });
  ipcMain.handle('offline-dem-list', async () => listHgtFiles());
  ipcMain.handle('offline-dem-tile', async (_event, tileName) => {
    if (typeof tileName !== 'string' || !isHgt(tileName)) return null;
    const file = findAsset('dem', tileName.toUpperCase());
    if (!file) return null;
    const buffer = fs.readFileSync(file), samples = Math.sqrt(buffer.length / 2);
    if (!Number.isInteger(samples) || ![1201,3601,7201].includes(samples)) return null;
    return { name: path.basename(file), size: samples, buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  });
  ipcMain.handle('offline-select-map-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Select Pakistan offline map archives', properties: ['openFile','multiSelections'], filters: [{ name: 'PMTiles', extensions: ['pmtiles'] }] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('offline-select-dem-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Select folder containing SRTM HGT files', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('offline-install-map-files', async (_event, files) => {
    const roots = getAssetRoots(); if (!Array.isArray(files) || !files.length) return { installed: [], skipped: [], info: scanAssets() };
    const installed = [], skipped = [];
    for (const source of files) {
      if (typeof source !== 'string' || !isPmtiles(path.basename(source)) || !fs.existsSync(source)) { skipped.push(source); continue; }
      const lower = path.basename(source).toLowerCase();
      const destinationName = lower.includes('terrain') ? 'pakistan-terrain.pmtiles' : lower.includes('satellite') || lower.includes('imagery') ? 'pakistan-satellite.pmtiles' : null;
      if (!destinationName) { skipped.push(source); continue; }
      await copyFileAtomic(source, path.join(roots.maps, destinationName)); installed.push(destinationName);
    }
    return { installed, skipped, info: scanAssets() };
  });
  ipcMain.handle('offline-install-dem-folder', async (_event, folder) => {
    const roots = getAssetRoots(); if (typeof folder !== 'string' || !fs.existsSync(folder)) return { installed: 0, skipped: 0, info: scanAssets() };
    let installed = 0, skipped = 0;
    for (const name of fs.readdirSync(folder).filter(isHgt)) { try { await copyFileAtomic(path.join(folder, name), path.join(roots.dem, name.toUpperCase())); installed++; } catch { skipped++; } }
    return { installed, skipped, info: scanAssets() };
  });
  ipcMain.handle('offline-remove-map-asset', async (_event, name) => {
    if (name !== 'pakistan-satellite.pmtiles' && name !== 'pakistan-terrain.pmtiles') return false;
    const file = safeChild(getAssetRoots().writeRoot + path.sep + 'maps', name); if (!file || !fs.existsSync(file)) return false;
    await fs.promises.unlink(file); return true;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 1024, minHeight: 700, title: 'Radio Network Management System v1.0 - Offline GIS', backgroundColor: '#0f172a', backgroundThrottling: false, autoHideMenuBar: false, webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.cjs'), webSecurity: false, allowRunningInsecureContent: true } });
  const distPath = path.join(__dirname, 'dist', 'index.html'), rootPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(distPath)) mainWindow.loadFile(distPath); else if (fs.existsSync(rootPath)) mainWindow.loadFile(rootPath); else mainWindow.loadURL('http://localhost:3000');
  const template = [
    { label: 'File', submenu: [{ label: 'Reload Workspace', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() }, { type: 'separator' }, { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.toggleDevTools() }] },
    { label: 'Offline GIS', submenu: [{ label: 'Real Pakistan Satellite PMTiles + SRTM/HGT DEM', enabled: false }] },
    { label: 'Help', submenu: [{ label: 'About RNMS v1.0', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'Radio Network Management System v1.0', message: 'Radio Network Management System (RNMS) v1.0\nDeveloped by Tauqeer Aslam\n\nOffline GIS: PMTiles + real SRTM/HGT DEM.' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('http:') || url.startsWith('https:')) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.whenReady().then(() => { registerOfflineGIS(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
