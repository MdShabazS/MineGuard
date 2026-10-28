// MG-004 backend tests, named after SCENARIO_CONTRACT.md acceptance IDs (R01..R19).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, RoomJoinReply, ServerToClientEvents } from '../../shared/protocol.js';
import { canEditObjects, type AttackerRoomSnapshot, type CreateRoomResponse, type ScenarioMode, type ScenarioState } from '../../shared/scenario.js';
import { createWorldDefinition } from '../../shared/world.js';
import { createMineGuardServer } from '../src/app.js';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const world = createWorldDefinition();
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineguard-test-'));
const dbPath = path.join(tmpDir, 'rooms.sqlite');

// Capture everything the server prints, to prove tokens never reach logs (R19).
const logged: string[] = [];
const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;

let server = createMineGuardServer({ dbPath });
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

before(async () => {
  for (const k of ['log', 'error', 'warn'] as const) {
    const orig = { log: origLog, error: origErr, warn: origWarn }[k];
    console[k] = (...args: unknown[]) => {
      logged.push(args.map(String).join(' '));
      orig(...args);
    };
  }
  await listen();
});
after(async () => {
  await stop();
  Object.assign(console, { log: origLog, error: origErr, warn: origWarn });
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---- helpers ---------------------------------------------------------------

interface Call {
  status: number;
  body: any;
  text: string;
}
async function call(method: string, url: string, body?: unknown, token?: string, rawBody?: string): Promise<Call> {
  const headers: Record<string, string> = {};
  if (body !== undefined || rawBody !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${url}`, { method, headers, body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, text };
}

async function createRoom(): Promise<CreateRoomResponse> {
  const r = await call('POST', '/api/rooms');
  assert.equal(r.status, 201);
  return r.body;
}
const objectsUrl = (code: string) => `/api/rooms/${code}/attacker/objects`;
const snapshot = async (room: CreateRoomResponse): Promise<AttackerRoomSnapshot> =>
  (await call('GET', `/api/rooms/${room.roomCode}/attacker/snapshot`, undefined, room.attackerToken)).body;

async function place(room: CreateRoomResponse, kind: string, subtype: string, x: unknown, z: unknown) {
  return call('POST', objectsUrl(room.roomCode), { kind, subtype, x, z }, room.attackerToken);
}

function openSocket(): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const s: ClientSocket = connect(baseUrl, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}
const join = (s: ClientSocket, roomCode: string, attackerToken?: string): Promise<RoomJoinReply> =>
  s.timeout(5000).emitWithAck('room:join', attackerToken === undefined ? { roomCode } : { roomCode, attackerToken });

/** Records every event payload a socket receives, as raw JSON text. */
function recordTraffic(s: ClientSocket): string[] {
  const frames: string[] = [];
  // server:hello only carries socket id + time; everything else is recorded.
  s.onAny((event, ...args) => event !== 'server:hello' && frames.push(JSON.stringify([event, ...args])));
  return frames;
}
const nextEvent = <E extends keyof ServerToClientEvents>(s: ClientSocket, event: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => s.once(event, ((p: never) => resolve(p)) as never));
const settle = () => new Promise((r) => setTimeout(r, 150));

// ---- tests -------------------------------------------------------------------

describe('rooms and roles', () => {
  test('R01 create room: unique code, public defender link, separate private attacker link', async () => {
    const a = await createRoom();
    const b = await createRoom();
    assert.match(a.roomCode, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.notEqual(a.roomCode, b.roomCode);
    assert.equal(a.defenderPath, `/blue/${a.roomCode}`);
    assert.equal(a.attackerPath, `/red#room=${a.roomCode}&key=${a.attackerToken}`);
    assert.ok(a.attackerToken.length >= 40, 'token has >= 32 random bytes');
    assert.ok(!a.defenderPath.includes(a.attackerToken));
    assert.notEqual(a.attackerToken, b.attackerToken);
    assert.equal(a.snapshot.mode, 'CHALLENGE');
    assert.equal(a.snapshot.state, 'DRAFT');
    assert.equal(a.snapshot.scenarioRevision, 0);
  });

  test('R02 join via room code (HTTP + Socket, case-insensitive) gives same world and role-safe state', async () => {
    const room = await createRoom();
    const pub = await call('GET', `/api/rooms/${room.roomCode.toLowerCase()}/public`);
    assert.equal(pub.status, 200);
    assert.deepEqual(Object.keys(pub.body).sort(), ['mode', 'roomCode', 'scenarioRevision', 'state', 'terrainId', 'worldChecksum']);
    assert.equal(pub.body.terrainId, world.terrainId);
    assert.equal(pub.body.worldChecksum, world.checksum);

    const blue = await openSocket();
    const reply = await join(blue, room.roomCode);
    assert.ok(reply.ok && reply.role === 'defender');
    assert.equal(reply.snapshot.worldChecksum, world.checksum);
    assert.equal((reply.snapshot as unknown as Record<string, unknown>).objects, undefined);

    assert.equal((await call('GET', '/api/rooms/ZZZZZZ/public')).body.error, 'ROOM_NOT_FOUND');
    const missing = await join(await openSocket(), 'ZZZZZZ');
    assert.ok(!missing.ok && missing.error === 'ROOM_NOT_FOUND');
  });
});

