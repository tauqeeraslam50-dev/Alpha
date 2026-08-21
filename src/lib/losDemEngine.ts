import { analyzeLineOfSight, calculateKnifeEdgeLoss, LOSAnalysisResult } from './losUtils';
import { getRuntimeElevation, loadDemForPath } from './demRuntime';
import { calculateDestinationPoint } from './utils';

export interface RuntimeDemAnalysis extends LOSAnalysisResult {
  terrainSource: 'REAL_DEM' | 'ESTIMATED';
  demTilesLoaded: number;
}

/**
 * Re-evaluates the existing LOS engine with real DEM elevations whenever
 * the required HGT tiles are installed and loaded. No synthetic elevation
 * is introduced when a real DEM sample is available.
 */
export function analyzeLineOfSightWithRuntimeDem(params: Parameters<typeof analyzeLineOfSight>[0]): RuntimeDemAnalysis {
  const base = analyzeLineOfSight(params);
  let realSamples = 0;
  let maxObstacleV = -Infinity;

  const updatedPoints = base.pathPoints.map((point, index, points) => {
    const demElevation = getRuntimeElevation(point.lat, point.lng);
    if (demElevation === null) return point;
    realSamples++;

    const fraction = base.distanceKm > 0 ? point.distanceKm / base.distanceKm : index / Math.max(points.length - 1, 1);
    const groundElevationM = demElevation;
    const effectiveObstacleElevationM = Number((groundElevationM + point.earthBulgeM + point.clutterHeightM).toFixed(2));
    const clearanceM = Number((point.losRayElevationM - effectiveObstacleElevationM).toFixed(2));
    const clearancePercentF1 = point.fresnelRadius1M > 0 ? Number(((clearanceM / point.fresnelRadius1M) * 100).toFixed(1)) : 100;
    const isObstructedOptical = clearanceM < 0;
    const isObstructedFresnel60 = clearanceM < point.fresnelRadius60M;

    if (index > 1 && index < points.length - 1) {
      const d1 = Math.max(point.d1Km * 1000, 0.001);
      const d2 = Math.max(point.d2Km * 1000, 0.001);
      const wavelengthM = 0.3 / Math.max(params.frequencyMHz / 1000, 0.000001);
      const hBlock = Math.max(0, effectiveObstacleElevationM - point.losRayElevationM);
      const v = hBlock * Math.sqrt((2 / wavelengthM) * ((1 / d1) + (1 / d2)));
      maxObstacleV = Math.max(maxObstacleV, v);
    }

    return { ...point, groundElevationM, effectiveObstacleElevationM, clearanceM, clearancePercentF1, isObstructedOptical, isObstructedFresnel60 };
  });

  if (realSamples === 0) return { ...base, terrainSource: 'ESTIMATED', demTilesLoaded: 0 };

  const internalPoints = updatedPoints.slice(1, -1);
  const worstPoint = internalPoints.reduce((worst, point) => {
    const worstRelative = worst.clearanceM - worst.fresnelRadius60M;
    const currentRelative = point.clearanceM - point.fresnelRadius60M;
    return currentRelative < worstRelative ? point : worst;
  }, internalPoints[0] || updatedPoints[0]);

  const status: LOSAnalysisResult['status'] = worstPoint.clearanceM < 0
    ? 'OBSTRUCTED'
    : worstPoint.clearanceM < worstPoint.fresnelRadius60M
      ? 'MARGINAL'
      : 'CLEAR';

  const diffractionLossDB = maxObstacleV > -Infinity ? calculateKnifeEdgeLoss(maxObstacleV) : 0;
  const totalPathLossDB = Number((base.fsplDB + diffractionLossDB).toFixed(2));

  return {
    ...base,
    pathPoints: updatedPoints,
    status,
    worstPoint: {
      distanceKm: worstPoint.distanceKm,
      lat: worstPoint.lat,
      lng: worstPoint.lng,
      clearanceM: worstPoint.clearanceM,
      clearancePercentF1: worstPoint.clearancePercentF1,
      groundElevationM: worstPoint.groundElevationM,
      earthBulgeM: worstPoint.earthBulgeM,
      fresnelRadius1M: worstPoint.fresnelRadius1M,
      obstacleElevationM: worstPoint.effectiveObstacleElevationM,
      losRayElevationM: worstPoint.losRayElevationM
    },
    diffractionLossDB,
    totalPathLossDB,
    terrainSource: 'REAL_DEM',
    demTilesLoaded: new Set(updatedPoints.map(p => `${Math.floor(p.lat)}:${Math.floor(p.lng)}`)).size
  };
}

/** Generate a path sample set and load every HGT tile intersecting it. */
export async function preloadDemForLos(params: Parameters<typeof analyzeLineOfSight>[0], samplePoints = 100) {
  const base = analyzeLineOfSight(params);
  const points = base.pathPoints.length > 0
    ? base.pathPoints.map(p => ({ lat: p.lat, lng: p.lng }))
    : Array.from({ length: samplePoints + 1 }, (_, i) => {
        const distanceKm = (base.distanceKm * i) / samplePoints;
        return calculateDestinationPoint(params.txLat, params.txLng, distanceKm, base.bearingDeg);
      });
  return loadDemForPath(points);
}
