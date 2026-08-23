const { app, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function getMapsRoot() {
  const candidates = [
    path.join(path.dirname(process.execPath), 'rnms-data', 'maps'),
    app.isPackaged ? path.join(process.resourcesPath, 'rnms-data', 'maps') : path.join(__dirname, 'rnms-data', 'maps'),
    path.join(app.getPath('userData'), 'rnms-data', 'maps')
  ];
  const root = candidates.find(p => fs.existsSync(p)) || candidates[0];
  fs.mkdirSync(root, { recursive: true });
  return root;
}
function getDemRoot() {
  const root = path.join(path.dirname(getMapsRoot()), 'dem');
  fs.mkdirSync(root, { recursive: true });
  return root;
}
function isHgt(name) { return /^(N|S)\d{2}(E|W)\d{3}\.hgt$/i.test(name); }
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function scan() {
  const maps = getMapsRoot();
  const tiles = path.join(maps, 'tiles');
  const dem = getDemRoot();
  const demTiles = fs.readdirSync(dem).filter(isHgt).sort();
  return {
    mapsRoot: maps,
    packageRoot: maps,
    tilesRoot: tiles,
    packageName: exists(path.join(maps, 'metadata.json')) ? 'Pakistan Offline Map Package' : '',
    satellite: exists(path.join(tiles, 'satellite')),
    street: exists(path.join(tiles, 'street')),
    terrain: exists(path.join(tiles, 'terrain')),
    labels: exists(path.join(maps, 'pakistan-labels.geojson')),
    metadata: exists(path.join(maps, 'metadata.json')),
    demTileCount: demTiles.length,
    demTiles,
    architecture: 'folder-tiles'
  };
}
async function copyRecursive(source, destination) {
  await fs.promises.cp(source, destination, { recursive: true, force: true });
}

ipcMain.handle('offline-folder-map-info', async () => scan());
ipcMain.handle('offline-read-map-text', async (_event, fileName) => {
  if (typeof fileName !== 'string' || !/^(metadata\.json|pakistan-labels\.geojson)$/i.test(path.basename(fileName))) return null;
  const file = path.join(getMapsRoot(), path.basename(fileName));
  if (!exists(file)) return null;
  return fs.promises.readFile(file, 'utf8');
});
ipcMain.handle('offline-select-map-folder', async () => {
  const result = await dialog.showOpenDialog({ title: 'Select offline GIS map package folder', properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('offline-install-map-folder', async (_event, folder) => {
  if (typeof folder !== 'string' || !exists(folder)) throw new Error('Map package folder does not exist.');
  const source = path.resolve(folder);
  const maps = getMapsRoot();
  const packageRoot = exists(path.join(source, 'tiles')) ? source : path.join(source, 'Pakistan');
  if (!exists(path.join(packageRoot, 'tiles'))) throw new Error('Invalid package. Required folder: tiles');
  await copyRecursive(path.join(packageRoot, 'tiles'), path.join(maps, 'tiles'));
  for (const name of ['metadata.json', 'pakistan-labels.geojson']) {
    const src = path.join(packageRoot, name);
    if (exists(src)) await fs.promises.copyFile(src, path.join(maps, name));
  }
  return scan();
});
