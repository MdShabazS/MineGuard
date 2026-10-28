import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BITM_GEO, distanceFromBitmMeters, geoToWorld, satelliteTileCoverage, worldToGeo } from '../../shared/geo.js';
import { createWorldDefinition } from '../../shared/world.js';

test('BITM map: exact campus centre and 5km radius in the visual 200-unit reference', () => {
  assert.equal(BITM_GEO.latitude, 15.1679);
  assert.equal(BITM_GEO.longitude, 76.850231);
  assert.equal(BITM_GEO.radiusMetres, 5000);
  assert.deepEqual(worldToGeo(100, 100), { latitude: BITM_GEO.latitude, longitude: BITM_GEO.longitude });
  assert.deepEqual(geoToWorld(BITM_GEO.latitude, BITM_GEO.longitude).x, 100);
  assert.ok(Math.abs(geoToWorld(BITM_GEO.latitude, BITM_GEO.longitude).z - 100) < 1e-7);
  for (const [x, z] of [[100, 0], [0, 100], [100, 200], [200, 100]]) {
    assert.equal(distanceFromBitmMeters(x, z), 5000);
  }
  assert.equal(distanceFromBitmMeters(0, 0) > 5000, true, 'corners are beyond the circular 5 km boundary');
});

test('BITM map: geography is north-up / east-right and round-trip works for entire view', () => {
  const north = worldToGeo(100, 0);
  const south = worldToGeo(100, 200);
  const east = worldToGeo(200, 100);
  const west = worldToGeo(0, 100);
  assert.ok(north.latitude > BITM_GEO.latitude);
  assert.ok(south.latitude < BITM_GEO.latitude);
  assert.ok(east.longitude > BITM_GEO.longitude);
  assert.ok(west.longitude < BITM_GEO.longitude);
  for (const [x, z] of [[0, 0], [100, 100], [200, 200], [33.6, 186.1], [200, 0]]) {
    const converted = worldToGeo(x, z);
    const back = geoToWorld(converted.latitude, converted.longitude);
    assert.ok(Math.abs(back.x - x) < 1e-8, JSON.stringify({ x, back }));
    assert.ok(Math.abs(back.z - z) < 1e-8, JSON.stringify({ z, back }));
  }
  assert.throws(() => geoToWorld(NaN, 76.85), /Invalid/);
  assert.throws(() => geoToWorld(91, 76.85), /Invalid/);
});

test('BITM map: bounded XYZ raster tile selections at three supported detail levels', () => {
  for (const zoom of [13, 14, 15] as const) {
    const coverage = satelliteTileCoverage(zoom);
    assert.ok(coverage.tiles.length > 0 && coverage.tiles.length < 144);
    assert.ok(coverage.widthPixel > 0);
    assert.ok(coverage.heightPixel > 0);
    const unique = new Set(coverage.tiles.map((t) => t.zoom + ':' + t.x + ':' + t.y));
    assert.equal(unique.size, coverage.tiles.length);
    const n = 2 ** zoom;
    assert.ok(coverage.tiles.every((t) => t.x >= 0 && t.x < n && t.y >= 0 && t.y < n));
  }
  assert.ok(satelliteTileCoverage(13).tiles.length < satelliteTileCoverage(15).tiles.length);
});

test('BITM map does not change the canonical fictional terrain checksum', () => {
  const before = createWorldDefinition();
  worldToGeo(40, 70);
  satelliteTileCoverage(14);
  const after = createWorldDefinition();
  assert.deepEqual(after, before);
  assert.equal(after.terrainId, 'mg-field-01');
  assert.equal(after.xMax, 200);
});
