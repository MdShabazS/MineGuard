// MG-007 tests, named after MISSION_ACCEPTANCE.md acceptance IDs (M01..M36).
// The server runs with a fake clock and manual ticks, so timing is exact.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import {
  BASE_SPEED,
  cumulative,
  flownSubsegments,
  generateGrid,
  type FlownSubsegment,
  type MissionPoint,
  type MissionPlan,
  type MissionSnapshot,
  type MissionTelemetry,
} from '../../shared/mission.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/protocol.js';
import type { CreateRoomResponse } from '../../shared/scenario.js';
import { FOOTPRINT_RADIUS } from '../../shared/sensor.js';
import { createWorldDefinition } from '../../shared/world.js';
import { createMineGuardServer } from '../src/app.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** True if the number appears as a whole value (so 96.7 does not match inside 96.79 or 196.7). */
const hasNumber = (text: string, n: string) => new RegExp(String.raw`(?<![\d.])` + n.replace('.', String.raw`\.`) + String.raw`(?!\d)`).test(text);

const world = createWorldDefinition();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineguard-mission-'));
const dbPath = path.join(tmpDir, 'mission.sqlite');
let clock = 1_000_000;
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

// ---- helpers ---------------------------------------------------------------

async function call(method: string, url: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}
const createRoom = async (): Promise<CreateRoomResponse> => (await call('POST', '/api/rooms')).body;
const attacker = (r: CreateRoomResponse, suffix: string, body?: unknown, method = 'POST') =>
  call(method, `/api/rooms/${r.roomCode}/attacker${suffix}`, body, r.attackerToken);
const lock = (r: CreateRoomResponse) => attacker(r, '/lock');
const setLive = (r: CreateRoomResponse) => attacker(r, '/mode', { mode: 'LIVE' });
const plan = (r: CreateRoomResponse, body: unknown) => call('POST', `/api/rooms/${r.roomCode}/mission/plan`, body);
const command = (r: CreateRoomResponse, body: unknown) => call('POST', `/api/rooms/${r.roomCode}/mission/command`, body);
const mission = async (r: CreateRoomResponse): Promise<MissionSnapshot> => (await call('GET', `/api/rooms/${r.roomCode}/mission`)).body;
const roomState = async (r: CreateRoomResponse) => (await call('GET', `/api/rooms/${r.roomCode}/public`)).body.state;

const DEMO_A = [
  { x: 20, z: 20 },
  { x: 80, z: 20 },
  { x: 80, z: 95 },
  { x: 135, z: 95 },
  { x: 135, z: 135 },
];
const manual = (waypoints: unknown, extra: object = {}) => ({ routeKind: 'MANUAL', waypoints, sensorMode: 'BASIC', footprintProfile: 'STANDARD', ...extra });

async function planAndStart(r: CreateRoomResponse, body: unknown = manual(DEMO_A), extra: object = {}) {
  const p = await plan(r, body);
  assert.equal(p.status, 201, p.text);
  const s = await command(r, { action: 'START', planId: p.body.plan.id, planRevision: p.body.plan.planRevision, ...extra });
  assert.equal(s.status, 200, s.text);
  return { plan: p.body.plan as MissionPlan, snap: s.body.snapshot as MissionSnapshot };
}

/** Advance the fake clock in ticks of at most 1 s real time. */
function run(seconds: number, step = 1) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    clock += Math.min(step, seconds - t) * 1000;
    server.engine.tickAll();
  }
}

function openSocket(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s: ClientSocket = connect(baseUrl, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}
async function joinBlue(code: string) {
  const s = await openSocket();
  const frames: string[] = [];
  const telemetry: MissionTelemetry[] = [];
  const snapshots: MissionSnapshot[] = [];
  s.onAny((event, ...args) => event !== 'server:hello' && frames.push(JSON.stringify([event, ...args])));
  s.on('mission:telemetry', (t) => telemetry.push(t));
  s.on('mission:snapshot', (m) => snapshots.push(m));
  const reply = await s.timeout(5000).emitWithAck('room:join', { roomCode: code });
  assert.ok(reply.ok);
  await settle();
  return { s, frames, telemetry, snapshots };
}
const settle = () => new Promise((r) => setTimeout(r, 120));

/** Distance from point to the polyline: 0 means it lies on the route. */
function distanceToRoute(points: { x: number; z: number }[], x: number, z: number) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)));
  }
  return best;
}

