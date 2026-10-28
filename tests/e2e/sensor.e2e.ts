// MG-008 browser end-to-end test: a Basic mission over Red's hidden objects.
// Candidates appear only when the virtual footprint scans hazards; decoys and
// unscanned hazards never reach Blue; pins, list, review, refresh, second tab
// and Red tracking all agree.
//
// Usage: npm run build && npm run test:e2e
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright-core';
import { clientDist, createMineGuardServer } from '../../server/src/app.js';

/** True if the number appears as a whole value (so 90.3 does not match inside 190.35). */
const hasNumber = (text: string, n: string) => new RegExp(String.raw`(?<![\d.])` + n.replace('.', String.raw`\.`) + String.raw`(?!\d)`).test(text);

const SHOTS = path.resolve('tasks/evidence/screenshots');
const channel = process.env.MINEGUARD_E2E_BROWSER ?? 'msedge';
assert.ok(fs.existsSync(path.join(clientDist, 'index.html')), 'run "npm run build" first');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineguard-e2e-sensor-'));
const { httpServer, io } = createMineGuardServer({ dbPath: path.join(tmpDir, 'e2e.sqlite') });
let baseUrl = '';
let browser: Browser;
const errors: string[] = [];

before(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
  browser = await chromium.launch({ channel, headless: true, args: ['--enable-unsafe-swiftshader'] });
  fs.mkdirSync(SHOTS, { recursive: true });
});
after(async () => {
  await browser?.close();
  io.close();
  await new Promise((resolve) => httpServer.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function api(method: string, url: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return res.json();
}
function track(page: Page, label: string) {
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`));
}
async function ready(page: Page) {
  await page.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 20000 });
  await page.waitForTimeout(800);
}
const rows = (page: Page) =>
  page.locator('[data-testid="candidate-row"]').evaluateAll((els) => els.map((e) => ({ id: e.getAttribute('data-id')!, x: Number(e.getAttribute('data-x')), z: Number(e.getAttribute('data-z')) })));
const waitStatus = (page: Page, s: string) =>
  page.waitForFunction((st) => document.querySelector('[data-testid="telemetry"]')?.getAttribute('data-status') === st, s, { timeout: 20000 });

test('MG-008 simulated sensing: candidates only where scanned, synced, private', async () => {
  const room = await api('POST', '/api/rooms');
  const put = async (kind: string, subtype: string, x: number, z: number) =>
    (await api('POST', `/api/rooms/${room.roomCode}/attacker/objects`, { kind, subtype, x, z }, room.attackerToken)).result.id as string;
  const ids = [
    await put('HAZARD', 'SURFACE', 60.2, 103.6), // on the route -> C1
    await put('HAZARD', 'BURIED', 110.7, 96.4), // on the route -> C2 (synthetic rule)
    await put('DECOY', 'ROCK', 90.3, 100.4), // on the route, Basic ignores decoys
    await put('HAZARD', 'SURFACE', 151.7, 173.3), // never scanned
  ];
  await api('POST', `/api/rooms/${room.roomCode}/attacker/lock`, undefined, room.attackerToken);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const blue = await ctx.newPage();
  track(blue, 'blue');
  const received: string[] = [];
  blue.on('response', async (res) => {
    if (res.url().includes('/api/') && !res.url().endsWith('/api/world')) received.push(await res.text().catch(() => ''));
  });
  blue.on('websocket', (ws) => ws.on('framereceived', (f) => received.push(String(f.payload))));
  await blue.goto(`${baseUrl}/blue/${room.roomCode}`);
  await ready(blue);

  // Plan a straight Basic/Standard line through the middle of the world.
  for (const [i, [x, z]] of [[20, 100], [180, 100]].entries()) {
    await blue.click('[data-testid="add-waypoint"]');
    await blue.fill(`[data-testid="wp-x-${i}"]`, String(x));
    await blue.fill(`[data-testid="wp-z-${i}"]`, String(z));
  }
  await blue.click('[data-testid="confirm-plan"]');
  await blue.waitForSelector('[data-testid="plan-status"][data-state="confirmed"]');
  await blue.click('[data-testid="start-mission"]');
  await waitStatus(blue, 'RUNNING');

  // D18: before the footprint reaches anything there are no candidates.
  await blue.waitForTimeout(1200);
  assert.equal((await rows(blue)).length, 0);
  assert.match((await blue.textContent('[data-testid="findings-panel"]'))!, /No candidates yet/);

  await blue.click('[data-testid="speed-4"]');
  await blue.waitForFunction(() => document.querySelectorAll('[data-testid="candidate-row"]').length >= 1, undefined, { timeout: 15000 });
  await blue.waitForTimeout(500);
  await blue.screenshot({ path: path.join(SHOTS, 'MG-008-blue-sensing.png') });
  await blue.click('[data-testid="camera-TOP_DOWN"]');
  await blue.waitForTimeout(1800);
  await blue.screenshot({ path: path.join(SHOTS, 'MG-008-blue-top-down.png') });
  await waitStatus(blue, 'FINISHED');

  // D02/D03/D04/D05: exactly the two scanned hazards, in order of first entry.
  const found = await rows(blue);
  assert.deepEqual(found.map((r) => [r.x, r.z]), [[60.2, 103.6], [110.7, 96.4]]);
  assert.match((await blue.textContent('[data-testid="tel-coverage"]'))!, /u²/);

  // D19: pin and card agree; selecting a row shows the detail; review toggles.
  await blue.click(`[data-testid="candidate-row"][data-id="${found[1].id}"]`);
  await blue.waitForSelector('[data-testid="candidate-detail"]');
  assert.match((await blue.textContent('[data-testid="candidate-detail"]'))!, /not a confirmed mine/);
  await blue.click('[data-testid="review-1"]');
  await blue.waitForFunction(() => document.querySelector('[data-testid="review-1"]')?.textContent === 'Reviewed');

  // D20: refresh and a second tab show the same two candidates, no duplicates.
  await blue.reload();
  await ready(blue);
  await blue.waitForFunction(() => document.querySelectorAll('[data-testid="candidate-row"]').length === 2);
  assert.deepEqual((await rows(blue)).map((r) => r.id), found.map((r) => r.id));
  assert.equal(await blue.textContent('[data-testid="review-1"]'), 'Reviewed', 'review persisted');
  const blue2 = await ctx.newPage();
  track(blue2, 'blue2');
  await blue2.goto(`${baseUrl}/blue/${room.roomCode}`);
  await ready(blue2);
  await blue2.waitForFunction(() => document.querySelectorAll('[data-testid="candidate-row"]').length === 2);
  assert.deepEqual((await rows(blue2)).map((r) => r.id), found.map((r) => r.id));

  // Optional Red tracking shows the same public candidates.
  const red = await ctx.newPage();
  track(red, 'red');
  await red.goto(`${baseUrl}/red#room=${room.roomCode}&key=${room.attackerToken}`);
  await ready(red);
  await red.waitForFunction(() => /FINISHED · 2 candidates/.test(document.querySelector('[data-testid="red-tracking-status"]')?.textContent ?? ''), undefined, { timeout: 10000 });
  await red.screenshot({ path: path.join(SHOTS, 'MG-008-red-tracking.png') });

  // D18/D19/D22: nothing private ever reached Blue.
  const traffic = received.join('\n').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>');
  assert.ok(traffic.includes('observation:created'), 'live candidate events were captured');
  for (const id of ids) assert.ok(!traffic.includes(id), 'object id leaked');
  for (const w of ['SURFACE', 'BURIED', 'ROCK', 'HAZARD', 'DECOY', 'outcome', 'DETECTED', 'DECOY_IGNORED', '"objects"', '"history"', room.attackerToken]) {
    assert.ok(!traffic.includes(w), `"${w}" leaked to Blue`);
  }
  for (const n of ['90.3', '100.4', '151.7', '173.3']) assert.ok(!hasNumber(traffic, n), `unscanned/ignored coordinate ${n} leaked`);
  const dom = await blue.evaluate(() => document.documentElement.outerHTML + JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  for (const id of ids) assert.ok(!dom.includes(id));

  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  await ctx.close();
});
