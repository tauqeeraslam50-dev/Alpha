RNMS OFFLINE GIS - FOLDER TILE PACKAGE

This is the new GIS architecture. PMTiles are not required by the new map view.

Expected package structure:

Pakistan/
  metadata.json
  pakistan-labels.geojson
  tiles/
    satellite/
      {z}/{x}/{y}.jpg
    street/
      {z}/{x}/{y}.jpg
    terrain/
      {z}/{x}/{y}.jpg

The application imports the Pakistan folder from Offline Map -> Import Offline Map Folder.

Layer meanings:
- satellite: local satellite imagery tiles
- street: local map/road raster tiles
- terrain: local terrain raster tiles
- pakistan-labels.geojson: offline place/city labels
- metadata.json: package information and tile format

DEM/HGT remains in rnms-data/dem and is handled separately by the existing elevation engine.

Recommended metadata.json example:
{
  "name": "Pakistan Offline Map",
  "country": "Pakistan",
  "tileFormat": "jpg",
  "minZoom": 3,
  "maxZoom": 18
}
