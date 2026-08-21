# RNMS Offline GIS Data

This directory is the external data layer for Alpha's real offline GIS engine. Large geographic datasets are deliberately not committed to GitHub.

## Required Pakistan datasets

### Satellite imagery

Install a legally licensed Pakistan-wide satellite archive as:

`maps/pakistan-satellite.pmtiles`

The archive should contain the imagery tiles and metadata required by the PMTiles reader. The application does not download imagery automatically.

### Terrain

Install a legally licensed terrain archive as:

`maps/pakistan-terrain.pmtiles`

### DEM / SRTM

Place genuine one-degree SRTM/HGT elevation files under:

`dem/N33E073.hgt`

Supported standard HGT dimensions are 1201×1201 (approximately 90 m), 3601×3601 (approximately 30 m), and 7201×7201 (approximately 15 m) samples. Alpha validates the dimensions and refuses unsupported HGT files.

## Windows deployment

The executable can be distributed separately from the GIS data:

```text
RNMS/
├── Radio Network Management System.exe
└── rnms-data/
    ├── maps/
    │   ├── pakistan-satellite.pmtiles
    │   └── pakistan-terrain.pmtiles
    └── dem/
        ├── N33E073.hgt
        └── ...
```

The application first checks for `rnms-data` beside the executable. This makes it possible to replace or expand large GIS datasets without rebuilding the application.

## Data manager

Use **Offline Manager → Pakistan Satellite + DEM Data Manager** to install PMTiles, import a folder containing HGT files, scan installed GIS data, validate HGT dimensions, inspect dataset sizes, remove installed satellite/terrain archives, and verify that the application is using real local data.

No online tile server or synthetic elevation is used by the offline GIS path.

## Licensing

Only use imagery, terrain, and elevation datasets that you are legally permitted to store and redistribute. The Alpha source repository contains the integration code, not third-party geographic datasets.