// ---- route planning ----------------------------------------------------------

describe('route planning', () => {
  test('M03/M06 manual waypoints are normalised to 0.1, ordered, boundaries accepted', async () => {
    const r = await createRoom();
    const p = await plan(r, manual([{ x: 0, z: 0 }, { x: '120.04', z: 50.06 }, { x: 200, z: 200 }]));
    assert.equal(p.status, 201, p.text);
    assert.deepEqual(p.body.plan.waypoints, [{ x: 0, z: 0 }, { x: 120, z: 50.1 }, { x: 200, z: 200 }]);
    assert.equal(p.body.plan.routeLength, Math.hypot(120, 50.1) + Math.hypot(80, 149.9));
    assert.equal(p.body.plan.altitudeAboveGround, 12);
    assert.equal(p.body.plan.baseSpeed, BASE_SPEED);
  });

  test('M05/M07 invalid manual routes are rejected and leave the stored plan unchanged', async () => {
    const r = await createRoom();
    const good = await plan(r, manual(DEMO_A));
    const bad: unknown[] = [
      [{ x: 10, z: 10 }],
      [],
      [{ x: 10, z: 10 }, { x: 10.04, z: 10 }],
      [{ x: 10, z: 10 }, { x: -0.1, z: 10 }],
      [{ x: 10, z: 10 }, { x: 200.01, z: 10 }],
      [{ x: 10, z: 10 }, { x: 'NaN', z: 10 }],
      [{ x: 10, z: 10 }, { x: 'Infinity', z: 10 }],
      [{ x: 10, z: 10 }, { x: '', z: 10 }],
      [{ x: 10, z: 10 }, { x: 'abc', z: 10 }],
      [{ x: 10, z: 10 }, null],
      'not-a-list',
      Array.from({ length: 51 }, (_, i) => ({ x: i, z: i })),
    ];
    for (const w of bad) {
      const res = await plan(r, manual(w));
      assert.equal(res.status, 400, JSON.stringify(w).slice(0, 60));
      assert.equal(res.body.error, 'INVALID_ROUTE');
    }
    assert.equal((await plan(r, { routeKind: 'SPIRAL' })).body.error, 'INVALID_ROUTE');
    assert.equal((await mission(r)).plan!.id, good.body.plan.id, 'stored plan unchanged');
  });

  test('M32 sensor mode and footprint profile are stored; invalid ones rejected', async () => {
    const r = await createRoom();
    const p = await plan(r, manual(DEMO_A, { sensorMode: 'ADVANCED', footprintProfile: 'WIDE' }));
    assert.equal(p.body.plan.sensorMode, 'ADVANCED');
    assert.equal(p.body.plan.footprintProfile, 'WIDE');
    assert.deepEqual(FOOTPRINT_RADIUS, { NARROW: 6, STANDARD: 10, WIDE: 16 });
    assert.equal((await plan(r, manual(DEMO_A, { sensorMode: 'AI' }))).body.error, 'INVALID_REQUEST');
    assert.equal((await plan(r, manual(DEMO_A, { footprintProfile: 'HUGE' }))).body.error, 'INVALID_REQUEST');
  });

  test('M09/M10 DEMO B grid: serpentine lanes, both outer edges, connected turns, deterministic', () => {
    const spec = { x1: 160, z1: 145, x2: 20, z2: 25, laneSpacing: 20 };
    const r = generateGrid(world, spec, 'STANDARD');
    assert.ok(r.ok);
    assert.deepEqual([r.grid.xMin, r.grid.xMax, r.grid.zMin, r.grid.zMax], [20, 160, 25, 145], 'corners normalised to min/max');
    assert.equal(r.grid.orientation, 'ALONG_X', 'auto picks the longer side');
    assert.equal(r.grid.laneCount, 7);
    assert.equal(r.grid.actualSpacing, 20);
    assert.equal(r.points.length, 14);
    assert.deepEqual(r.points.slice(0, 4), [{ x: 20, z: 25 }, { x: 160, z: 25 }, { x: 160, z: 45 }, { x: 20, z: 45 }]);
    assert.equal(r.points[0].z, 25, 'first lane on the low edge');
    assert.equal(r.points[13].z, 145, 'last lane on the high edge');
    for (let i = 0; i < 7; i++) {
      const a: MissionPoint = r.points[2 * i];
      const b: MissionPoint = r.points[2 * i + 1];
      assert.equal(a.z, b.z, 'lane is straight along X');
      assert.equal(a.x, i % 2 === 0 ? 20 : 160, 'alternating direction');
      if (i > 0) assert.equal(r.points[2 * i - 1].x, a.x, 'turn connects lane ends, no teleport');
    }
    assert.equal(r.potentialGaps, false, 'spacing 20 <= 2r for STANDARD');
    const again = generateGrid(world, spec, 'STANDARD');
    assert.deepEqual(again, r);

    const wide = generateGrid(world, { ...spec, laneSpacing: 25, orientation: 'ALONG_Z' }, 'STANDARD');
    assert.ok(wide.ok);
    assert.equal(wide.grid.orientation, 'ALONG_Z');
    assert.equal(wide.grid.laneCount, 7, '140 / 25 -> 6 intervals + 1');
    assert.equal(wide.points[0].x, 20);
    assert.equal(wide.points[wide.points.length - 1].x, 160);
    assert.ok(wide.grid.actualSpacing <= 25);
    const gappy = generateGrid(world, { ...spec, laneSpacing: 30 }, 'STANDARD');
    assert.ok(gappy.ok && gappy.potentialGaps, 'spacing 30 > 20 flags potential gaps');
    const narrowStrip = generateGrid(world, { x1: 0, z1: 0, x2: 200, z2: 3, laneSpacing: 3 }, 'STANDARD');
    assert.ok(narrowStrip.ok && narrowStrip.grid.laneCount === 2, 'narrow rectangle: just the two edges');
  });

  test('M11 invalid grids are rejected with useful messages', async () => {
    const r = await createRoom();
    const g = (grid: object) => plan(r, { routeKind: 'GRID', grid, footprintProfile: 'STANDARD' });
    const cases: [object, RegExp][] = [
      [{ x1: 20, z1: 20, x2: 20, z2: 100, laneSpacing: 10 }, /positive width and height/],
      [{ x1: 20, z1: 20, x2: 120, z2: 20, laneSpacing: 10 }, /positive width and height/],
      [{ x1: -1, z1: 20, x2: 120, z2: 100, laneSpacing: 10 }, /between 0 and 200/],
      [{ x1: 20, z1: 20, x2: 200.01, z2: 100, laneSpacing: 10 }, /between 0 and 200/],
      [{ x1: 'NaN', z1: 20, x2: 120, z2: 100, laneSpacing: 10 }, /between 0 and 200/],
      [{ x1: 20, z1: 20, x2: 120, z2: 100, laneSpacing: 0 }, /at least 2/],
      [{ x1: 20, z1: 20, x2: 120, z2: 100, laneSpacing: -5 }, /at least 2/],
      [{ x1: 20, z1: 20, x2: 120, z2: 100, laneSpacing: 'wide' }, /at least 2/],
      [{ x1: 20, z1: 20, x2: 120, z2: 100, laneSpacing: 81 }, /cannot exceed/],
      [{ x1: 0, z1: 0, x2: 200, z2: 200, laneSpacing: 2 }, /limit is 60/],
      [{ x1: 20, z1: 20, x2: 120, z2: 100, laneSpacing: 10, orientation: 'DIAGONAL' }, /orientation/],
    ];
    for (const [grid, msg] of cases) {
      const res = await g(grid);
      assert.equal(res.status, 400, JSON.stringify(grid));
      assert.equal(res.body.error, 'INVALID_ROUTE');
      assert.match(res.body.message, msg);
    }
    assert.equal((await mission(r)).plan, null, 'no plan stored');
  });

  test('flown subsegments split at every crossed waypoint, in order, with no corner shortcut', () => {
    const pts = DEMO_A;
    const cum = cumulative(pts);
    // One huge step crossing all four legs.
    const segs = flownSubsegments(pts, cum, 10, cum[4] - 5, 0, 100);
    assert.deepEqual(segs.map((s) => s.legIndex), [0, 1, 2, 3]);
    for (let i = 1; i < segs.length; i++) {
      assert.deepEqual(segs[i].from, segs[i - 1].to, 'contiguous');
      assert.equal(segs[i].simTimeStart, segs[i - 1].simTimeEnd, 'chronological');
      assert.deepEqual(segs[i].from, pts[i], 'split exactly at the waypoint');
    }
    assert.deepEqual(segs[0].from, { x: 30, z: 20 });
    assert.equal(segs[0].simTimeStart, 0);
    assert.equal(segs[3].simTimeEnd, 100);
    assert.deepEqual(flownSubsegments(pts, cum, 5, 5, 0, 0), []);
  });
});

