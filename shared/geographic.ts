// MineGuard geography overlay: only a VISUAL map choice, never part of private
// scenario truth, server flight physics, or real ordnance detection.
//
// GPS coordinate source: BITM's own 2024 campus geo-tagged academic evidence
// (https://www.bitm.edu.in/assets/frontend/pdf/2023/2.3.2-Addl-Info.pdf).
// The 5 km circle is an approximate local tangent-plane extent in WGS84.
export const BITM_AREA = {
  id: 'bitm-ballari-5km',
  title: 'BITM Ballari · 5 km satellite view',
  latitude: 15.168082,
  longitude: 76.850186,
  radiusMeters: 5000,
  imageSource: 'Esri World Imagery',
  attribution: 'Imagery: Esri and its imagery data providers · Powered by Esri',
} as const;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}
export interface GeoBounds {
  west: number;
  east: number;
  north: number;
  south: number;
}
export const REAL_WORLD_RADIUS_UNITS = 100;
export const METERS_PER_SIMULATED_UNIT = BITM_AREA.radiusMeters / REAL_WORLD_RADIUS_UNITS;

// Local latitude-dependent WGS84 conversion; appropriate for a 5 km visual map
// and explicitly not survey-grade/GPS flight navigation.
function metresPerDegree(latitude: number): { lat: number; lon: number } {
  const phi = latitude * Math.PI / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi),
    lon: 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi),
  };
}

export function bitmBounds(): GeoBounds {
  const m = metresPerDegree(BITM_AREA.latitude);
  const northDelta = BITM_AREA.radiusMeters / m.lat;
  const eastDelta = BITM_AREA.radiusMeters / m.lon;
  return {
    west: BITM_AREA.longitude - eastDelta,
    east: BITM_AREA.longitude + eastDelta,
    north: BITM_AREA.latitude + northDelta,
    south: BITM_AREA.latitude - northDelta,
  };
}

/** Scene X points east; scene Z points south; centre (100,100) is BITM. */
export function virtualToGeographic(x: number, z: number): GeoPoint {
  const m = metresPerDegree(BITM_AREA.latitude);
  return {
    latitude: BITM_AREA.latitude + (100 - z) * METERS_PER_SIMULATED_UNIT / m.lat,
    longitude: BITM_AREA.longitude + (x - 100) * METERS_PER_SIMULATED_UNIT / m.lon,
  };
}
export function geographicToVirtual(latitude: number, longitude: number): { x: number; z: number } {
  const m = metresPerDegree(BITM_AREA.latitude);
  return {
    x: 100 + (longitude - BITM_AREA.longitude) * m.lon / METERS_PER_SIMULATED_UNIT,
    z: 100 - (latitude - BITM_AREA.latitude) * m.lat / METERS_PER_SIMULATED_UNIT,
  };
}
export function withinBitmRadius(x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) &&
    Math.hypot(x - 100, z - 100) <= REAL_WORLD_RADIUS_UNITS + 1e-9;
}

/** One live, non-cached map image, requested by a visitor who selects Satellite.
 * Do not scrape tiles or save this provider imagery as an offline asset.
 * The optional imported local-file mode is for user-owned/licensed imagery.
 */
export function bitmSatelliteImageUrl(pixelSize = 2048): string {
  if (!Number.isInteger(pixelSize) || pixelSize < 256 || pixelSize > 2048) {
    throw Error('Satellite image size must be an integer from 256 through 2048.');
  }
  const b = bitmBounds();
  const params = new URLSearchParams({
    bbox: [b.west, b.south, b.east, b.north].map((v) => v.toFixed(8)).join(','),
    bboxSR: '4326',
    imageSR: '4326',
    size: pixelSize + ',' + pixelSize,
    format: 'jpg',
    transparent: 'false',
    f: 'image',
  });
  return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?' + params.toString();
}
