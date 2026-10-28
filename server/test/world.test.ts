import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import {
  createWorldDefinition,
  distanceToRoad,
  isInBounds,
  roundCoord,
  sceneToWorld,
  terrainHeight,
  worldChecksum,
  worldToScene,
  type WorldDefinition,
} from '../../shared/world.js';
import { createMineGuardServer } from '../src/app.js';

const world = createWorldDefinition();

test('world is deterministic: two builds give identical content and checksum', () => {
  const again = createWorldDefinition();
  assert.deepEqual(again, world);
  const { checksum, ...rest } = world;
  assert.equal(worldChecksum(rest), checksum);
});

test('world bounds are 0..200 on X and Z, with features inside them', () => {
  assert.deepEqual([world.xMin, world.xMax, world.zMin, world.zMax], [0, 200, 0, 200]);
  assert.equal(world.trees.length, 140);
  for (const t of world.trees) assert.ok(isInBounds(world, t.x, t.z), `tree ${t.x},${t.z}`);
  for (const l of world.landmarks) assert.ok(isInBounds(world, l.x, l.z), l.id);
  for (const r of world.roads) for (const [x, z] of r.points) assert.ok(isInBounds(world, x, z), r.id);
});

test('trees keep clear of roads', () => {
  for (const t of world.trees) for (const r of world.roads) assert.ok(distanceToRoad(r, t.x, t.z) >= r.width + 3);
});

test('world <-> scene mapping: corners, centre and round trip', () => {
  assert.deepEqual(worldToScene(world, 100, 100).filter((_, i) => i !== 1), [0, 0]);
  const [sx0, , sz0] = worldToScene(world, 0, 0);
  assert.deepEqual([sx0, sz0], [-100, -100]);
  const [sx1, , sz1] = worldToScene(world, 200, 200);
  assert.deepEqual([sx1, sz1], [100, 100]);
  for (const [x, z] of [[30, 40], [75, 80], [120, 105], [170, 160], [60, 130], [0.1, 199.9]]) {
    const [sx, sy, sz] = worldToScene(world, x, z);
    assert.deepEqual(sceneToWorld(world, sx, sz).map(roundCoord), [x, z]);
    assert.equal(sy, terrainHeight(world, x, z));
  }
});

test('bounds checks reject outside and non-finite coordinates', () => {
  assert.ok(isInBounds(world, 0, 0));
  assert.ok(isInBounds(world, 200, 200));
  assert.ok(!isInBounds(world, -0.1, 50));
  assert.ok(!isInBounds(world, 50, 200.1));
  assert.ok(!isInBounds(world, Number.NaN, 10));
  assert.ok(!isInBounds(world, 10, Number.POSITIVE_INFINITY));
});

test('terrain height is finite, smooth and peaks on hills', () => {
  for (let x = 0; x <= 200; x += 5) for (let z = 0; z <= 200; z += 5) assert.ok(Number.isFinite(terrainHeight(world, x, z)));
  for (const h of world.hills) assert.ok(terrainHeight(world, h.x, h.z) > h.height * 0.9, `hill at ${h.x},${h.z}`);
  assert.ok(Math.abs(terrainHeight(world, 50, 50) - terrainHeight(world, 50.5, 50)) < 0.5);
});

const { httpServer, io } = createMineGuardServer({ dbPath: ':memory:' });
let baseUrl = '';
before(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});
after(async () => {
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
});

test('GET /api/world serves the same world to every client', async () => {
  const [a, b] = await Promise.all([fetch(`${baseUrl}/api/world`), fetch(`${baseUrl}/api/world`)]);
  assert.equal(a.status, 200);
  const wa = (await a.json()) as WorldDefinition;
  const wb = (await b.json()) as WorldDefinition;
  assert.deepEqual(wa, wb);
  assert.deepEqual(wa, world);
});

test('GET /api/world contains no scenario, hazard or token fields', async () => {
  const body = await (await fetch(`${baseUrl}/api/world`)).text();
  for (const word of ['hazard', 'decoy', 'token', 'scenario', 'attacker']) assert.ok(!body.toLowerCase().includes(word), word);
});
