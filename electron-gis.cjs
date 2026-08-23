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
function isPmtiles(name) { return /^[-a-z0-9_.]+\.pmtiles$/i.test(name); }
function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function hasFilesRecursive(root) {
  try {
    if (!exists(root)) return false;
    return fs.readdirSync(root, { withFileTypes: true }).some(e => e.isFile() || (e.isDirectory() && hasFilesRecursive(path.join(root, e.name))));
  } catch { return false; }
}
function scan() {
  const maps = getMapsRoot();
  const tiles = path.join(maps, 'tiles');
  const dem = getDemRoot();
  const demTiles = fs.readdirSync(dem).filter(isHgt).sort();
  const satellitePmtiles = exists(path.join(maps, 'pakistan-satellite.pmtiles'));
  const terrainPmtiles = exists(path.join(maps, 'pakistan-terrain.pmtiles'));
  const folderSatellite = hasFilesRecursive(path.join(tiles, 'satellite'));
  const folderStreet = hasFilesRecursive(path.join(tiles, 'street'));
  const folderTerrain = hasFilesRecursive(path.join(tiles, 'terrain'));
  return {
    mapsRoot: maps,
    packageRoot: maps,
    tilesRoot: tiles,
    packageName: exists(path.join(maps, 'metadata.json')) ? 'Pakistan Offline Map Package' : '',
    satellite: satellitePmtiles || folderSatellite,
    street: folderStreet,
    terrain: terrainPmtiles || folderTerrain,
    labels: exists(path.join(maps, 'pakistan-labels.geojson')),
    metadata: exists(path.join(maps, 'metadata.json')),
    satellitePMTilesAvailable: satellitePmtiles,
    terrainPMTilesAvailable: terrainPmtiles,
    folderSatelliteAvailable: folderSatellite,
    folderStreetAvailable: folderStreet,
    folderTerrainAvailable: folderTerrain,
    labelsAvailable: exists(path.join(maps, 'pakistan-labels.geojson')),
    metadataAvailable: exists(path.join(maps, 'metadata.json')),
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
  // Folder import is optional. Existing GIS Data Manager assets are already shared
  // through the same data store, so an invalid/irrelevant folder must not throw an
  // unhandled Electron IPC error while the application is running.
  if (typeof folder !== 'string' || !exists(folder)) {
    return { ok: false, error: 'Map package folder does not exist.', info: scan() };
  }

  const source = path.resolve(folder);
  const maps = getMapsRoot();
  const packageRoot = exists(path.join(source, 'tiles'))
    ? source
    : exists(path.join(source, 'Pakistan', 'tiles'))
      ? path.join(source, 'Pakistan')
      : null;

  // Also accept a folder containing only the layer directories directly.
  const directTiles = exists(path.join(source, 'satellite')) || exists(path.join(source, 'street')) || exists(path.join(source, 'terrain'));
  const tileSource = packageRoot ? path.join(packageRoot, 'tiles') : (directTiles ? source : null);

  if (!tileSource) {
    return {
      ok: false,
      error: 'Selected folder is not a folder-tile package. Choose a package containing a tiles folder (or satellite/street/terrain folders). Existing GIS Data Manager data does not need to be imported again.',
      info: scan()
    };
  }

  await copyRecursive(tileSource, path.join(maps, 'tiles'));
  const metadataRoot = packageRoot || source;
  for (const name of ['metadata.json', 'pakistan-labels.geojson']) {
    const src = path.join(metadataRoot, name);
    if (exists(src)) await fs.promises.copyFile(src, path.join(maps, name));
  }
  return { ok: true, info: scan() };
});