// ---- flight state machine ---------------------------------------------------------

describe('flight', () => {
  test('M13 Challenge DRAFT cannot start; M14 LOCKED starts at the first waypoint', async () => {
    const r = await createRoom();
    const p = (await plan(r, manual(DEMO_A))).body.plan;
    const blocked = await command(r, { action: 'START', planId: p.id, planRevision: p.planRevision });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, 'INVALID_MISSION_STATE');
    assert.match(blocked.body.message, /lock the scenario/);
    assert.equal(await roomState(r), 'DRAFT');
    assert.equal((await mission(r)).mission, null);

    await lock(r);
    const ok = await command(r, { action: 'START', planId: p.id, planRevision: p.planRevision });
    assert.equal(ok.status, 200, ok.text);
    const m = ok.body.snapshot.mission;
    assert.equal(m.status, 'RUNNING');
    assert.deepEqual([m.x, m.z, m.simTimeSeconds, m.routeDistanceCompleted], [20, 20, 0, 0]);
    assert.equal(await roomState(r), 'RUNNING');
  });

  test('M15 LIVE DRAFT starts without a lock', async () => {
    const r = await createRoom();
    await setLive(r);
    const { snap } = await planAndStart(r);
    assert.equal(snap.mission!.status, 'RUNNING');
    assert.equal(await roomState(r), 'RUNNING');
  });

  test('M16/M17/M20 pause freezes, resume continues, speed scales rate not path', async () => {
    const r = await createRoom();
    await lock(r);
    const { snap } = await planAndStart(r);
    const id = snap.mission!.missionId;
    run(1);
    let m = (await mission(r)).mission!;
    assert.equal(m.routeDistanceCompleted, 8, '1 s at 1x = 8 units');
    assert.deepEqual([m.x, m.z, m.simTimeSeconds], [28, 20, 1]);

    assert.equal((await command(r, { action: 'PAUSE', missionId: id })).status, 200);
    const paused = (await mission(r)).mission!;
    run(10);
    m = (await mission(r)).mission!;
    assert.equal(m.status, 'PAUSED');
    assert.deepEqual([m.x, m.z, m.simTimeSeconds, m.routeDistanceCompleted], [paused.x, paused.z, paused.simTimeSeconds, paused.routeDistanceCompleted]);
    assert.equal(await roomState(r), 'PAUSED');

    // Speed can change while paused without moving anything.
    assert.equal((await command(r, { action: 'SET_SPEED', missionId: id, playbackSpeed: 2 })).status, 200);
    m = (await mission(r)).mission!;
    assert.equal(m.playbackSpeed, 2);
    assert.equal(m.routeDistanceCompleted, paused.routeDistanceCompleted);

    assert.equal((await command(r, { action: 'RESUME', missionId: id })).status, 200);
    run(1);
    m = (await mission(r)).mission!;
    assert.equal(m.routeDistanceCompleted, 8 + 16, 'resumed from same place; 1 s at 2x = 16');
    assert.equal(m.simTimeSeconds, 1 + 2);
    await command(r, { action: 'SET_SPEED', missionId: id, playbackSpeed: 4 });
    run(1);
    m = (await mission(r)).mission!;
    assert.equal(m.routeDistanceCompleted, 24 + 32, '1 s at 4x = 32');
    assert.equal(m.simTimeSeconds, 3 + 4);
    assert.deepEqual(m.plan.waypoints, DEMO_A, 'path unchanged by speed');
    assert.equal(distanceToRoute(DEMO_A, m.x, m.z) < 1e-9, true);
    assert.equal((await command(r, { action: 'SET_SPEED', missionId: id, playbackSpeed: 3 })).body.error, 'INVALID_REQUEST');
  });

  test('M12/M20 the drone flies exactly the previewed path; 4x never skips a turn', async () => {
    const r = await createRoom();
    await lock(r);
    const all: { missionId: string; seg: FlownSubsegment }[] = [];
    // Other tests' missions in other rooms may still be running; keep only this one's segments.
    server.engine.sweepHook = (_room, m, segs) => all.push(...segs.map((seg) => ({ missionId: m.id, seg })));
    try {
      const { plan: p, snap } = await planAndStart(r, manual(DEMO_A), { playbackSpeed: 4 });
      assert.deepEqual(snap.mission!.plan.waypoints, p.waypoints, 'executed plan == previewed plan');
      run(60, 0.5);
      const segments = all.filter((e) => e.missionId === snap.mission!.missionId).map((e) => e.seg);
      const m = (await mission(r)).mission!;
      assert.equal(m.status, 'FINISHED');
      // Every waypoint appears as a segment boundary, and segments tile the whole route.
      for (let i = 1; i < segments.length; i++) {
        assert.ok(Math.abs(segments[i].distanceStart - segments[i - 1].distanceEnd) < 1e-9, 'contiguous distance');
        assert.ok(segments[i].simTimeStart >= segments[i - 1].simTimeEnd - 1e-9, 'chronological');
      }
      assert.equal(segments[0].distanceStart, 0);
      assert.ok(Math.abs(segments[segments.length - 1].distanceEnd - p.routeLength) < 1e-9);
      for (const wp of DEMO_A.slice(1, -1)) {
        assert.ok(segments.some((s) => s.to.x === wp.x && s.to.z === wp.z), `turn at ${wp.x},${wp.z} is a segment end`);
      }
      for (const s of segments) {
        assert.ok(distanceToRoute(DEMO_A, s.from.x, s.from.z) < 1e-9 && distanceToRoute(DEMO_A, s.to.x, s.to.z) < 1e-9, 'on route');
        const leg = [DEMO_A[s.legIndex], DEMO_A[s.legIndex + 1]];
        assert.ok(distanceToRoute(leg, (s.from.x + s.to.x) / 2, (s.from.z + s.to.z) / 2) < 1e-9, 'segment stays within one leg');
      }
    } finally {
      server.engine.sweepHook = () => {};
    }
  });

  test('M19 completing the route: ROUTE_COMPLETED, exact end point, 100%, exact sim time', async () => {
    const r = await createRoom();
    await lock(r);
    const { plan: p } = await planAndStart(r);
    run(5);
    assert.equal((await mission(r)).mission!.status, 'RUNNING', 'not complete early');
    run(100, 0.7);
    const m = (await mission(r)).mission!;
    assert.equal(m.status, 'FINISHED');
    assert.equal(m.endReason, 'ROUTE_COMPLETED');
    assert.equal(m.routeDistanceCompleted, p.routeLength);
    assert.deepEqual([m.x, m.z], [135, 135]);
    assert.equal(m.completedLegs, 4);
    assert.ok(Math.abs(m.simTimeSeconds - p.routeLength / BASE_SPEED) < 1e-9, `sim time ${m.simTimeSeconds}`);
    assert.equal(await roomState(r), 'FINISHED');
  });

  test('M18 stop early keeps partial progress; NEW_MISSION re-arms without unlocking Challenge', async () => {
    const r = await createRoom();
    await lock(r);
    const { snap, plan: p } = await planAndStart(r);
    run(3);
    const stop = await command(r, { action: 'STOP', missionId: snap.mission!.missionId });
    assert.equal(stop.status, 200);
    const m = stop.body.snapshot.mission;
    assert.equal(m.status, 'FINISHED');
    assert.equal(m.endReason, 'STOPPED_EARLY');
    assert.equal(m.routeDistanceCompleted, 24);
    assert.ok(m.routeDistanceCompleted < p.routeLength);
    assert.ok(!stop.text.includes('"objects"') && !stop.text.includes('"history"'), 'no scenario reveal on stop');
    run(5);
    assert.equal((await mission(r)).mission!.routeDistanceCompleted, 24, 'frozen after stop');

    assert.equal((await plan(r, manual(DEMO_A))).body.error, 'INVALID_MISSION_STATE', 'cannot replan a finished room without NEW_MISSION');
    const fresh = await command(r, { action: 'NEW_MISSION', missionId: m.missionId });
    assert.equal(fresh.status, 200, fresh.text);
    assert.equal(await roomState(r), 'LOCKED', 'Challenge stays locked');
    assert.equal(fresh.body.snapshot.mission.missionId, m.missionId, 'previous mission record kept');
    const again = await planAndStart(r);
    assert.notEqual(again.snap.mission!.missionId, m.missionId);
  });

  test('M21 duplicate START and illegal commands are rejected safely', async () => {
    const r = await createRoom();
    await lock(r);
    const p = (await plan(r, manual(DEMO_A))).body.plan;
    const startBody = { action: 'START', planId: p.id, planRevision: p.planRevision };
    const [a, b] = await Promise.all([command(r, startBody), command(r, startBody)]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal([a, b].find((x) => x.status === 409)!.body.error, 'DUPLICATE_START');
    const id = (await mission(r)).mission!.missionId;
    const rows = server.store.db.prepare('SELECT COUNT(*) AS n FROM missions WHERE room_id = (SELECT id FROM rooms WHERE code = ?)').get(r.roomCode) as { n: number };
    assert.equal(rows.n, 1, 'exactly one mission created');

    assert.equal((await command(r, { action: 'RESUME', missionId: id })).body.error, 'INVALID_MISSION_STATE');
    assert.equal((await command(r, { action: 'PAUSE', missionId: 'nope' })).body.error, 'MISSION_NOT_FOUND');
    assert.equal((await command(r, { action: 'FLY_HOME', missionId: id })).body.error, 'INVALID_REQUEST');
    assert.equal((await plan(r, manual(DEMO_A))).body.error, 'INVALID_MISSION_STATE', 'no replanning mid-flight');
    await command(r, { action: 'PAUSE', missionId: id });
    assert.equal((await command(r, { action: 'PAUSE', missionId: id })).body.error, 'INVALID_MISSION_STATE');
    await command(r, { action: 'STOP', missionId: id });
    assert.equal((await command(r, { action: 'STOP', missionId: id })).body.error, 'INVALID_MISSION_STATE');
    assert.equal((await command(r, { action: 'SET_SPEED', missionId: id, playbackSpeed: 2 })).body.error, 'INVALID_MISSION_STATE');
    assert.equal((await call('POST', '/api/rooms/ZZZZZZ/mission/command', startBody)).body.error, 'ROOM_NOT_FOUND');
  });

  test('stale plan: START with an old planId/revision gets REVISION_CONFLICT', async () => {
    const r = await createRoom();
    await lock(r);
    const old = (await plan(r, manual(DEMO_A))).body.plan;
    const cur = (await plan(r, manual(DEMO_A.slice(0, 3)))).body.plan;
    assert.equal(cur.planRevision, old.planRevision + 1);
    const res = await command(r, { action: 'START', planId: old.id, planRevision: old.planRevision });
    assert.equal(res.body.error, 'REVISION_CONFLICT');
    assert.equal((await mission(r)).mission, null);
  });
});

