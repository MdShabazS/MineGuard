// MG-010: real backend HTTP and historical-score integration checks.
// All coordinates, hazards and observations are fictional simulation fixtures.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { createMineGuardServer } from '../src/app.js';
import { drawFromDigest, drawKey } from '../../shared/sensor.js';

async function withServer(
  run: (s: ReturnType<typeof createMineGuardServer>, base: string, advance: (ms: number) => void) => Promise<void>,
) {
  let now = 100000;
  const s = createMineGuardServer({ dbPath: ':memory:', autoTick: false, now: () => now });
  await new Promise<void>((resolve) => s.httpServer.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (s.httpServer.address() as AddressInfo).port;
  try {
    await run(s, base, (ms) => { now += ms; s.engine.tickAll(); });
  } finally {
    s.io.close();
    await new Promise<void>((resolve, reject) => s.httpServer.close((err) => err ? reject(err) : resolve()));
  }
}

const req = async (base: string, method: string, path: string) => {
  const response = await fetch(base + path, { method });
  const body = response.headers.get('content-type')?.includes('text/html') ? await response.text() : await response.json();
  return { status: response.status, type: response.headers.get('content-type'), body };
};

function setup(s: ReturnType<typeof createMineGuardServer>, mode: 'CHALLENGE' | 'LIVE' = 'CHALLENGE') {
  const created = s.store.createRoom();
  const room = created.room;
  if (mode === 'CHALLENGE') {
    const locked = s.store.lock(room);
    assert.equal(locked.ok, true);
  } else {
    const changed = s.store.setMode(room, 'LIVE');
    assert.equal(changed.ok, true);
  }
  return room;
}
function begin(s: ReturnType<typeof createMineGuardServer>, room: ReturnType<typeof setup>, mode: 'BASIC' | 'ADVANCED' = 'BASIC') {
  const p = s.engine.setPlan(room, { routeKind: 'MANUAL', waypoints: [{ x: 20, z: 100 }, { x: 180, z: 100 }], sensorMode: mode, footprintProfile: 'STANDARD' });
  assert.equal(p.ok, true);
  if (!p.ok) throw Error('Plan setup failed');
  const started = s.engine.command(room, { action: 'START', planId: p.value.id, planRevision: p.value.planRevision, playbackSpeed: 4 });
  assert.equal(started.ok, true);
  if (!started.ok) throw Error('Mission start failed');
  return started.value.mission!.missionId;
}
function finish(s: ReturnType<typeof createMineGuardServer>, advance: (ms: number) => void) {
  for (let i = 0; i < 5; i++) advance(2000);
}

test('MG-010 P01-P11 P25 P30 P32-P34: server-only reveal, Basic scoring, frozen print', async () => {
  await withServer(async (s, base, advance) => {
    const room = s.store.createRoom().room;
    const a = s.store.createObject(room, { kind: 'HAZARD', subtype: 'SURFACE', x: 60, z: 100 });
    const b = s.store.createObject(room, { kind: 'HAZARD', subtype: 'BURIED', x: 150, z: 175 });
    const c = s.store.createObject(room, { kind: 'DECOY', subtype: 'ROCK', x: 100, z: 100 });
    assert.ok(a.ok && b.ok && c.ok);
    assert.equal(s.store.lock(room).ok, true);
    const id = begin(s, room);
    const root = '/api/rooms/' + room.code + '/mission/' + id;
    assert.equal((await req(base, 'GET', root + '/results')).status, 409, 'cannot read truth while running');
    assert.equal((await req(base, 'POST', root + '/reveal')).status, 409, 'cannot reveal while running');
    assert.equal((await req(base, 'GET', root + '/report')).status, 409, 'cannot print truth while running');
    finish(s, advance);
    assert.equal(s.engine.latestMission(room.id)?.status, 'FINISHED');
    assert.equal((await req(base, 'GET', root + '/results')).status, 409, 'finish is not reveal');
    assert.equal((await req(base, 'GET', root + '/report')).status, 409, 'finish is not export');
    const revealed = await req(base, 'POST', root + '/reveal');
    assert.equal(revealed.status, 200);
    const report = (revealed.body as { result: import('../../shared/results.js').FrozenMissionResult }).result;
    assert.deepEqual(report.metrics, {
      tp: 1, fp: 0, fn: 0, unscanned: 1,
      eligibleScannedHazards: 1, hazardsActiveDuringMission: 2, precision: 1, recall: 1,
    });
    assert.equal(report.candidates.length, 1);
    assert.equal(report.truth.length, 3);
    assert.ok(report.truth.some((o) => o.disposition === 'NOT_SCANNED'));
    const rereveal = await req(base, 'POST', root + '/reveal');
    assert.equal((rereveal.body as { result: typeof report }).result.reportId, report.reportId);
    assert.equal((await req(base, 'GET', root + '/results')).status, 200);
    const printed = await req(base, 'GET', root + '/report');
    assert.equal(printed.status, 200);
    assert.match(printed.type ?? '', /text\/html/);
    const page = printed.body as string;
    assert.match(page, /Print \/ Save as PDF/);
    assert.match(page, /Never scanned/);
    assert.doesNotMatch(page, /attackerToken/);
    assert.doesNotMatch(page, /REDACTED_SECRET/);
    const other = s.store.createRoom().room;
    assert.equal((await req(base, 'GET', '/api/rooms/' + other.code + '/mission/' + id + '/results')).status, 404);
  });
});

test('MG-010 P15-P16: zero denominators are N/A, never 100%', async () => {
  await withServer(async (s, base, advance) => {
    const room = setup(s);
    const id = begin(s, room);
    finish(s, advance);
    const out = await req(base, 'POST', '/api/rooms/' + room.code + '/mission/' + id + '/reveal');
    assert.equal(out.status, 200);
    const m = (out.body as { result: import('../../shared/results.js').FrozenMissionResult }).result.metrics;
    assert.deepEqual([m.tp, m.fp, m.fn, m.unscanned, m.precision, m.recall], [0, 0, 0, 0, null, null]);
  });
});

test('MG-010 P12/P17: Advanced seeded miss is FN, not UNSCANNED', async () => {
  await withServer(async (s, base, advance) => {
    const room = s.store.createRoom().room;
    const hazard = s.store.createObject(room, { kind: 'HAZARD', subtype: 'BURIED', x: 75, z: 102 });
    assert.ok(hazard.ok);
    if (!hazard.ok) return;
    assert.equal(s.store.lock(room).ok, true);
    const id = begin(s, room, 'ADVANCED');
    let seed = '';
    for (let n = 0; n < 500; n++) {
      const next = 'miss-seed-' + n;
      const draw = drawFromDigest(crypto.createHash('sha256').update(drawKey(next, id, hazard.value.id)).digest());
      if (draw >= 0.5) { seed = next; break; }
    }
    assert.ok(seed);
    const mission = s.engine.latestMission(room.id)!;
    mission.seed = seed;
    s.store.db.prepare('UPDATE missions SET seed=? WHERE id=?').run(seed, id);
    finish(s, advance);
    const report = (await req(base, 'POST', '/api/rooms/' + room.code + '/mission/' + id + '/reveal')).body as {
      result: import('../../shared/results.js').FrozenMissionResult;
    };
    assert.deepEqual([report.result.metrics.tp, report.result.metrics.fn, report.result.metrics.unscanned], [0, 1, 0]);
    assert.equal(report.result.metrics.precision, null);
    assert.equal(report.result.metrics.recall, 0);
  });
});

test('MG-010 P18/P22: early stop and Live deletion retain accurate historical truth', async () => {
  await withServer(async (s, base, advance) => {
    const room = s.store.createRoom().room;
    const detected = s.store.createObject(room, { kind: 'HAZARD', subtype: 'SURFACE', x: 60, z: 100 });
    const notScanned = s.store.createObject(room, { kind: 'HAZARD', subtype: 'SURFACE', x: 155, z: 175 });
    assert.ok(detected.ok && notScanned.ok);
    assert.equal(s.store.setMode(room, 'LIVE').ok, true);
    const id = begin(s, room);
    advance(2000); // 8 simulated seconds; surface target was scanned
    assert.equal(s.sensor.candidates(id).length, 1);
    if (!detected.ok) return;
    const deleted = s.store.deleteObject(room, detected.value.id);
    assert.equal(deleted.ok, true);
    const stopped = s.engine.command(room, { action: 'STOP', missionId: id });
    assert.equal(stopped.ok, true);
    const out = await req(base, 'POST', '/api/rooms/' + room.code + '/mission/' + id + '/reveal');
    assert.equal(out.status, 200);
    const result = (out.body as { result: import('../../shared/results.js').FrozenMissionResult }).result;
    assert.equal(result.endReason, 'STOPPED_EARLY');
    assert.ok(result.actualFlownDistance < result.plan.routeLength);
    assert.deepEqual([result.metrics.tp, result.metrics.fn, result.metrics.unscanned], [1, 0, 1]);
    assert.ok(result.truth.some((o) => o.disposition === 'DETECTED' && o.eventNotes.some((n) => n.includes('DELETE'))));
  });
});


test('MG-010 P13/P16: a seeded decoy false alarm is FP, not a TP', async () => {
  await withServer(async (s, base, advance) => {
    const room = s.store.createRoom().room;
    const decoy = s.store.createObject(room, { kind: 'DECOY', subtype: 'SCRAP', x: 70, z: 101 });
    assert.ok(decoy.ok);
    if (!decoy.ok) return;
    assert.equal(s.store.lock(room).ok, true);
    const id = begin(s, room, 'ADVANCED');
    let seed = '';
    for (let n = 0; n < 500; n++) {
      const next = 'false-alarm-seed-' + n;
      const draw = drawFromDigest(crypto.createHash('sha256').update(drawKey(next, id, decoy.value.id)).digest());
      if (draw < 0.2) { seed = next; break; }
    }
    assert.ok(seed);
    s.engine.latestMission(room.id)!.seed = seed;
    s.store.db.prepare('UPDATE missions SET seed=? WHERE id=?').run(seed, id);
    finish(s, advance);
    const out = await req(base, 'POST', '/api/rooms/' + room.code + '/mission/' + id + '/reveal');
    assert.equal(out.status, 200);
    const result = (out.body as { result: import('../../shared/results.js').FrozenMissionResult }).result;
    assert.deepEqual([result.metrics.tp, result.metrics.fp, result.metrics.fn, result.metrics.unscanned], [0, 1, 0, 0]);
    assert.equal(result.metrics.precision, 0);
    assert.equal(result.metrics.recall, null);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.truth[0].disposition, 'DECOY_FALSE_ALARM');
    const html = await fetch(base + '/api/rooms/' + room.code + '/mission/' + id + '/report').then((r) => r.text());
    assert.match(html, /FP: decoy false alarm/);
  });
});