describe('object placement and validation', () => {
  test('R03/R05 place every category; server stores normalized X/Z and returns it', async () => {
    const room = await createRoom();
    const cats = [
      ['HAZARD', 'SURFACE'],
      ['HAZARD', 'OBSCURED'],
      ['HAZARD', 'BURIED'],
      ['DECOY', 'ROCK'],
      ['DECOY', 'SCRAP'],
      ['DECOY', 'CONTAINER'],
    ];
    for (const [i, [kind, subtype]] of cats.entries()) {
      const r = await place(room, kind, subtype, 10 + i * 20.04, 50.06);
      assert.equal(r.status, 201, `${kind}/${subtype}: ${r.text}`);
      assert.equal(r.body.result.kind, kind);
      assert.equal(r.body.result.subtype, subtype);
      assert.equal(r.body.result.z, 50.1);
    }
    const snap = await snapshot(room);
    assert.equal(snap.objects.length, 6);
    assert.equal(snap.scenarioRevision, 6);
    assert.equal(new Set(snap.objects.map((o) => o.id)).size, 6, 'distinct server IDs');
  });

  test('R06 boundary and decimal coordinates are accepted and normalised to 0.1', async () => {
    const room = await createRoom();
    const cases: [unknown, unknown, number, number][] = [
      [0, 0, 0, 0],
      [200, 200, 200, 200],
      [30.44, 40.05, 30.4, 40.1],
      ['30.4', '40.05', 30.4, 40.1],
      [199.96, 0.04, 200, 0],
    ];
    for (const [x, z, ex, ez] of cases) {
      const r = await place(room, 'HAZARD', 'SURFACE', x, z);
      assert.equal(r.status, 201, `${x},${z}: ${r.text}`);
      assert.deepEqual([r.body.result.x, r.body.result.z], [ex, ez], `${x},${z}`);
    }
    // Duplicate placements at the same point stay distinct objects.
    const d1 = await place(room, 'DECOY', 'ROCK', 50, 50);
    const d2 = await place(room, 'DECOY', 'ROCK', 50, 50);
    assert.notEqual(d1.body.result.id, d2.body.result.id);
  });

  test('R07 invalid coordinates are rejected with no state change', async () => {
    const room = await createRoom();
    await place(room, 'HAZARD', 'SURFACE', 10, 10);
    const before = await snapshot(room);
    const bad: unknown[] = [-0.1, 200.01, 'NaN', 'Infinity', '-Infinity', '', '   ', 'abc', '12abc', null, true, [], {}, 1e400];
    for (const v of bad) {
      for (const [x, z] of [[v, 10], [10, v]]) {
        const r = await place(room, 'HAZARD', 'SURFACE', x, z);
        assert.equal(r.status, 400, `${JSON.stringify(v)} -> ${r.status}`);
        assert.equal(r.body.error, 'INVALID_COORDINATE');
        assert.equal(r.body.message, 'X and Z must be finite numbers between 0 and 200 virtual units.');
      }
    }
    // Raw JSON with NaN/Infinity literals is not valid JSON at all.
    const raw = await call('POST', objectsUrl(room.roomCode), undefined, room.attackerToken, '{"kind":"HAZARD","subtype":"SURFACE","x":NaN,"z":Infinity}');
    assert.equal(raw.status, 400);
    assert.equal(raw.body.error, 'INVALID_REQUEST');
    const missing = await call('POST', objectsUrl(room.roomCode), { kind: 'HAZARD', subtype: 'SURFACE' }, room.attackerToken);
    assert.equal(missing.body.error, 'INVALID_COORDINATE');
    assert.deepEqual(await snapshot(room), before);
  });

  test('R08 move keeps the stable ID, bumps revision and writes a MOVE audit event', async () => {
    const room = await createRoom();
    const created = (await place(room, 'HAZARD', 'OBSCURED', 75, 80)).body.result;
    const r = await call('PATCH', `${objectsUrl(room.roomCode)}/${created.id}`, { baseRevision: created.revision, x: 76.26, z: 81 }, room.attackerToken);
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.result.id, created.id);
    assert.deepEqual([r.body.result.x, r.body.result.z], [76.3, 81]);
    assert.ok(r.body.result.revision > created.revision);
    const snap = await snapshot(room);
    assert.equal(snap.objects.length, 1, 'move must not create another object');
    const ev = snap.history[0];
    assert.equal(ev.action, 'MOVE');
    assert.equal(ev.objectId, created.id);
    assert.deepEqual(ev.before, { kind: 'HAZARD', subtype: 'OBSCURED', x: 75, z: 80 });
    assert.deepEqual(ev.after, { kind: 'HAZARD', subtype: 'OBSCURED', x: 76.3, z: 81 });
    const bad = await call('PATCH', `${objectsUrl(room.roomCode)}/${created.id}`, { baseRevision: r.body.result.revision, x: 201 }, room.attackerToken);
    assert.equal(bad.body.error, 'INVALID_COORDINATE');
  });

  test('R09 valid category edit persists; invalid kind/subtype pair has no side effects', async () => {
    const room = await createRoom();
    const o = (await place(room, 'HAZARD', 'SURFACE', 20, 20)).body.result;
    const ok = await call('PATCH', `${objectsUrl(room.roomCode)}/${o.id}`, { baseRevision: o.revision, kind: 'DECOY', subtype: 'CONTAINER' }, room.attackerToken);
    assert.equal(ok.status, 200, ok.text);
    assert.equal(ok.body.snapshot.history[0].action, 'UPDATE');
    const before = await snapshot(room);
    for (const body of [
      { kind: 'DECOY', subtype: 'BURIED' },
      { kind: 'HAZARD', subtype: 'ROCK' },
      { kind: 'MINE', subtype: 'SURFACE' },
      { subtype: 'SURFACE' },
    ]) {
      const r = await call('PATCH', `${objectsUrl(room.roomCode)}/${o.id}`, { baseRevision: ok.body.result.revision, ...body }, room.attackerToken);
      assert.equal(r.body.error, 'INVALID_OBJECT_TYPE', JSON.stringify(body));
    }
    const create = await place(room, 'DECOY', 'BURIED', 10, 10);
    assert.equal(create.body.error, 'INVALID_OBJECT_TYPE');
    assert.deepEqual(await snapshot(room), before);
  });

  test('R10 delete removes the active object, keeps audit, and the ID cannot be edited again', async () => {
    const room = await createRoom();
    const o = (await place(room, 'HAZARD', 'BURIED', 120, 105)).body.result;
    const del = await call('DELETE', `${objectsUrl(room.roomCode)}/${o.id}`, undefined, room.attackerToken);
    assert.equal(del.status, 200, del.text);
    const snap = await snapshot(room);
    assert.equal(snap.objects.length, 0);
    assert.deepEqual(snap.history.map((h) => h.action), ['DELETE', 'CREATE']);
    assert.deepEqual(snap.history[0].before, { kind: 'HAZARD', subtype: 'BURIED', x: 120, z: 105 });
    const again = await call('PATCH', `${objectsUrl(room.roomCode)}/${o.id}`, { baseRevision: o.revision, x: 1 }, room.attackerToken);
    assert.equal(again.body.error, 'OBJECT_NOT_FOUND');
    assert.equal((await call('DELETE', `${objectsUrl(room.roomCode)}/${o.id}`, undefined, room.attackerToken)).body.error, 'OBJECT_NOT_FOUND');
  });

  test('object limit: the 101st active object is rejected, not dropped silently', async () => {
    const room = await createRoom();
    for (let i = 0; i < 100; i++) assert.equal((await place(room, 'DECOY', 'ROCK', i, i)).status, 201);
    const over = await place(room, 'DECOY', 'ROCK', 150, 150);
    assert.equal(over.status, 409);
    assert.equal(over.body.error, 'OBJECT_LIMIT');
    assert.equal((await snapshot(room)).objects.length, 100);
  });
});

