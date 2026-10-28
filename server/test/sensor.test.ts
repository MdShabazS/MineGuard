// MG-008 tests, named after DETECTION_ACCEPTANCE.md acceptance IDs (D01..D40).
// Fake clock + manual ticks: every timing assertion is exact.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import { cumulative, flownSubsegments, type MissionPlan, type MissionSnapshot } from '../../shared/mission.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.js';
import type { CreateRoomResponse } from '../../shared/scenario.js';
import { ADVANCED_THRESHOLD, decide, drawFromDigest, drawKey, firstEntry, FOOTPRINT_RADIUS, type PublicCandidate } from '../../shared/sensor.js';
import { createWorldDefinition } from '../../shared/world.js';
import { createMineGuardServer } from '../src/app.js';
import { CoverageGrid, sweep, type ObjectInterval } from '../src/mission/sensor.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
const world = createWorldDefinition();
const PUBLIC_KEYS = ['candidateId', 'footprintProfile', 'missionId', 'number', 'review', 'sensorMode', 'simTimeSeconds', 'source', 'x', 'z'];

// ---- pure sensor geometry and rules ------------------------------------------------

describe('sensor core (pure)', () => {
  test('D01 footprint radii are 6/10/16 and Advanced thresholds match the contract', () => {
    assert.deepEqual(FOOTPRINT_RADIUS, { NARROW: 6, STANDARD: 10, WIDE: 16 });
    assert.deepEqual(ADVANCED_THRESHOLD, { SURFACE: 0.9, OBSCURED: 0.7, BURIED: 0.5, ROCK: 0.2, SCRAP: 0.2, CONTAINER: 0.2 });
  });

  test('D06 contract hand calculation: (50,109.9) eligible, (50,110.1) not, exact boundary eligible', () => {
    const s = firstEntry(0, 100, 100, 100, 50, 109.9, 10)!;
    assert.ok(s !== null);
    // Entry where the footprint first reaches the point, not at closest approach (s=0.5).
    // Within the documented 1e-6 boundary tolerance.
    assert.ok(Math.abs(s - (50 - Math.sqrt(100 - 9.9 ** 2)) / 100) < 1e-6, `entry s=${s}`);
    assert.equal(firstEntry(0, 100, 100, 100, 50, 110.1, 10), null);
    assert.ok(firstEntry(0, 100, 100, 100, 50, 110, 10) !== null, 'exactly on r counts (tolerance 1e-6)');
    assert.equal(firstEntry(0, 100, 100, 100, 50, 110.00001, 10), null, 'tolerance is not an enlarged footprint');
    assert.equal(firstEntry(0, 100, 100, 100, 55, 100, 10, 0.5, 1), 0.5, 'already inside at clipped start');
    assert.equal(firstEntry(0, 100, 100, 100, 5, 100, 10, 0.5, 1), null, 'only behind the clipped start');
    assert.equal(firstEntry(30, 30, 30, 30, 35, 30, 10), 0, 'stationary segment inside footprint');
  });

  test('D07/D08 a long 4x step finds a hazard between its endpoints; turns are not shortcut', () => {
    assert.ok(firstEntry(0, 100, 200, 100, 100, 105, 10) !== null, 'neither endpoint is near');
    const pts = [{ x: 20, z: 20 }, { x: 100, z: 20 }, { x: 100, z: 100 }];
    const cum = cumulative(pts);
    // One tick covering the whole L route. A diagonal shortcut would pass (75,45); the real path is 25 away from it.
    const segs = flownSubsegments(pts, cum, 0, cum[2], 0, 20);
    const iv = (id: string, x: number, z: number): ObjectInterval => ({ objectId: id, kind: 'HAZARD', subtype: 'SURFACE', x, z, revision: 1, from: -Infinity, until: Infinity });
    const hits = sweep(segs, [iv('corner', 104, 18), iv('diag', 75, 45)], new Set(), 10);
    assert.deepEqual(hits.map((h) => h.objectId), ['corner']);
  });

  test('D10 sweep results are identical for 1x, 2x and 4x tick sizes', () => {
    const pts = [{ x: 10, z: 10 }, { x: 190, z: 10 }, { x: 190, z: 60 }, { x: 10, z: 60 }];
    const cum = cumulative(pts);
    const total = cum[cum.length - 1];
    const objects: ObjectInterval[] = Array.from({ length: 25 }, (_, i) => ({ objectId: `o${String(i).padStart(2, '0')}`, kind: 'HAZARD', subtype: 'SURFACE', x: 7 * i + 5, z: i % 2 ? 18 : 52, revision: 1, from: -Infinity, until: Infinity }));
    const run = (step: number) => {
      const decided = new Set<string>();
      const out: { id: string; t: number }[] = [];
      for (let d = 0; d < total; d += step) {
        const d1 = Math.min(total, d + step);
        for (const h of sweep(flownSubsegments(pts, cum, d, d1, d / 8, d1 / 8), objects, decided, 10)) {
          decided.add(h.objectId);
          out.push({ id: h.objectId, t: h.simTime });
        }
      }
      return out;
    };
    const a = run(0.8);
    const b = run(1.6);
    const c = run(3.2);
    const d = run(500);
    assert.ok(a.length > 10);
    for (const other of [b, c, d]) {
      assert.deepEqual(other.map((e) => e.id), a.map((e) => e.id));
      other.forEach((e, i) => assert.ok(Math.abs(e.t - a[i].t) < 1e-9));
    }
  });

  test('D14/D15 decision table at the thresholds; Basic never randomises', () => {
    for (const [sub, p] of Object.entries(ADVANCED_THRESHOLD) as [keyof typeof ADVANCED_THRESHOLD, number][]) {
      const kind = ['SURFACE', 'OBSCURED', 'BURIED'].includes(sub) ? 'HAZARD' : 'DECOY';
      const hit = kind === 'HAZARD' ? 'DETECTED' : 'FALSE_ALARM';
      const miss = kind === 'HAZARD' ? 'MISSED' : 'DECOY_IGNORED';
      assert.equal(decide('ADVANCED', kind, sub, p - 1e-12), hit, `${sub} below threshold`);
      assert.equal(decide('ADVANCED', kind, sub, p), miss, `${sub} at threshold`);
      assert.equal(decide('BASIC', kind, sub, 0.999), kind === 'HAZARD' ? 'DETECTED' : 'DECOY_IGNORED');
      assert.equal(decide('BASIC', kind, sub, 0), kind === 'HAZARD' ? 'DETECTED' : 'DECOY_IGNORED');
    }
  });

  test('seeded draw: deterministic, in [0,1), and different per object', () => {
    const u = (o: string) => drawFromDigest(crypto.createHash('sha256').update(drawKey('seed1', 'm1', o)).digest());
    assert.equal(u('a'), u('a'));
    assert.notEqual(u('a'), u('b'));
    const many = Array.from({ length: 2000 }, (_, i) => u(`obj${i}`));
    assert.ok(many.every((v) => v >= 0 && v < 1));
    const mean = many.reduce((s, v) => s + v, 0) / many.length;
    assert.ok(Math.abs(mean - 0.5) < 0.03, `roughly uniform (mean ${mean})`);
    assert.equal(drawFromDigest(new Uint8Array(32).fill(255)) < 1, true);
    assert.equal(drawFromDigest(new Uint8Array(32)), 0);
  });

  test('D36 coverage union: area of one pass, rescanning adds nothing, clipped at borders', () => {
    const g = new CoverageGrid(world, 10);
    g.add({ from: { x: 50, z: 100 }, to: { x: 150, z: 100 } });
    const one = g.estimate(null).sweptArea;
    const exact = 100 * 20 + Math.PI * 100;
    assert.ok(Math.abs(one - exact) / exact < 0.02, `area ${one} vs ${exact}`);
    g.add({ from: { x: 150, z: 100 }, to: { x: 50, z: 100 } });
    assert.equal(g.estimate(null).sweptArea, one, 'rescan is not double counted');
    const edge = new CoverageGrid(world, 10);
    edge.add({ from: { x: 0, z: 50 }, to: { x: 0, z: 150 } });
    const half = 100 * 10 + (Math.PI * 100) / 2;
    assert.ok(Math.abs(edge.estimate(null).sweptArea - half) / half < 0.03, 'clipped to the world');
    const rect = edge.estimate({ xMin: 0, xMax: 20, zMin: 50, zMax: 150 });
    assert.ok(rect.gridCoveragePercent! > 45 && rect.gridCoveragePercent! < 55, `${rect.gridCoveragePercent}%`);
  });
});

