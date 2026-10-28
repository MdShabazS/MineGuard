// Real-world geography is display-only. World/room/sensing still use the
// original fictional 200×200 coordinates and no private scenario metadata.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BITM_AREA, BITM_TILE_ZOOM, BITM_TEXTURE_SIZE, bitmBounds, bitmSatelliteTiles, esriWorldImageryTileUrl, geographicToVirtual,
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

test('BITM satellite loads real MapServer cached tiles with north-up Web Mercator alignment', () => {
  const tiles = bitmSatelliteTiles();
  assert.ok(tiles.length >= 9 && tiles.length <= 49, 'Limited number of public display tiles');
  assert.ok(tiles.every((t) => t.zoom === BITM_TILE_ZOOM));
  assert.ok(tiles.every((t) => Number.isFinite(t.drawX) && Number.isFinite(t.drawY)));
  assert.ok(tiles.every((t) => t.drawWidth > 0 && t.drawHeight > 0));
  assert.ok(tiles.some((t) => t.drawX < 0), 'Edge tiles crop to the square imagery extent');
  assert.ok(tiles.some((t) => t.drawY < 0), 'North image tiles crop at the north boundary');
  const url = new URL(esriWorldImageryTileUrl(tiles[0]));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 'services.arcgisonline.com');
  assert.match(url.pathname, /^\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/14\/\d+\/\d+$/);
  assert.ok(!url.pathname.endsWith('/export'), 'Never depend on an Esri map export blank image');
  const xSort = [...new Set(tiles.map((t) => t.x))].sort((a,b)=>a-b);
  const ySort = [...new Set(tiles.map((t) => t.y))].sort((a,b)=>a-b);
  assert.equal(tiles.length, xSort.length * ySort.length);
  assert.equal(tiles[0].y, ySort[0]);
  assert.equal(tiles[0].x, xSort[0]);
  assert.ok(tiles[tiles.length-1].drawY + tiles[tiles.length-1].drawHeight >= BITM_TEXTURE_SIZE);
  assert.throws(() => esriWorldImageryTileUrl({ zoom: 19, x: -1, y: 2 }));
  assert.throws(() => bitmSatelliteTiles(99999));
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
