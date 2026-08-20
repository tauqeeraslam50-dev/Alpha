# RNMS Offline GIS Data

This directory is intentionally separate from application code so large GIS datasets are not embedded in source files.

## Satellite / raster tiles

Place XYZ raster tiles under:

`maps/tiles/satellite/{z}/{x}/{y}.jpg`

PNG and WebP are also supported. The Electron runtime serves these files through the local `rnms://tiles/...` protocol; no Internet tile provider is required.

## Terrain tiles

Place terrain raster tiles under:

`maps/tiles/terrain/{z}/{x}/{y}.png`

## DEM

Place real SRTM/HGT files under:

`dem/N33E073.hgt`

The loader supports standard square HGT tiles and bilinear interpolation. Missing DEM tiles are reported as unavailable rather than replaced by synthetic elevation.

## Pakistan coverage

Use legally licensed imagery/terrain datasets for the Pakistan coverage package. The application provides the import/runtime architecture; large imagery and DEM datasets are intentionally not committed to Git.
