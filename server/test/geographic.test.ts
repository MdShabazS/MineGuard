// Real-world geography is display-only. World/room/sensing still use the
// original fictional 200×200 coordinates and no private scenario metadata.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BITM_AREA, BITM_TILE_ZOOM, BITM_TEXTURE_SIZE, bitmBounds, bitmSatelliteTiles, esriWorldImageryTileUrl, geographicToVirtual,
  METERS_PER_SIMULATED_UNIT, virtualToGeographic, withinBitmRadius,
  geoTilesForBounds, virtualRectToGeoBounds, planBitmDetail,
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


test('progressive BITM detail requests only bounded, visible geographic images', () => {
  assert.equal(planBitmDetail(100, 100, 290, 1.5), null, 'Far overview preserves full z14 base');
  const samples = [
    { distance: 90, minZoom: 14, maxZoom: 16 },
    { distance: 40, minZoom: 15, maxZoom: 17 },
    { distance: 20, minZoom: 16, maxZoom: 18 },
    { distance: 7, minZoom: 17, maxZoom: 19 },
  ];
  let prior = 14;
  for (const example of samples) {
    const p = planBitmDetail(100, 100, example.distance, 1.4);
    assert.ok(p);
    assert.ok(p.zoom >= example.minZoom && p.zoom <= example.maxZoom);
    assert.ok(p.zoom >= prior, 'Zooming closer must not reduce image resolution');
    assert.ok(p.tiles > 0 && p.tiles <= 64, 'No bulk satellite downloads');
    const tiles = geoTilesForBounds(p.bounds, BITM_TEXTURE_SIZE, p.zoom);
    assert.equal(tiles.length, p.tiles);
    assert.ok(tiles.every((t) => t.zoom === p.zoom));
    assert.ok(p.xMin >= 0 && p.zMin >= 0 && p.xMax <= 200 && p.zMax <= 200);
    const nw = virtualToGeographic(p.xMin, p.zMin);
    const se = virtualToGeographic(p.xMax, p.zMax);
    assert.ok(Math.abs(p.bounds.west - nw.longitude) < 1e-10);
    assert.ok(Math.abs(p.bounds.north - nw.latitude) < 1e-10);
    assert.ok(Math.abs(p.bounds.east - se.longitude) < 1e-10);
    assert.ok(Math.abs(p.bounds.south - se.latitude) < 1e-10);
    prior = p.zoom;
  }
});

test('progressive detail requests are stable during small pan and change after larger pan', () => {
  const a = planBitmDetail(100, 100, 18, 1.4);
  const b = planBitmDetail(100.1, 99.9, 18, 1.4);
  const c = planBitmDetail(118, 112, 18, 1.4);
  assert.ok(a && b && c);
  assert.equal(a.key, b.key, 'Tiny camera motion must not reload new satellite imagery');
  assert.notEqual(a.key, c.key, 'Panning needs new geographic detail');
  assert.equal(a.zoom, c.zoom, 'Pan retains native detail level');
  const edge = planBitmDetail(198, 198, 7, 2.4);
  assert.ok(edge);
  assert.ok(edge.xMin >= 0 && edge.xMax <= 200 && edge.zMin >= 0 && edge.zMax <= 200);
});

test('satellite detail enforces valid rectangles and rejects inappropriate tile requests', () => {
  assert.throws(() => virtualRectToGeoBounds(5, 5, 205, 10));
  assert.throws(() => virtualRectToGeoBounds(10, 10, 9, 20));
  assert.throws(() => geoTilesForBounds(bitmBounds(), 0, 18));
  assert.throws(() => geoTilesForBounds(bitmBounds(), 1536, 23));
  assert.equal(planBitmDetail(NaN, 100, 20, 1), null);
  assert.equal(planBitmDetail(100, 100, 20, 0), null);
});
