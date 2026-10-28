// BITM Ballari 5 km geographic reference overlay.
// The project's server simulation is STILL a fictional 200x200 X/Z world.
// This module maps that square to an APPROXIMATE real-world square for
// imagery display only. It never feeds lat/lon to sensor or mission APIs.
//
// Centre: a representative point on BITM's Jnana Gangotri campus, derived
// from geotagged campus photos (15°10′4.44″ N, 76°51′0.8316″ E).
// Not an authoritative cadastral/survey coordinate.
export const BITM_GEO = {
  name: 'Ballari Institute of Technology & Management (BITM)',
  locality: 'Near Allipura, Ballari, Karnataka, India',
  latitude: 15.1679,
  longitude: 76.850231,
  radiusMetres: 5000,
  // The 5 km circle fits within a 10x10 km square visual reference area.
  // A 200-unit simulation board remains unchanged: 1 virtual unit ~50 m
  // FOR THE BACKGROUND DISPLAY ONLY (not a calibrated detector footprint).
  virtualUnits: 200,
  label: 'BITM Ballari · 5 km radius · geographic reference only',
} as const;

const EARTH_RADIUS_M = 6378137;
const MAX_MERCATOR_LAT = 85.05112878;
const clampLatitude = (lat: number) => Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
const rad = (v: number) => v * Math.PI / 180;
const deg = (v: number) => v * 180 / Math.PI;

export interface GeoPoint { latitude: number; longitude: number }

export function mercatorX(longitude: number): number {
  return EARTH_RADIUS_M * rad(longitude);
}
export function mercatorY(latitude: number): number {
  return EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + rad(clampLatitude(latitude)) / 2));
}

export function worldToGeo(x: number, z: number): GeoPoint {
  const scale = Math.cos(rad(BITM_GEO.latitude));
  const centreX = mercatorX(BITM_GEO.longitude);
  const centreY = mercatorY(BITM_GEO.latitude);
  const metersPerUnit = (BITM_GEO.radiusMetres * 2) / BITM_GEO.virtualUnits;
  const eastMeters = (x - BITM_GEO.virtualUnits / 2) * metersPerUnit;
  const southMeters = (z - BITM_GEO.virtualUnits / 2) * metersPerUnit;
  const longitude = deg((centreX + eastMeters / scale) / EARTH_RADIUS_M);
  const latitude = deg(2 * Math.atan(Math.exp((centreY - southMeters / scale) / EARTH_RADIUS_M)) - Math.PI / 2);
  return { latitude, longitude };
}

export function geoToWorld(latitude: number, longitude: number): { x: number; z: number } {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) {
    throw new Error('Invalid geographic coordinate');
  }
  const scale = Math.cos(rad(BITM_GEO.latitude));
  const metresPerUnit = (BITM_GEO.radiusMetres * 2) / BITM_GEO.virtualUnits;
  return {
    x: BITM_GEO.virtualUnits / 2 + (mercatorX(longitude) - mercatorX(BITM_GEO.longitude)) * scale / metresPerUnit,
    z: BITM_GEO.virtualUnits / 2 - (mercatorY(latitude) - mercatorY(BITM_GEO.latitude)) * scale / metresPerUnit,
  };
}

export interface SatelliteTile {
  x: number;
  y: number;
  zoom: number;
}

/** XYZ tiles intersecting a 10 km square centered at BITM. Web Mercator. */
export function satelliteTileCoverage(zoom: 13 | 14 | 15): {
  tiles: SatelliteTile[];
  leftPixel: number;
  topPixel: number;
  widthPixel: number;
  heightPixel: number;
} {
  const nw = worldToGeo(0, 0);
  const se = worldToGeo(BITM_GEO.virtualUnits, BITM_GEO.virtualUnits);
  const n = 2 ** zoom;
  const toPixel = ({ latitude, longitude }: GeoPoint) => ({
    x: ((longitude + 180) / 360) * n * 256,
    y: ((1 - Math.asinh(Math.tan(rad(latitude))) / Math.PI) / 2) * n * 256,
  });
  const a = toPixel(nw);
  const b = toPixel(se);
  const x0 = Math.floor(a.x / 256);
  const x1 = Math.floor((b.x - 1e-8) / 256);
  const y0 = Math.floor(a.y / 256);
  const y1 = Math.floor((b.y - 1e-8) / 256);
  const tiles: SatelliteTile[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x >= 0 && y >= 0 && x < n && y < n) tiles.push({ zoom, x, y });
    }
  }
  return { tiles, leftPixel: a.x, topPixel: a.y, widthPixel: b.x - a.x, heightPixel: b.y - a.y };
}

export function distanceFromBitmMeters(x: number, z: number): number {
  return Math.hypot(x - 100, z - 100) * 50;
}
