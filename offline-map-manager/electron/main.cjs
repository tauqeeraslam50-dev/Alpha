const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
const SCHEME = 'local-pmtiles';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    title: 'Pakistan Offline Map Manager',
    backgroundColor: '#0b1220',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  protocol.handle(SCHEME, async (request) => {
    try {
      const filePath = path.resolve(decodeURIComponent(request.url.slice(`${SCHEME}://`.length)));
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return new Response('Not found', { status: 404 });
      const stat = fs.statSync(filePath);
      const range = request.headers.get('range');
      let start = 0;
      let end = stat.size - 1;
      const match = range && range.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        start = Number(match[1]);
        if (match[2]) end = Number(match[2]);
      }
      start = Math.max(0, Math.min(start, stat.size - 1));
      end = Math.max(start, Math.min(end, stat.size - 1));
      const length = end - start + 1;
      const buffer = Buffer.allocUnsafe(length);
      const fd = fs.openSync(filePath, 'r');
      try { fs.readSync(fd, buffer, 0, length, start); } finally { fs.closeSync(fd); }
      return new Response(buffer, {
        status: match ? 206 : 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Accept-Ranges': 'bytes',
          'Content-Length': String(length),
          'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        },
      });
    } catch (error) {
      console.error('local-pmtiles:', error);
      return new Response('Bad local map request', { status: 500 });
    }
  });

  ipcMain.handle('select-map-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select offline map-data folder',
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('scan-map-folder', async (_event, folder) => {
    if (!folder || !fs.existsSync(folder)) return [];
    const root = path.resolve(folder);
    const files = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(pmtiles|mbtiles|hgt|tif|tiff|geojson)$/i.test(entry.name)) {
          files.push({ name: entry.name, path: full, relative: path.relative(root, full), size: fs.statSync(full).size, extension: path.extname(entry.name).toLowerCase() });
        }
      }
    };
    walk(root);
    return files.sort((a, b) => a.relative.localeCompare(b.relative));
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
