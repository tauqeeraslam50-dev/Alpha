param(
  [string]$OutputRoot = "$(Split-Path -Parent $PSScriptRoot)\rnms-data\imagery-test"
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

@"
REAL OFFLINE SATELLITE TEST DATA
================================
AOI: 72..74 E, 33..34 N (Islamabad/Rawalpindi test area)

Recommended source: ESA Sentinel-2 Level-2A open imagery.
The Microsoft Planetary Computer STAC API can search Sentinel-2 L2A by bbox/date/cloud cover.

This script intentionally does NOT silently download a guessed scene. A scene must first be selected
from STAC metadata, then its visual/reflectance assets can be downloaded and converted to a COG/GeoTIFF.
The next conversion stage should create a Web Mercator raster tile set and package it as PMTiles:

  rnms-data/maps/pakistan-satellite.pmtiles

For a reproducible offline test, select a recent low-cloud scene covering the complete AOI, download the
visual asset, validate its CRS/bounds, and generate PMTiles. Do not use online map URLs at runtime.

STAC API:
https://planetarycomputer.microsoft.com/api/stac/v1
Collection:
sentinel-2-l2a
BBox:
72,33,74,34

After acquisition, copy the generated PMTiles to:
  rnms-data/maps/pakistan-satellite.pmtiles

Then Alpha Offline GIS Manager -> Scan Data -> Validate Data.
"@ | Set-Content -Encoding UTF8 (Join-Path $OutputRoot 'README.txt')

Write-Host "Created satellite test-data workspace: $OutputRoot" -ForegroundColor Cyan
Write-Host "Use the STAC metadata workflow documented in README.txt; Alpha remains fully offline at runtime." -ForegroundColor Green