describe('security', () => {
  test('R11 defender HTTP and Socket traffic contains no hidden object data', async () => {
    const room = await createRoom();
    const blue = await openSocket();
    const frames = recordTraffic(blue);
    const joinReply = await join(blue, room.roomCode);
    frames.push(JSON.stringify(joinReply));

    const placed = [];
    for (const [kind, subtype, x, z] of [
      ['HAZARD', 'SURFACE', 30, 40],
      ['HAZARD', 'OBSCURED', 75, 80],
      ['HAZARD', 'BURIED', 120, 105],
      ['DECOY', 'ROCK', 60, 130],
    ] as const) {
      placed.push((await place(room, kind, subtype, x, z)).body.result);
    }
    const moved = await call('PATCH', `${objectsUrl(room.roomCode)}/${placed[0].id}`, { baseRevision: placed[0].revision, x: 31.7, z: 42.3 }, room.attackerToken);
    await call('DELETE', `${objectsUrl(room.roomCode)}/${placed[3].id}`, undefined, room.attackerToken);
    await settle();

    frames.push((await call('GET', `/api/rooms/${room.roomCode}/public`)).text);
    const traffic = frames.join('\n');

    assert.ok(frames.some((f) => f.includes('room:public-snapshot')), 'blue did receive public updates');
    for (const o of placed) assert.ok(!traffic.includes(o.id), `object id ${o.id} leaked`);
    for (const word of ['SURFACE', 'OBSCURED', 'BURIED', 'ROCK', 'HAZARD', 'DECOY', 'objects', 'history', room.attackerToken]) {
      assert.ok(!traffic.includes(word), `"${word}" leaked to defender`);
    }
    for (const key of ['"x":', '"z":', '31.7', '42.3']) assert.ok(!traffic.includes(key), `coordinate data ${key} leaked`);
    assert.ok(moved.status === 200);
  });

  test('R12 room code alone (or a wrong/other-room token) cannot read or mutate the scenario', async () => {
    const room = await createRoom();
    const other = await createRoom();
    const o = (await place(room, 'HAZARD', 'SURFACE', 10, 10)).body.result;
    const before = await snapshot(room);
    const attempts: [string, string, unknown][] = [
      ['GET', '/snapshot', undefined],
      ['POST', '/objects', { kind: 'HAZARD', subtype: 'SURFACE', x: 5, z: 5 }],
      ['PATCH', `/objects/${o.id}`, { baseRevision: o.revision, x: 99 }],
      ['DELETE', `/objects/${o.id}`, undefined],
      ['POST', '/mode', { mode: 'LIVE' }],
      ['POST', '/lock', undefined],
    ];
    for (const token of [undefined, '', room.roomCode, other.attackerToken, `${room.attackerToken}x`, 'a'.repeat(43)]) {
      for (const [method, suffix, body] of attempts) {
        const r = await call(method, `/api/rooms/${room.roomCode}/attacker${suffix}`, body, token);
        assert.equal(r.status, 401, `${method} ${suffix} token=${token?.slice(0, 6)}`);
        assert.equal(r.body.error, 'ATTACKER_AUTH_REQUIRED');
        assert.ok(!r.text.includes('SURFACE'));
      }
    }
    // Socket: wrong token is refused, not silently downgraded.
    const s = await openSocket();
    const reply = await join(s, room.roomCode, other.attackerToken);
    assert.ok(!reply.ok && reply.error === 'ATTACKER_AUTH_REQUIRED');
    assert.deepEqual(await snapshot(room), before);
  });

  test('R13 two authorized Red sessions receive identical updates', async () => {
    const room = await createRoom();
    const red1 = await openSocket();
    const red2 = await openSocket();
    const j1 = await join(red1, room.roomCode, room.attackerToken);
    const j2 = await join(red2, room.roomCode, room.attackerToken);
    assert.ok(j1.ok && j1.role === 'attacker' && j2.ok && j2.role === 'attacker');
    const p1 = nextEvent(red1, 'room:attacker-snapshot');
    const p2 = nextEvent(red2, 'room:attacker-snapshot');
    const created = (await place(room, 'HAZARD', 'OBSCURED', 44.4, 55.5)).body.result;
    const [s1, s2] = await Promise.all([p1, p2]);
    assert.deepEqual(s1, s2);
    assert.equal(s1.objects[0].id, created.id);
    assert.deepEqual([s1.objects[0].x, s1.objects[0].z], [44.4, 55.5]);
  });

  test('R14 rooms are isolated: no cross-room events or objects', async () => {
    const a = await createRoom();
    const b = await createRoom();
    const redB = await openSocket();
    const blueB = await openSocket();
    await join(redB, b.roomCode, b.attackerToken);
    await join(blueB, b.roomCode);
    const redFrames = recordTraffic(redB);
    const blueFrames = recordTraffic(blueB);
    const objA = (await place(a, 'HAZARD', 'SURFACE', 12.3, 45.6)).body.result;
    await settle();
    assert.deepEqual(redFrames, [], 'room B red got room A events');
    assert.deepEqual(blueFrames, [], 'room B blue got room A events');
    assert.equal((await snapshot(b)).objects.length, 0);
    // Room A's token cannot touch room B, and room B cannot address room A's object.
    assert.equal((await call('GET', `/api/rooms/${b.roomCode}/attacker/snapshot`, undefined, a.attackerToken)).status, 401);
    const cross = await call('PATCH', `${objectsUrl(b.roomCode)}/${objA.id}`, { baseRevision: objA.revision, x: 1 }, b.attackerToken);
    assert.equal(cross.body.error, 'OBJECT_NOT_FOUND');
    assert.equal((await call('DELETE', `${objectsUrl(b.roomCode)}/${objA.id}`, undefined, b.attackerToken)).body.error, 'OBJECT_NOT_FOUND');
    assert.equal((await snapshot(a)).objects.length, 1);
  });

  test('R15 Challenge lock: every mutation is rejected server-side with STATE_LOCKED', async () => {
    const room = await createRoom();
    const o = (await place(room, 'HAZARD', 'SURFACE', 10, 10)).body.result;
    const lock = await call('POST', `/api/rooms/${room.roomCode}/attacker/lock`, undefined, room.attackerToken);
    assert.equal(lock.status, 200, lock.text);
    assert.equal(lock.body.snapshot.state, 'LOCKED');
    const before = await snapshot(room);
    const attempts: [string, string, unknown][] = [
      ['POST', '/objects', { kind: 'HAZARD', subtype: 'SURFACE', x: 5, z: 5 }],
      ['PATCH', `/objects/${o.id}`, { baseRevision: o.revision, x: 99 }],
      ['DELETE', `/objects/${o.id}`, undefined],
      ['POST', '/mode', { mode: 'LIVE' }],
      ['POST', '/lock', undefined],
    ];
    for (const [method, suffix, body] of attempts) {
      const r = await call(method, `/api/rooms/${room.roomCode}/attacker${suffix}`, body, room.attackerToken);
      assert.equal(r.status, 409, `${method} ${suffix}: ${r.text}`);
      assert.equal(r.body.error, 'STATE_LOCKED');
    }
    assert.deepEqual(await snapshot(room), before);
    const pub = await call('GET', `/api/rooms/${room.roomCode}/public`);
    assert.equal(pub.body.state, 'LOCKED');
  });

  test('mode switch: allowed in DRAFT, audited; lock only applies to Challenge', async () => {
    const room = await createRoom();
    const r = await call('POST', `/api/rooms/${room.roomCode}/attacker/mode`, { mode: 'LIVE' }, room.attackerToken);
    assert.equal(r.body.snapshot.mode, 'LIVE');
    assert.equal(r.body.snapshot.history[0].action, 'MODE_CHANGE');
    const lock = await call('POST', `/api/rooms/${room.roomCode}/attacker/lock`, undefined, room.attackerToken);
    assert.equal(lock.body.error, 'INVALID_REQUEST');
    assert.equal((await call('POST', `/api/rooms/${room.roomCode}/attacker/mode`, { mode: 'WAR' }, room.attackerToken)).body.error, 'INVALID_REQUEST');
  });

  test('R16 (groundwork) Live edits allowed while RUNNING/PAUSED with audit; Challenge never; FINISHED never', async () => {
    const matrix: [ScenarioMode, ScenarioState, boolean][] = [
      ['CHALLENGE', 'DRAFT', true],
      ['CHALLENGE', 'LOCKED', false],
      ['CHALLENGE', 'RUNNING', false],
      ['CHALLENGE', 'PAUSED', false],
      ['CHALLENGE', 'FINISHED', false],
      ['LIVE', 'DRAFT', true],
      ['LIVE', 'RUNNING', true],
      ['LIVE', 'PAUSED', true],
      ['LIVE', 'FINISHED', false],
    ];
    for (const [mode, state, expected] of matrix) assert.equal(canEditObjects(mode, state), expected, `${mode}/${state}`);

    // Drive the server store into RUNNING (the mission engine will do this in MG-007).
    const room = await createRoom();
    await call('POST', `/api/rooms/${room.roomCode}/attacker/mode`, { mode: 'LIVE' }, room.attackerToken);
    const rec = server.store.findRoom(room.roomCode)!;
    server.store.setState(rec, 'RUNNING', 12.5);
    const live = await place(room, 'HAZARD', 'SURFACE', 90, 90);
    assert.equal(live.status, 201, live.text);
    const hist = (await snapshot(room)).history;
    assert.deepEqual(hist.slice(0, 2).map((h) => h.action), ['CREATE', 'STATE_CHANGE']);
    assert.equal(hist[1].missionSimTime, 12.5);
    assert.ok(hist[0].revision > hist[1].revision, 'revisions are monotonic');
    // Mode cannot be changed mid-mission to escape the rules.
    assert.equal((await call('POST', `/api/rooms/${room.roomCode}/attacker/mode`, { mode: 'CHALLENGE' }, room.attackerToken)).body.error, 'STATE_LOCKED');
    server.store.setState(server.store.findRoom(room.roomCode)!, 'FINISHED');
    assert.equal((await place(room, 'HAZARD', 'SURFACE', 91, 91)).body.error, 'STATE_LOCKED');
  });

  test('R18 stale edit: second writer with an old baseRevision gets REVISION_CONFLICT, no lost update', async () => {
    const room = await createRoom();
    const o = (await place(room, 'HAZARD', 'SURFACE', 10, 10)).body.result;
    const first = await call('PATCH', `${objectsUrl(room.roomCode)}/${o.id}`, { baseRevision: o.revision, x: 20 }, room.attackerToken);
    assert.equal(first.status, 200);
    const stale = await call('PATCH', `${objectsUrl(room.roomCode)}/${o.id}`, { baseRevision: o.revision, x: 30 }, room.attackerToken);
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error, 'REVISION_CONFLICT');
    assert.equal(stale.body.current.x, 20, 'conflict returns the current server version');
    const staleDelete = await call('DELETE', `${objectsUrl(room.roomCode)}/${o.id}?baseRevision=${o.revision}`, undefined, room.attackerToken);
    assert.equal(staleDelete.body.error, 'REVISION_CONFLICT');
    assert.equal((await snapshot(room)).objects[0].x, 20);
    const missingBase = await call('PATCH', `${objectsUrl(room.roomCode)}/${o.id}`, { x: 40 }, room.attackerToken);
    assert.equal(missingBase.body.error, 'INVALID_REQUEST');
  });
});

