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

/** Live, official ArcGIS cached World Imagery tiles for visual display.
 * The old MapServer/export URL decoded but gave no meaningful photo in some
 * browsers. Use the public tiled basemap layer instead (z/y/x, NOT z/x/y).
 * No bulk downloader, permanent cache, map export or server proxy.
 */
export const BITM_TILE_ZOOM = 14;
export const BITM_TILE_SIZE = 256;
export const BITM_TEXTURE_SIZE = 1536;

export interface SatelliteTile {
  zoom: number;
  x: number;
  y: number;
  // Location of this tile on the 1536×1536 BITM canvas. Values may be
  // negative / outside canvas for edge tiles: Canvas2D clips them naturally.
  drawX: number;
  drawY: number;
  drawWidth: number;
  drawHeight: number;
}

export function longitudeToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}
export function latitudeToTileY(lat: number, zoom: number): number {
  const phi = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  return ((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * 2 ** zoom;
}
export function esriWorldImageryTileUrl(tile: Pick<SatelliteTile, 'zoom' | 'x' | 'y'>): string {
  const { zoom, x, y } = tile;
  if (![zoom, x, y].every(Number.isInteger) || zoom < 0 || zoom > 19 ||
    x < 0 || y < 0 || x >= 2 ** zoom || y >= 2 ** zoom) {
    throw Error('Invalid public World Imagery tile coordinates.');
  }
  return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
}
export function bitmSatelliteTiles(size = BITM_TEXTURE_SIZE, zoom = BITM_TILE_ZOOM): SatelliteTile[] {
  if (!Number.isInteger(size) || size < 256 || size > 3072 ||
    !Number.isInteger(zoom) || zoom < 10 || zoom > 16) {
    throw Error('Invalid BITM satellite display settings.');
  }
  const b = bitmBounds();
  const x0 = longitudeToTileX(b.west, zoom);
  const x1 = longitudeToTileX(b.east, zoom);
  const y0 = latitudeToTileY(b.north, zoom);
  const y1 = latitudeToTileY(b.south, zoom);
  const tileSizeX = size / (x1 - x0);
  const tileSizeY = size / (y1 - y0);
  const tiles: SatelliteTile[] = [];
  for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
      tiles.push({
        zoom, x, y,
        drawX: (x - x0) * tileSizeX,
        drawY: (y - y0) * tileSizeY,
        drawWidth: tileSizeX,
        drawHeight: tileSizeY,
      });
    }
  }
  if (tiles.length > 100) throw Error('Too many image tiles requested.');
  return tiles;
}
