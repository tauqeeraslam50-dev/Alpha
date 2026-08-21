param(
  [string]$OutputRoot = "$(Split-Path -Parent $PSScriptRoot)\rnms-data\dem",
  [int]$South = 23,
  [int]$North = 38,
  [int]$West = 60,
  [int]$East = 79
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

function TileName([int]$lat, [int]$lon) {
  $ns = if ($lat -ge 0) { 'N' } else { 'S' }
  $ew = if ($lon -ge 0) { 'E' } else { 'W' }
  return ('{0}{1:00}{2}{3:000}' -f $ns, [Math]::Abs($lat), $ew, [Math]::Abs($lon))
}

$downloaded = 0
$skipped = 0
$failed = @()

Write-Host "Pakistan SRTM GL1 (~30 m) HGT acquisition" -ForegroundColor Cyan
Write-Host "Output: $OutputRoot"
Write-Host "Coverage grid: ${South}..$North N, ${West}..$East E"
Write-Host "Source: OpenTopography public SRTM GL1 mirror"
Write-Host ""

for ($lat = $South; $lat -lt $North; $lat++) {
  for ($lon = $West; $lon -lt $East; $lon++) {
    $tile = TileName $lat $lon
    $target = Join-Path $OutputRoot "$tile.hgt"
    if (Test-Path $target) { $skipped++; continue }

    $zip = Join-Path $env:TEMP "$tile.zip"
    $url = "https://opentopography.s3.sdsc.edu/raster/SRTM_GL1/$tile.SRTMGL1.hgt.zip"
    try {
      Write-Host "[$($downloaded + $skipped + 1)] $tile" -NoNewline
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
      Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force
      $extracted = Join-Path $env:TEMP "$tile.SRTMGL1.hgt"
      if (-not (Test-Path $extracted)) { $extracted = Join-Path $env:TEMP "$tile.hgt" }
      if (-not (Test-Path $extracted)) { throw "Archive did not contain expected HGT file" }

      $bytes = (Get-Item $extracted).Length
      if ($bytes -ne (2 * 3601 * 3601)) { throw "Unexpected HGT size: $bytes bytes; expected SRTM GL1 3601x3601" }
      Move-Item -Force $extracted $target
      $downloaded++
      Write-Host "  OK" -ForegroundColor Green
    } catch {
      $failed += "$tile : $($_.Exception.Message)"
      Write-Host "  unavailable" -ForegroundColor Yellow
    } finally {
      Remove-Item -Force -ErrorAction SilentlyContinue $zip
      Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $env:TEMP "$tile.SRTMGL1.hgt")
      Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $env:TEMP "$tile.hgt")
    }
  }
}

Write-Host ""
Write-Host "Completed. Downloaded: $downloaded; already present: $skipped; unavailable: $($failed.Count)." -ForegroundColor Cyan
if ($failed.Count) {
  Write-Host "Unavailable tiles:" -ForegroundColor Yellow
  $failed | ForEach-Object { Write-Host " - $_" }
}
Write-Host "The application will index valid HGT files automatically after Scan Data / restart."
