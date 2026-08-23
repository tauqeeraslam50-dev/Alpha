# Offline Pakistan Map Data

Place licensed offline map datasets here or select another folder from the application.

Supported/indexed formats:

- `.pmtiles` — primary map format for Phase 1
- `.mbtiles` — indexed for future adapter support
- `.hgt` — DEM tiles for the later elevation phase
- `.tif` / `.tiff` — terrain/raster data for a later phase
- `.geojson` — local vector overlays

Recommended layout:

```text
map-data/
├── Satellite/
├── Roads/
├── Places/
├── Terrain/
├── Boundaries/
└── DEM/
```

Do not commit large imagery archives to Git. The Windows application is the engine; the Pakistan map dataset is installed separately and can be updated independently.
