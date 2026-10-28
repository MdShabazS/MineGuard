// Real-world geography is display-only. World/room/sensing still use the
// original fictional 200×200 coordinates and no private scenario metadata.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BITM_AREA, bitmBounds, bitmSatelliteImageUrl, geographicToVirtual,
  METERS_PER_SIMULATED_UNIT, virtualToGeographic, withinBitmRadius,
} from '../../shared/geographic.js';
import { createWorldDefinition, isInBounds, worldToScene } from '../../shared/world.js';

test('BITM 5km georeferenced preset is centred on the college', () => {
  assert.equal(BITM_AREA.radiusMeters, 5000);
  assert.equal(METERS_PER_SIMULATED_UNIT, 50);
  assert.deepEqual(virtualToGeographic(100, 100), {
    latitude: BITM_AREA.latitude, longitude: BITM_AREA.longitude,
  });
  assert.deepEqual(geographicToVirtual(BITM_AREA.latitude, BITM_AREA.longitude), { x: 100, z: 100 });
  assert.ok(withinBitmRadius(100, 0));
  assert.ok(withinBitmRadius(0, 100));
  assert.ok(withinBitmRadius(200, 100));
  assert.ok(withinBitmRadius(100, 200));
  assert.ok(!withinBitmRadius(0, 0)); // corner of square, outside circular radius
  assert.ok(!withinBitmRadius(Number.NaN, 100));
});

test('BITM 5km square image is a north-up WGS84 bounding rectangle', () => {
  const b = bitmBounds();
  assert.ok(b.west < BITM_AREA.longitude && BITM_AREA.longitude < b.east);
  assert.ok(b.south < BITM_AREA.latitude && BITM_AREA.latitude < b.north);
  const nw = virtualToGeographic(0, 0);
  const se = virtualToGeographic(200, 200);
  for (const [actual, expected] of [[b.west, nw.longitude], [b.north, nw.latitude], [b.east, se.longitude], [b.south, se.latitude]]) {
    assert.ok(Math.abs(actual - expected) < 1e-10);
  }
  for (const [x, z] of [[0, 0], [0, 100], [50, 40], [100, 100], [150, 170], [200, 200]]) {
    const g = virtualToGeographic(x, z);
    const back = geographicToVirtual(g.latitude, g.longitude);
    assert.ok(Math.abs(x - back.x) < 1e-8);
    assert.ok(Math.abs(z - back.z) < 1e-8);
  }
});

test('satellite link uses only the authorized static imagery endpoint and bounded image size', () => {
  const url = new URL(bitmSatelliteImageUrl());
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'server.arcgisonline.com');
  assert.equal(url.pathname, '/ArcGIS/rest/services/World_Imagery/MapServer/export');
  assert.equal(url.searchParams.get('size'), '2048,2048');
  assert.equal(url.searchParams.get('bboxSR'), '4326');
  assert.equal(url.searchParams.get('imageSR'), '4326');
  assert.equal(url.searchParams.get('f'), 'image');
  assert.deepEqual(url.searchParams.get('bbox')?.split(',').map(Number).length, 4);
  assert.throws(() => bitmSatelliteImageUrl(99999));
  assert.throws(() => bitmSatelliteImageUrl(0));
  assert.throws(() => bitmSatelliteImageUrl(1024.2));
});

test('satellite selection does not mutate the fictional world or its terrain checksum', () => {
  const before = createWorldDefinition();
  const virtualPoint = worldToScene(before, 75, 125);
  const geographic = virtualToGeographic(75, 125);
  assert.ok(Number.isFinite(geographic.latitude) && Number.isFinite(geographic.longitude));
  const after = createWorldDefinition();
  assert.deepEqual(after, before);
  assert.deepEqual(worldToScene(after, 75, 125), virtualPoint);
  assert.ok(isInBounds(after, 75, 125));
});
