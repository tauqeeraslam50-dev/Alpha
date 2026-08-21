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

Write-Host "Pakistan SRTM 1 arc-second (~30 m) HGT acquisition" -ForegroundColor Cyan
Write-Host "Output: $OutputRoot"
Write-Host "Coverage grid: ${South}..$North N, ${West}..$East E"
Write-Host "Source: public SRTM elevation archive"
Write-Host ""

for ($lat = $South; $lat -lt $North; $lat++) {
  $band = ('{0}{1:00}' -f $(if ($lat -ge 0) {'N'} else {'S'}), [Math]::Abs($lat))
  for ($lon = $West; $lon -lt $East; $lon++) {
    $tile = TileName $lat $lon
    $target = Join-Path $OutputRoot "$tile.hgt"
    if (Test-Path $target) { $skipped++; continue }

    $gz = Join-Path $env:TEMP "$tile.hgt.gz"
    $url = "https://s3.amazonaws.com/elevation-tiles-prod/skadi/$band/$tile.hgt.gz"
    try {
      Write-Host "[$($downloaded + $skipped + 1)] $tile" -NoNewline
      Invoke-WebRequest -Uri $url -OutFile $gz -UseBasicParsing
      $input = [System.IO.File]::OpenRead($gz)
      try {
        $output = [System.IO.File]::Create($target)
        try {
          $gzip = New-Object System.IO.Compression.GZipStream($input, [System.IO.Compression.CompressionMode]::Decompress)
          try { $gzip.CopyTo($output) } finally { $gzip.Dispose() }
        } finally { $output.Dispose() }
      } finally { $input.Dispose() }

      $bytes = (Get-Item $target).Length
      if ($bytes -ne (2 * 3601 * 3601)) {
        Remove-Item -Force $target
        throw "Unexpected HGT size: $bytes bytes; expected 3601x3601 SRTM GL1"
      }
      $downloaded++
      Write-Host "  OK" -ForegroundColor Green
    } catch {
      Remove-Item -Force -ErrorAction SilentlyContinue $target
      $failed += "$tile : $($_.Exception.Message)"
      Write-Host "  unavailable" -ForegroundColor Yellow
    } finally {
      Remove-Item -Force -ErrorAction SilentlyContinue $gz
    }
  }
}

Write-Host ""
Write-Host "Completed. Downloaded: $downloaded; already present: $skipped; unavailable: $($failed.Count)." -ForegroundColor Cyan
if ($failed.Count) {
  Write-Host "Unavailable tiles:" -ForegroundColor Yellow
  $failed | ForEach-Object { Write-Host " - $_" }
}
Write-Host "The application can now Scan Data and load real HGT elevation for LOS testing."
