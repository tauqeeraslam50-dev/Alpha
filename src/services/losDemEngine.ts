import { DemTile, sampleTerrain } from './demService';

export type RadioEndpoint = {
  lat: number;
  lon: number;
  antennaHeightMeters: number;
};

export type LosResult = {
  distanceMeters: number;
  samples: ReturnType<typeof sampleTerrain>;
  terrainAvailable: boolean;
  obstructed: boolean;
  obstructionIndex: number | null;
  minimumClearanceMeters: number | null;
};

/**
 * Terrain-only LOS check. It intentionally does not fabricate elevation when DEM
 * coverage is missing. Fresnel clearance and RF link-budget calculations should
 * be applied by the higher-level RF engine after this terrain profile is known.
 */
export function calculateTerrainLos(
  index: DemTile[],
  readTile: (tile: DemTile) => ArrayBuffer,
  a: RadioEndpoint,
  b: RadioEndpoint,
  sampleCount = 200,
): LosResult {
  const samples = sampleTerrain(index, readTile, a, b, sampleCount);
  const available = samples.filter((s) => s.terrainElevationMeters != null);
  if (available.length !== samples.length) {
    return {
      distanceMeters: samples.at(-1)?.distanceMeters ?? 0,
      samples,
      terrainAvailable: false,
      obstructed: false,
      obstructionIndex: null,
      minimumClearanceMeters: null,
    };
  }

  const aTerrain = samples[0].terrainElevationMeters! + a.antennaHeightMeters;
  const bTerrain = samples.at(-1)!.terrainElevationMeters! + b.antennaHeightMeters;
  let minClearance = Number.POSITIVE_INFINITY;
  let obstructionIndex: number | null = null;

  for (let i = 1; i < samples.length - 1; i++) {
    const f = i / (samples.length - 1);
    const direct = aTerrain + (bTerrain - aTerrain) * f;
    const clearance = direct - samples[i].terrainElevationMeters!;
    if (clearance < minClearance) minClearance = clearance;
    if (clearance < 0 && obstructionIndex == null) obstructionIndex = i;
  }

  return {
    distanceMeters: samples.at(-1)?.distanceMeters ?? 0,
    samples,
    terrainAvailable: true,
    obstructed: obstructionIndex != null,
    obstructionIndex,
    minimumClearanceMeters: Number.isFinite(minClearance) ? minClearance : null,
  };
}