// ---- realtime, privacy, isolation, Red integration ------------------------------

describe('realtime and privacy', () => {
  test('M26/M27 two Blue tabs get identical telemetry; a late joiner recovers the same state', async () => {
    const r = await createRoom();
    await lock(r);
    const b1 = await joinBlue(r.roomCode);
    const b2 = await joinBlue(r.roomCode);
    await planAndStart(r);
    run(3);
    await settle();
    assert.ok(b1.telemetry.length >= 3);
    assert.deepEqual(b1.telemetry, b2.telemetry, 'both tabs saw identical telemetry');
    const seqs = b1.telemetry.map((t) => t.sequence);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), 'sequence increases');

    await command(r, { action: 'PAUSE', missionId: b1.telemetry[0].missionId });
    await settle();
    const late = await joinBlue(r.roomCode);
    const snap = late.snapshots[0];
    assert.ok(snap, 'late joiner receives mission:snapshot on join');
    assert.equal(snap.mission!.missionId, b1.telemetry[0].missionId);
    assert.equal(snap.mission!.status, 'PAUSED');
    assert.equal(snap.mission!.routeDistanceCompleted, 24);
    assert.equal(snap.mission!.simTimeSeconds, 3);
  });

  test('M28 missions in two rooms are isolated', async () => {
    const a = await createRoom();
    const b = await createRoom();
    await lock(a);
    await lock(b);
    const blueB = await joinBlue(b.roomCode);
    const framesBefore = blueB.frames.length;
    await planAndStart(a);
    run(2);
    await settle();
    assert.equal(blueB.frames.length, framesBefore, 'room B received nothing from room A');
    assert.equal((await mission(b)).mission, null);
  });

  test('M29 Blue mission traffic never contains hidden Red objects or the token', async () => {
    const r = await createRoom();
    await setLive(r);
    const hidden = [
      ['HAZARD', 'SURFACE', 37.3, 141.7],
      ['HAZARD', 'BURIED', 181.9, 21.3],
      ['DECOY', 'CONTAINER', 133.3, 96.7],
    ] as const;
    const ids: string[] = [];
    for (const [kind, subtype, x, z] of hidden) ids.push((await attacker(r, '/objects', { kind, subtype, x, z })).body.result.id);
    const blue = await joinBlue(r.roomCode);
    await planAndStart(r);
    run(4);
    // Live edit mid-flight must not leak either.
    const moved = await attacker(r, `/objects/${ids[0]}`, { baseRevision: (await attacker(r, '/snapshot', undefined, 'GET')).body.objects[0].revision, x: 55.5 }, 'PATCH');
    assert.equal(moved.status, 200);
    run(2);
    const stopped = await command(r, { action: 'STOP', missionId: blue.telemetry[0].missionId });
    await settle();
    // ISO timestamps ("...:21.345Z") are stripped so digit patterns inside them cannot cause false matches.
    const traffic = [...blue.frames, (await call('GET', `/api/rooms/${r.roomCode}/mission`)).text, stopped.text]
      .join('\n')
      .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>');
    assert.ok(blue.telemetry.length > 0);
    for (const id of ids) assert.ok(!traffic.includes(id), 'object id leaked');
    for (const w of ['SURFACE', 'BURIED', 'CONTAINER', 'HAZARD', 'DECOY', '"objects"', '"history"', r.attackerToken]) {
      assert.ok(!traffic.includes(w), `"${w}" leaked to Blue`);
    }
    // Telemetry carries unrounded floats, so match coordinates as whole numbers only.
    for (const n of ['37.3', '141.7', '181.9', '21.3', '133.3', '96.7', '55.5']) assert.ok(!hasNumber(traffic, n), `coordinate ${n} leaked to Blue`);
  });

  test('M30 Red rules intact: Challenge stays read-only in flight; Live edits are audited with mission sim time', async () => {
    const ch = await createRoom();
    const o = (await attacker(ch, '/objects', { kind: 'HAZARD', subtype: 'SURFACE', x: 10, z: 10 })).body.result;
    await lock(ch);
    await planAndStart(ch);
    run(2);
    const blocked = await attacker(ch, `/objects/${o.id}`, { baseRevision: o.revision, x: 11 }, 'PATCH');
    assert.equal(blocked.body.error, 'STATE_LOCKED');
    assert.equal((await attacker(ch, '/mode', { mode: 'LIVE' })).body.error, 'STATE_LOCKED');
    assert.equal((await attacker(ch, '/snapshot', undefined, 'GET')).body.objects.length, 1, 'Red snapshot still works');

    const live = await createRoom();
    await setLive(live);
    await planAndStart(live);
    run(2.5, 0.5);
    const created = await attacker(live, '/objects', { kind: 'HAZARD', subtype: 'OBSCURED', x: 90, z: 90 });
    assert.equal(created.status, 201);
    const ev = created.body.snapshot.history[0];
    assert.equal(ev.action, 'CREATE');
    assert.equal(ev.missionSimTime, 2.5, 'audit carries the mission sim time');
    assert.equal(created.body.snapshot.state, 'RUNNING');
  });

  test('M33 restart mid-flight: mission comes back PAUSED at its last position, no catch-up', async () => {
    const r = await createRoom();
    await lock(r);
    const { snap } = await planAndStart(r);
    run(4);
    const before = (await mission(r)).mission!;
    assert.equal(before.status, 'RUNNING');

    await stop();
    clock += 10 * 60 * 1000; // ten minutes "pass" while the server is down
    server = createMineGuardServer({ dbPath, autoTick: false, now });
    await listen();
    run(3);

    const after = (await mission(r)).mission!;
    assert.equal(after.missionId, snap.mission!.missionId);
    assert.equal(after.status, 'PAUSED');
    assert.equal(after.pausedByRestart, true);
    assert.equal(after.routeDistanceCompleted, before.routeDistanceCompleted);
    assert.equal(after.simTimeSeconds, before.simTimeSeconds);
    assert.equal(await roomState(r), 'PAUSED');
    assert.equal((await command(r, { action: 'RESUME', missionId: after.missionId })).status, 200);
    run(1);
    assert.equal((await mission(r)).mission!.routeDistanceCompleted, before.routeDistanceCompleted + 8);
  });
});
