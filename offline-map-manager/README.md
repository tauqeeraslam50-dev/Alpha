# Pakistan Offline Map Manager

Standalone Windows application for managing and viewing Pakistan offline map data.

## Phase 1 scope

- Offline-first desktop shell
- Local map-data folder selection
- Map viewer foundation
- Satellite PMTiles support foundation
- Vector/places layer foundation
- Terrain layer foundation
- No radio/network-management functionality
- No online map fallback

## Planned data layout

```text
map-data/
  satellite/
  terrain/
  vector/
  places/
  dem/
```

The application will not download map data automatically. Map packages will be supplied locally and validated before being displayed.

## Build

```powershell
cd offline-map-manager
npm install
npm run build
npm run electron:build
```