// ---- server integration -------------------------------------------------------------

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineguard-sensor-'));
const dbPath = path.join(tmpDir, 'sensor.sqlite');
let clock = 5_000_000;
const now = () => clock;
let server = createMineGuardServer({ dbPath, autoTick: false, now });
let baseUrl = '';
const sockets: ClientSocket[] = [];
async function listen() {
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
}
async function stop() {
  for (const s of sockets.splice(0)) s.disconnect();
  server.io.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
before(listen);
after(async () => {
  await stop();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function call(method: string, url: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}
const newRoom = async (live = false): Promise<CreateRoomResponse> => {
  const r = (await call('POST', '/api/rooms')).body as CreateRoomResponse;
  if (live) await call('POST', `/api/rooms/${r.roomCode}/attacker/mode`, { mode: 'LIVE' }, r.attackerToken);
  return r;
};
const place = async (r: CreateRoomResponse, kind: string, subtype: string, x: number, z: number) =>
  (await call('POST', `/api/rooms/${r.roomCode}/attacker/objects`, { kind, subtype, x, z }, r.attackerToken)).body.result as { id: string; revision: number };
const move = async (r: CreateRoomResponse, o: { id: string; revision: number }, x: number, z: number) =>
  (await call('PATCH', `/api/rooms/${r.roomCode}/attacker/objects/${o.id}`, { baseRevision: o.revision, x, z }, r.attackerToken)).body;
const del = (r: CreateRoomResponse, id: string) => call('DELETE', `/api/rooms/${r.roomCode}/attacker/objects/${id}`, undefined, r.attackerToken);
const lockIfChallenge = (r: CreateRoomResponse) => call('POST', `/api/rooms/${r.roomCode}/attacker/lock`, undefined, r.attackerToken);
const command = (r: CreateRoomResponse, body: unknown) => call('POST', `/api/rooms/${r.roomCode}/mission/command`, body);
const snapshot = async (r: CreateRoomResponse): Promise<MissionSnapshot> => (await call('GET', `/api/rooms/${r.roomCode}/mission`)).body;

const LINE = [{ x: 20, z: 100 }, { x: 180, z: 100 }];
async function fly(r: CreateRoomResponse, waypoints = LINE, opts: { sensorMode?: string; footprintProfile?: string; playbackSpeed?: number; routeKind?: string; grid?: unknown } = {}) {
  const body = opts.routeKind === 'GRID'
    ? { routeKind: 'GRID', grid: opts.grid, sensorMode: opts.sensorMode ?? 'BASIC', footprintProfile: opts.footprintProfile ?? 'STANDARD' }
    : { routeKind: 'MANUAL', waypoints, sensorMode: opts.sensorMode ?? 'BASIC', footprintProfile: opts.footprintProfile ?? 'STANDARD' };
  const p = (await call('POST', `/api/rooms/${r.roomCode}/mission/plan`, body)).body.plan as MissionPlan;
  assert.ok(p, 'plan accepted');
  const s = await command(r, { action: 'START', planId: p.id, planRevision: p.planRevision, playbackSpeed: opts.playbackSpeed ?? 1 });
  assert.equal(s.status, 200, s.text);
  return { plan: p, missionId: s.body.snapshot.mission.missionId as string };
}
/** Advance the fake clock in real-time steps (default 0.5 s) and tick. */
function run(seconds: number, step = 0.5) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    clock += Math.min(step, seconds - t) * 1000;
    server.engine.tickAll();
  }
}
/** Fly until the drone has covered `distance` units (at 1x, 8 units per simulated second). */
const runTo = async (r: CreateRoomResponse, distance: number) => {
  const cur = (await snapshot(r)).mission!.routeDistanceCompleted;
  run((distance - cur) / 8, 0.25);
};
const finish = (r: CreateRoomResponse) => run(60, 1);

function openSocket(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s: ClientSocket = connect(baseUrl, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}
async function join(code: string, token?: string) {
  const s = await openSocket();
  const frames: string[] = [];
  const candidates: PublicCandidate[] = [];
  let telemetry = 0;
  s.onAny((event, ...args) => event !== 'server:hello' && frames.push(JSON.stringify([event, ...args])));
  s.on('observation:created', (c) => candidates.push(c));
  s.on('mission:telemetry', () => telemetry++);
  const reply = await s.timeout(5000).emitWithAck('room:join', token ? { roomCode: code, attackerToken: token } : { roomCode: code });
  assert.ok(reply.ok);
  return { s, frames, candidates, telemetry: () => telemetry };
}
const settle = () => new Promise((r) => setTimeout(r, 120));
const decisions = (missionId: string) => server.sensor.decisions(missionId);

describe('Basic mode', () => {
  test('D02 one SURFACE hazard in the swept path: exactly one candidate at the true first-entry time', async () => {
    const r = await newRoom();
    await place(r, 'HAZARD', 'SURFACE', 100, 105);
    await lockIfChallenge(r);
    const blue = await join(r.roomCode);
    const { missionId } = await fly(r);
    finish(r);
    await settle();
    const snap = await snapshot(r);
    assert.equal(snap.candidates.length, 1);
    const c = snap.candidates[0];
    assert.deepEqual(Object.keys(c).sort(), PUBLIC_KEYS);
    assert.deepEqual([c.x, c.z, c.number, c.source, c.sensorMode, c.footprintProfile, c.review], [100, 105, 1, 'SIMULATED', 'BASIC', 'STANDARD', 'NEW']);
    // Footprint reaches (100,105) at x = 100 - sqrt(10² - 5²), i.e. 71.34 units after the start.
    const expected = (100 - Math.sqrt(75) - 20) / 8;
    assert.ok(Math.abs(c.simTimeSeconds - expected) < 1e-5, `${c.simTimeSeconds} vs ${expected}`); // 1e-6 radius tolerance
    assert.equal(blue.candidates.length, 1, 'Blue got exactly one observation:created');
    assert.deepEqual(blue.candidates[0], c);
    assert.equal(c.missionId, missionId);
    const d = decisions(missionId);
    assert.equal(d.length, 1);
    assert.equal(d[0].outcome, 'DETECTED');
    assert.equal(d[0].candidate_id, c.candidateId);
  });

  test('D03/D04/D05 OBSCURED and BURIED observed; decoys ignored; just-outside stays unscanned', async () => {
    const r = await newRoom();
    const obs = await place(r, 'HAZARD', 'OBSCURED', 60, 95);
    const bur = await place(r, 'HAZARD', 'BURIED', 120, 109.9);
    const rock = await place(r, 'DECOY', 'ROCK', 80, 100);
    const outside = await place(r, 'HAZARD', 'SURFACE', 150, 110.1);
    await lockIfChallenge(r);
    const { missionId } = await fly(r);
    finish(r);
    const snap = await snapshot(r);
    assert.deepEqual(snap.candidates.map((c) => [c.x, c.z]), [[60, 95], [120, 109.9]]);
    const byObj = new Map(decisions(missionId).map((d) => [d.object_id, d.outcome]));
    assert.equal(byObj.get(obs.id), 'DETECTED');
    assert.equal(byObj.get(bur.id), 'DETECTED');
    assert.equal(byObj.get(rock.id), 'DECOY_IGNORED');
    assert.equal(byObj.has(outside.id), false, 'never eligible: no decision (unscanned)');
  });

  test('D09 revisiting the same hazard: one decision, one candidate', async () => {
    const r = await newRoom();
    await place(r, 'HAZARD', 'SURFACE', 100, 100);
    await lockIfChallenge(r);
    const { missionId } = await fly(r, [{ x: 20, z: 100 }, { x: 180, z: 100 }, { x: 20, z: 100 }, { x: 180, z: 100 }]);
    run(80, 1);
    assert.equal((await snapshot(r)).candidates.length, 1);
    assert.equal(decisions(missionId).length, 1);
  });

  test('D10 the same static scenario at 1x and 4x gives the same candidates and entry times', async () => {
    const out: { x: number; z: number; t: number }[][] = [];
    for (const speed of [1, 4]) {
      const r = await newRoom();
      for (const [x, z] of [[40, 108], [70, 92], [130, 104], [170, 109.5], [100, 111]]) await place(r, 'HAZARD', 'SURFACE', x, z);
      await lockIfChallenge(r);
      await fly(r, LINE, { playbackSpeed: speed });
      run(25, 0.7);
      out.push((await snapshot(r)).candidates.map((c) => ({ x: c.x, z: c.z, t: c.simTimeSeconds })));
    }
    assert.equal(out[0].length, 4, '(100,111) is outside r');
    assert.deepEqual(out[1].map((c) => [c.x, c.z]), out[0].map((c) => [c.x, c.z]));
    out[1].forEach((c, i) => assert.ok(Math.abs(c.t - out[0][i].t) < 1e-9));
  });

  test('D11 pause over the eligible region: nothing new while paused, one candidate after resume', async () => {
    const r = await newRoom();
    await place(r, 'HAZARD', 'SURFACE', 100, 100);
    await lockIfChallenge(r);
    const { missionId } = await fly(r);
    await runTo(r, 60); // footprint reaches x=90 at distance 70
    await command(r, { action: 'PAUSE', missionId });
    run(20, 1);
    assert.equal((await snapshot(r)).candidates.length, 0);
    await command(r, { action: 'RESUME', missionId });
    await runTo(r, 85);
    const c = (await snapshot(r)).candidates;
    assert.equal(c.length, 1);
    assert.ok(Math.abs(c[0].simTimeSeconds - 70 / 8) < 1e-5);
    await command(r, { action: 'PAUSE', missionId });
    run(10, 1);
    assert.equal((await snapshot(r)).candidates.length, 1, 'no duplicate while paused over the object');
  });

  test('D12 stop early before reaching a hazard: no scan of the unflown path', async () => {
    const r = await newRoom();
    const far = await place(r, 'HAZARD', 'SURFACE', 160, 100);
    await lockIfChallenge(r);
    const { missionId } = await fly(r);
    await runTo(r, 50);
    await command(r, { action: 'STOP', missionId });
    run(30, 1);
    assert.equal((await snapshot(r)).candidates.length, 0);
    assert.equal(decisions(missionId).some((d) => d.object_id === far.id), false);
  });
});

describe('Advanced mode', () => {
  test('D13-D17 seeded outcomes match the formula exactly; no reroll after restart', async () => {
    const r = await newRoom();
    const subtypes = ['SURFACE', 'OBSCURED', 'BURIED', 'ROCK', 'SCRAP', 'CONTAINER'];
    const objs: { id: string; kind: 'HAZARD' | 'DECOY'; subtype: keyof typeof ADVANCED_THRESHOLD; x: number }[] = [];
    for (let i = 0; i < 24; i++) {
      const subtype = subtypes[i % 6] as keyof typeof ADVANCED_THRESHOLD;
      const kind = i % 6 < 3 ? 'HAZARD' : 'DECOY';
      const x = 25 + i * 6;
      objs.push({ id: (await place(r, kind, subtype, x, 100 + (i % 3) - 1)).id, kind, subtype, x });
    }
    await lockIfChallenge(r);
    const blue = await join(r.roomCode);
    const { missionId } = await fly(r, LINE, { sensorMode: 'ADVANCED' });
    await runTo(r, 90); // fly part of the way, then restart the server mid-flight
    const before = decisions(missionId);
    assert.ok(before.length > 3);

    await stop();
    server = createMineGuardServer({ dbPath, autoTick: false, now });
    await listen();
    assert.deepEqual(decisions(missionId), before, 'decisions survive restart unchanged');
    await command(r, { action: 'RESUME', missionId });
    finish(r);

    const seed = (server.store.db.prepare('SELECT seed FROM missions WHERE id = ?').get(missionId) as { seed: string }).seed;
    const all = decisions(missionId);
    assert.equal(all.length, 24, 'every object on the line was eligible exactly once');
    const snap = await snapshot(r);
    for (const o of objs) {
      const u = drawFromDigest(crypto.createHash('sha256').update(drawKey(seed, missionId, o.id)).digest());
      const expected = decide('ADVANCED', o.kind, o.subtype, u);
      const d = all.find((x) => x.object_id === o.id)!;
      assert.equal(d.outcome, expected, `${o.subtype} u=${u.toFixed(3)}`);
      const pinned = snap.candidates.some((c) => c.x === o.x);
      assert.equal(pinned, expected === 'DETECTED' || expected === 'FALSE_ALARM', 'candidate iff detected or false alarm');
    }
    assert.equal(snap.candidates.length, all.filter((d) => d.candidate_id).length);
    assert.equal(new Set(snap.candidates.map((c) => c.candidateId)).size, snap.candidates.length, 'no duplicate candidates');
    assert.deepEqual(snap.candidates.map((c) => c.number), snap.candidates.map((_, i) => i + 1));
    // D16/D17: misses are silent; false alarms look exactly like any other candidate.
    for (const c of snap.candidates) assert.deepEqual(Object.keys(c).sort(), PUBLIC_KEYS);
    const traffic = blue.frames.join('\n');
    for (const w of ['MISSED', 'FALSE_ALARM', 'DECOY_IGNORED', 'DETECTED', 'outcome', 'HAZARD', 'DECOY', 'BURIED', 'ROCK']) assert.ok(!traffic.includes(w), `"${w}" leaked`);
  });
});

describe('Live mode timing', () => {
  test('D23 created behind the drone: no retroactive candidate (stays unscanned)', async () => {
    const r = await newRoom(true);
    const { missionId } = await fly(r);
    await runTo(r, 120); // drone at x=140
    const behind = await place(r, 'HAZARD', 'SURFACE', 50, 100);
    finish(r);
    assert.equal((await snapshot(r)).candidates.length, 0);
    assert.equal(decisions(missionId).some((d) => d.object_id === behind.id), false);
  });

  test('D24 moved into the future path: detected at the actual later entry', async () => {
    const r = await newRoom(true);
    const o = await place(r, 'HAZARD', 'SURFACE', 120, 160);
    const { missionId } = await fly(r);
    await runTo(r, 40);
    await move(r, o, 120, 104);
    finish(r);
    const c = (await snapshot(r)).candidates;
    assert.equal(c.length, 1);
    assert.deepEqual([c[0].x, c[0].z], [120, 104]);
    assert.ok(Math.abs(c[0].simTimeSeconds - (120 - Math.sqrt(84) - 20) / 8) < 1e-5);
    const hist = (await call('GET', `/api/rooms/${r.roomCode}/attacker/snapshot`, undefined, r.attackerToken)).body.history;
    const mv = hist.find((h: { action: string }) => h.action === 'MOVE');
    assert.ok(Math.abs(mv.missionSimTime - 5) < 1e-9, 'audit has the mission sim time of the move');
    assert.equal(decisions(missionId)[0].object_id, o.id);
  });

  test('D25 moved after its decision: no reroll, no second candidate', async () => {
    const r = await newRoom(true);
    const o = await place(r, 'HAZARD', 'SURFACE', 50, 100);
    const { missionId } = await fly(r);
    await runTo(r, 60);
    assert.equal((await snapshot(r)).candidates.length, 1);
    await move(r, o, 160, 100);
    finish(r);
    assert.equal((await snapshot(r)).candidates.length, 1);
    assert.equal(decisions(missionId).length, 1);
  });

  test('D26 deleted before scan: never eligible; D27 deleted after detection: history kept', async () => {
    const r = await newRoom(true);
    const early = await place(r, 'HAZARD', 'SURFACE', 40, 100);
    const late = await place(r, 'HAZARD', 'SURFACE', 160, 100);
    const { missionId } = await fly(r);
    await runTo(r, 60);
    assert.equal((await del(r, late.id)).status, 200);
    assert.equal((await del(r, early.id)).status, 200);
    finish(r);
    const snap = await snapshot(r);
    assert.equal(snap.candidates.length, 1, 'the early detection survives its deletion');
    assert.deepEqual([snap.candidates[0].x, snap.candidates[0].z], [40, 100]);
    const ids = decisions(missionId).map((d) => d.object_id);
    assert.deepEqual(ids, [early.id]);
  });

  test('D28 created under the paused drone: no event while paused, evaluated on resume at the frozen time', async () => {
    const r = await newRoom(true);
    const { missionId } = await fly(r);
    await runTo(r, 80); // drone at x=100
    await command(r, { action: 'PAUSE', missionId });
    const t = (await snapshot(r)).mission!.simTimeSeconds;
    await place(r, 'HAZARD', 'OBSCURED', 101, 102);
    run(10, 1);
    assert.equal((await snapshot(r)).candidates.length, 0, 'nothing while paused');
    await command(r, { action: 'RESUME', missionId });
    run(0.5);
    const c = (await snapshot(r)).candidates;
    assert.equal(c.length, 1);
    assert.ok(Math.abs(c[0].simTimeSeconds - t) < 1e-9, 'first RUNNING advancement, at the frozen time');
  });

  test('a Live edit mid-tick is only active from its sim time (sub-tick precision)', async () => {
    const r = await newRoom(true);
    const { missionId } = await fly(r);
    await runTo(r, 40); // drone at x=60, sim 5 s
    // Wait 0.5 s of real time without ticking, then create at x=66 (drone is now at x=64).
    clock += 500;
    await place(r, 'HAZARD', 'SURFACE', 66, 100);
    // Next tick covers x 60 -> 68: the object must only count from sim 5.5 (x=64) on.
    run(0.5);
    const c = (await snapshot(r)).candidates;
    assert.equal(c.length, 1);
    assert.ok(Math.abs(c[0].simTimeSeconds - 5.5) < 1e-9, `entry at its creation time, got ${c[0].simTimeSeconds}`);
    assert.equal(decisions(missionId).length, 1);
  });
});

describe('review, coverage, privacy and tracking', () => {
  test('D30 review flag changes only the review state', async () => {
    const r = await newRoom();
    await place(r, 'HAZARD', 'SURFACE', 100, 100);
    await lockIfChallenge(r);
    const { missionId } = await fly(r);
    finish(r);
    const [c] = (await snapshot(r)).candidates;
    const before = decisions(missionId);
    const ok = await call('PATCH', `/api/rooms/${r.roomCode}/mission/observations/${c.candidateId}/review`, { review: 'REVIEWED' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.candidate.review, 'REVIEWED');
    assert.equal((await call('GET', `/api/rooms/${r.roomCode}/mission/observations`)).body.candidates[0].review, 'REVIEWED');
    assert.deepEqual(decisions(missionId), before, 'private decisions unchanged');
    assert.equal((await call('PATCH', `/api/rooms/${r.roomCode}/mission/observations/${c.candidateId}/review`, { review: 'CONFIRMED_MINE' })).status, 400);
    assert.equal((await call('PATCH', `/api/rooms/${r.roomCode}/mission/observations/nope/review`, { review: 'NEW' })).status, 404);
  });

  test('D35 grid coverage: partial stop < full; full serpentine with spacing 2r is nearly complete', async () => {
    const grid = { x1: 20, z1: 25, x2: 160, z2: 145, laneSpacing: 20 };
    const r = await newRoom();
    await lockIfChallenge(r);
    const { missionId } = await fly(r, [], { routeKind: 'GRID', grid, playbackSpeed: 4 });
    run(4, 0.5);
    await command(r, { action: 'STOP', missionId });
    const partial = (await snapshot(r)).mission!.coverage!;
    assert.ok(partial.gridCoveragePercent! > 0 && partial.gridCoveragePercent! < 30, `partial ${partial.gridCoveragePercent}%`);
    assert.equal(partial.resolution, 1);

    const r2 = await newRoom();
    await lockIfChallenge(r2);
    await fly(r2, [], { routeKind: 'GRID', grid, playbackSpeed: 4 });
    run(60, 1);
    const full = (await snapshot(r2)).mission!;
    assert.equal(full.endReason, 'ROUTE_COMPLETED');
    assert.ok(full.coverage!.gridCoveragePercent! >= 95, `full ${full.coverage!.gridCoveragePercent}%`);
    const manual = await newRoom();
    await lockIfChallenge(manual);
    await fly(manual);
    run(2);
    assert.equal((await snapshot(manual)).mission!.coverage!.gridCoveragePercent, null, 'manual route: percentage N/A');
  });

  test('D18-D22 Blue sees only public candidate fields; rooms isolated; Red can track the drone', async () => {
    const a = await newRoom();
    const b = await newRoom();
    const hidden = await place(a, 'HAZARD', 'BURIED', 150, 160); // never scanned
    await place(a, 'HAZARD', 'SURFACE', 90, 103); // will be scanned
    await place(a, 'DECOY', 'CONTAINER', 60, 98); // Basic ignores
    await lockIfChallenge(a);
    await lockIfChallenge(b);
    const blueA = await join(a.roomCode);
    const blueB = await join(b.roomCode);
    const redA = await join(a.roomCode, a.attackerToken);
    await fly(a);
    finish(a);
    await settle();
    assert.equal(blueA.candidates.length, 1);
    assert.deepEqual(redA.candidates, blueA.candidates, 'Red sees the same public candidates');
    assert.ok(redA.telemetry() > 5, 'Red receives drone telemetry for optional tracking');
    assert.equal(blueB.candidates.length + blueB.telemetry(), 0, 'room B got nothing');
    const traffic = blueA.frames.join('\n') + (await call('GET', `/api/rooms/${a.roomCode}/mission/observations`)).text;
    for (const w of [hidden.id, 'BURIED', 'CONTAINER', 'SURFACE', 'HAZARD', 'DECOY', 'objectId', 'outcome', a.attackerToken]) assert.ok(!traffic.includes(w), `"${w}" leaked`);
    const world = (await call('GET', '/api/world')).text;
    assert.ok(!world.includes('candidate') && !world.includes(hidden.id));
  });

  test('D29 Challenge lock still rejects edits during a sensing mission', async () => {
    const r = await newRoom();
    const o = await place(r, 'HAZARD', 'SURFACE', 100, 100);
    await lockIfChallenge(r);
    await fly(r);
    run(2);
    assert.equal((await move(r, o, 100, 50)).error, 'STATE_LOCKED');
  });
});
