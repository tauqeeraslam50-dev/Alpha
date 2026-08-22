const { app, BrowserWindow, Menu, shell, protocol, net, ipcMain, dialog } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'rnms', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
let mainWindow = null;
const PMTILES_PORT = 39777;

function getAssetRoots() {
  const candidates = [
    path.join(path.dirname(process.execPath), 'rnms-data'),
    app.isPackaged ? path.join(process.resourcesPath, 'rnms-data') : path.join(__dirname, 'rnms-data'),
    path.join(app.getPath('userData'), 'rnms-data')
  ];
  const root = candidates.find(candidate => fs.existsSync(candidate)) || candidates[0];
  fs.mkdirSync(path.join(root, 'maps'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dem'), { recursive: true });
  return { root, maps: path.join(root, 'maps'), dem: path.join(root, 'dem') };
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
  const demTiles = fs.readdirSync(roots.dem).filter(isHgt).sort((a, b) => a.localeCompare(b));
  const satellite = path.join(roots.maps, 'pakistan-satellite.pmtiles');
  const terrain = path.join(roots.maps, 'pakistan-terrain.pmtiles');
  const satelliteInfo = fileInfo(satellite);
  const terrainInfo = fileInfo(terrain);
  return {
    mapsRoot: roots.maps,
    demRoot: roots.dem,
    satelliteAvailable: Boolean(satelliteInfo),
    terrainAvailable: Boolean(terrainInfo),
    satellitePMTilesAvailable: Boolean(satelliteInfo),
    terrainPMTilesAvailable: Boolean(terrainInfo),
    satellite: satelliteInfo ? { name: 'pakistan-satellite.pmtiles', ...satelliteInfo } : null,
    terrain: terrainInfo ? { name: 'pakistan-terrain.pmtiles', ...terrainInfo } : null,
    demTileCount: demTiles.length,
    demTiles,
    demResolution: demTiles.length ? inferHgtResolution(path.join(roots.dem, demTiles[0])) : null,
    pmtilesBaseUrl: `http://127.0.0.1:${PMTILES_PORT}/pmtiles/`
  };
}
function inferHgtResolution(file) {
  try {
    const bytes = fs.statSync(file).size;
    const samples = Math.sqrt(bytes / 2);
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
    const roots = getAssetRoots();
    if (url.host === 'pmtiles') {
      const archive = path.basename(url.pathname);
      if (!isPmtiles(archive)) return new Response('Bad PMTiles request', { status: 400 });
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
      return new Response(fs.createReadStream(file, { start, end }), { status: 206, headers: { 'Content-Type': 'application/vnd.pmtiles', 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Cache-Control': 'no-store' } });
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

  ipcMain.handle('offline-read-pmtiles-range', async (_event, fileName, start, length) => {
    if (typeof fileName !== 'string' || !isPmtiles(fileName)) throw new Error('Invalid PMTiles filename');
    if (!Number.isSafeInteger(start) || start < 0) throw new Error('Invalid PMTiles offset');
    if (!Number.isSafeInteger(length) || length <= 0) throw new Error('Invalid PMTiles length');
    const roots = getAssetRoots();
    const file = safeChild(roots.maps, fileName);
    if (!file || !fs.existsSync(file)) throw new Error('PMTiles archive not installed');
    const stat = fs.statSync(file);
    if (start >= stat.size) throw new Error('PMTiles range outside archive');
    const actualLength = Math.min(length, stat.size - start);
    const handle = await fs.promises.open(file, 'r');
    try {
      const buffer = Buffer.allocUnsafe(actualLength);
      const { bytesRead } = await handle.read(buffer, 0, actualLength, start);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + bytesRead);
    } finally {
      await handle.close();
    }
  });

  ipcMain.handle('offline-map-info', async () => scanAssets());
  ipcMain.handle('offline-validate-assets', async () => {
    const info = scanAssets();
    const warnings = [];
    if (info.satellite && info.satellite.sizeBytes < 1024) warnings.push('Satellite PMTiles file is unusually small and may be invalid.');
    if (info.terrain && info.terrain.sizeBytes < 1024) warnings.push('Terrain PMTiles file is unusually small and may be invalid.');
    if (info.demTileCount) {
      const invalid = info.demTiles.filter(name => {
        try { const size = fs.statSync(path.join(info.demRoot, name)).size; const samples = Math.sqrt(size / 2); return !Number.isInteger(samples) || ![1201, 3601, 7201].includes(samples); } catch { return true; }
      });
      if (invalid.length) warnings.push(`${invalid.length} HGT file(s) have unsupported dimensions.`);
    }
    return { valid: warnings.length === 0, warnings, ...info };
  });
  ipcMain.handle('offline-dem-list', async () => scanAssets().demTiles);
  ipcMain.handle('offline-dem-tile', async (_event, tileName) => {
    if (typeof tileName !== 'string' || !isHgt(tileName)) return null;
    const file = safeChild(getAssetRoots().dem, tileName);
    if (!file || !fs.existsSync(file)) return null;
    const buffer = fs.readFileSync(file);
    const samples = Math.sqrt(buffer.length / 2);
    if (!Number.isInteger(samples) || ![1201, 3601, 7201].includes(samples)) return null;
    return { name: path.basename(file), size: samples, buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) };
  });
  ipcMain.handle('offline-select-map-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Select Pakistan offline map archives', properties: ['openFile', 'multiSelections'], filters: [{ name: 'PMTiles', extensions: ['pmtiles'] }] });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('offline-select-dem-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Select folder containing SRTM HGT files', properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle('offline-install-map-files', async (event, files) => {
    const roots = getAssetRoots();
    if (!Array.isArray(files) || files.length === 0) return { installed: [], skipped: [], info: scanAssets() };
    const installed = [];
    const skipped = [];
    for (const source of files) {
      if (typeof source !== 'string' || !isPmtiles(path.basename(source)) || !fs.existsSync(source)) { skipped.push(source); continue; }
      const lower = path.basename(source).toLowerCase();
      const destinationName = lower.includes('terrain') ? 'pakistan-terrain.pmtiles' : lower.includes('satellite') || lower.includes('imagery') ? 'pakistan-satellite.pmtiles' : null;
      if (!destinationName) { skipped.push(source); continue; }
      const destination = path.join(roots.maps, destinationName);
      const temp = `${destination}.part`;
      const sourceStat = await fs.promises.stat(source);
      const totalBytes = sourceStat.size;
      let copiedBytes = 0;
      const startedAt = Date.now();
      try {
        await new Promise((resolve, reject) => {
          const readStream = fs.createReadStream(source);
          const writeStream = fs.createWriteStream(temp);
          readStream.on('data', chunk => {
            copiedBytes += chunk.length;
            const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
            const speedBytesPerSecond = copiedBytes / elapsedSeconds;
            const percent = totalBytes > 0 ? Math.min(100, copiedBytes / totalBytes * 100) : 0;
            if (!event.sender.isDestroyed()) event.sender.send('offline-map-upload-progress', { fileName: destinationName, copiedBytes, totalBytes, percent, speedBytesPerSecond, status: 'uploading' });
          });
          readStream.on('error', reject);
          writeStream.on('error', reject);
          writeStream.on('finish', resolve);
          readStream.pipe(writeStream);
        });
        await fs.promises.rename(temp, destination);
        if (!event.sender.isDestroyed()) event.sender.send('offline-map-upload-progress', { fileName: destinationName, copiedBytes: totalBytes, totalBytes, percent: 100, speedBytesPerSecond: totalBytes / Math.max((Date.now() - startedAt) / 1000, 0.001), status: 'complete' });
        installed.push(destinationName);
      } catch (error) {
        try { if (fs.existsSync(temp)) await fs.promises.unlink(temp); } catch {}
        if (!event.sender.isDestroyed()) event.sender.send('offline-map-upload-progress', { fileName: destinationName, copiedBytes, totalBytes, percent: totalBytes > 0 ? copiedBytes / totalBytes * 100 : 0, speedBytesPerSecond: 0, status: 'failed', error: error?.message || String(error) });
        skipped.push(source);
      }
    }
    return { installed, skipped, info: scanAssets() };
  });
  ipcMain.handle('offline-install-dem-folder', async (_event, folder) => {
    const roots = getAssetRoots();
    if (typeof folder !== 'string' || !fs.existsSync(folder)) return { installed: 0, skipped: 0, info: scanAssets() };
    const files = fs.readdirSync(folder).filter(isHgt);
    let installed = 0, skipped = 0;
    for (const name of files) {
      const source = path.join(folder, name);
      const destination = path.join(roots.dem, name.toUpperCase());
      try { await copyFileAtomic(source, destination); installed++; } catch { skipped++; }
    }
    return { installed, skipped, info: scanAssets() };
  });
  ipcMain.handle('offline-remove-map-asset', async (_event, name) => {
    if (name !== 'pakistan-satellite.pmtiles' && name !== 'pakistan-terrain.pmtiles') return false;
    const file = safeChild(getAssetRoots().maps, name);
    if (!file || !fs.existsSync(file)) return false;
    await fs.promises.unlink(file);
    return true;
  });
}

function startPMTilesServer() {
  const server = http.createServer((req, res) => {
    try {
      const pathname = new URL(req.url, `http://127.0.0.1:${PMTILES_PORT}`).pathname;
      if (!pathname.startsWith('/pmtiles/')) { res.writeHead(404); return res.end(); }
      const archive = decodeURIComponent(pathname.slice('/pmtiles/'.length));
      if (!isPmtiles(archive)) { res.writeHead(400); return res.end('Bad PMTiles request'); }
      const file = safeChild(getAssetRoots().maps, archive);
      if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('PMTiles archive not installed'); }
      const stat = fs.statSync(file);
      res.setHeader('Content-Type', 'application/vnd.pmtiles');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'HEAD') { res.setHeader('Content-Length', String(stat.size)); res.writeHead(200); return res.end(); }
      const range = req.headers.range;
      if (!range) { res.setHeader('Content-Length', String(stat.size)); res.writeHead(200); return fs.createReadStream(file).pipe(res); }
      const match = /^bytes=(\d+)-(\d*)$/i.exec(range);
      if (!match) { res.setHeader('Content-Range', `bytes */${stat.size}`); res.writeHead(416); return res.end(); }
      const start = Number(match[1]);
      const requestedEnd = match[2] ? Number(match[2]) : stat.size - 1;
      if (!Number.isSafeInteger(start) || start < 0 || start >= stat.size) { res.setHeader('Content-Range', `bytes */${stat.size}`); res.writeHead(416); return res.end(); }
      const end = Math.min(Number.isSafeInteger(requestedEnd) ? requestedEnd : stat.size - 1, stat.size - 1);
      res.statusCode = 206;
      res.setHeader('Content-Length', String(end - start + 1));
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      fs.createReadStream(file, { start, end }).pipe(res);
    } catch (error) { res.writeHead(500); res.end(String(error?.message || error)); }
  });
  server.listen(PMTILES_PORT, '127.0.0.1');
  return server;
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1400, height: 900, minWidth: 1024, minHeight: 700, title: 'Radio Network Management System v1.0 - Offline GIS', backgroundColor: '#0f172a', backgroundThrottling: false, autoHideMenuBar: false, webPreferences: { nodeIntegration: false, contextIsolation: true, preload: path.join(__dirname, 'preload.cjs'), webSecurity: true, allowRunningInsecureContent: false } });
  const distPath = path.join(__dirname, 'dist', 'index.html');
  const rootPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(distPath)) mainWindow.loadFile(distPath); else if (fs.existsSync(rootPath)) mainWindow.loadFile(rootPath); else mainWindow.loadURL('http://localhost:3000');
  const template = [
    { label: 'File', submenu: [{ label: 'Reload Workspace', accelerator: 'CmdOrCtrl+R', click: () => mainWindow.reload() }, { type: 'separator' }, { label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { label: 'Toggle Developer Tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => mainWindow.webContents.toggleDevTools() }] },
    { label: 'Offline GIS', submenu: [{ label: 'Real Pakistan Satellite PMTiles + SRTM/HGT DEM', enabled: false }] },
    { label: 'Help', submenu: [{ label: 'About RNMS v1.0', click: () => require('electron').dialog.showMessageBox(mainWindow, { type: 'info', title: 'Radio Network Management System v1.0', message: 'Radio Network Management System (RNMS) v1.0\nDeveloped by Tauqeer Aslam\n\nOffline GIS: PMTiles + real SRTM/HGT DEM.' }) }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('http:') || url.startsWith('https:')) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
  mainWindow.on('closed', () => { mainWindow = null; });
}
app.whenReady().then(() => { registerOfflineGIS(); startPMTilesServer(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
