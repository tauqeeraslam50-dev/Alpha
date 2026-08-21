# Offline PMTiles map archives

PMTiles is now the primary offline raster map architecture for RNMS.

Place the two optional archives directly in this directory:

- `pakistan-satellite.pmtiles` — licensed Pakistan satellite raster tiles
- `pakistan-terrain.pmtiles` — offline terrain/hillshade raster tiles

The Electron runtime serves these archives through the local `rnms://pmtiles/...` protocol with HTTP Range responses. The renderer therefore reads only the byte ranges needed by the PMTiles reader instead of loading the complete archive into memory.

Large GIS archives should not be committed to Git. Put them in the local `rnms-data/maps` directory for development or distribute them as a separate GIS data pack alongside the Windows application.

PMTiles archives should be raster tile archives suitable for the Leaflet raster adapter. Vector PMTiles are not used by the satellite/terrain layers in RNMS.