describe('persistence', () => {
  test('R17 room state survives a full server restart; roles are restored correctly', async () => {
    const room = await createRoom();
    const o = (await place(room, 'HAZARD', 'OBSCURED', 66.6, 77.7)).body.result;
    await call('POST', `/api/rooms/${room.roomCode}/attacker/lock`, undefined, room.attackerToken);
    const before = await snapshot(room);

    await stop();
    server = createMineGuardServer({ dbPath });
    await listen();

    assert.deepEqual(await snapshot(room), before);
    const red = await openSocket();
    const r = await join(red, room.roomCode, room.attackerToken);
    assert.ok(r.ok && r.role === 'attacker');
    assert.equal(r.snapshot.objects[0].id, o.id);
    assert.equal(r.snapshot.state, 'LOCKED');
    const blue = await openSocket();
    const b = await join(blue, room.roomCode);
    assert.ok(b.ok && b.role === 'defender');
    assert.ok(!JSON.stringify(b).includes(o.id));
  });

  test('R19 attacker token is stored only as a hash and never logged', async () => {
    const room = await createRoom();
    await place(room, 'HAZARD', 'SURFACE', 10, 10);
    await call('GET', `/api/rooms/${room.roomCode}/attacker/snapshot`, undefined, 'wrong-token-wrong-token-wrong');
    const files = fs.readdirSync(tmpDir).map((f) => fs.readFileSync(path.join(tmpDir, f)));
    for (const buf of files) assert.ok(!buf.includes(Buffer.from(room.attackerToken)), 'token found in database file');
    assert.ok(!logged.join('\n').includes(room.attackerToken), 'token found in server logs');
    const pub = await call('GET', `/api/rooms/${room.roomCode}/public`);
    assert.ok(!pub.text.includes(room.attackerToken));
  });
});
