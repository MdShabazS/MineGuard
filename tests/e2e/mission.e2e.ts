// MG-007 browser end-to-end test: Blue plans manual and grid missions through
// the real UI, flies the server-driven drone, uses all controls and cameras,
// refreshes, opens a second tab, and never receives hidden Red data.
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

/** True if the number appears as a whole value (so 96.7 does not match inside 96.79 or 196.7). */
const hasNumber = (text: string, n: string) => new RegExp(String.raw`(?<![\d.])` + n.replace('.', String.raw`\.`) + String.raw`(?!\d)`).test(text);

const SHOTS = path.resolve('tasks/evidence/screenshots');
const channel = process.env.MINEGUARD_E2E_BROWSER ?? 'msedge';
assert.ok(fs.existsSync(path.join(clientDist, 'index.html')), 'run "npm run build" first');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineguard-e2e-mission-'));
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

async function openBlue(ctxPage: Page, code: string, received?: string[]) {
  if (received) {
    ctxPage.on('response', async (res) => {
      const url = res.url();
      if (url.includes('/api/') && !url.endsWith('/api/world')) received.push(`${url} ${await res.text().catch(() => '')}`);
    });
    ctxPage.on('websocket', (ws) => ws.on('framereceived', (f) => received.push(String(f.payload))));
  }
  await ctxPage.goto(`${baseUrl}/blue/${code}`);
  await ctxPage.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 20000 });
  await ctxPage.waitForSelector('[data-testid="blue-room-code"]');
  await ctxPage.waitForTimeout(1000);
}

function track(page: Page, label: string) {
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`));
}

const tel = async (page: Page) => {
  const el = page.locator('[data-testid="telemetry"]');
  return {
    missionId: (await el.getAttribute('data-mission-id'))!,
    status: (await el.getAttribute('data-status'))!,
    distance: Number(await el.getAttribute('data-distance')),
    sequence: Number(await el.getAttribute('data-sequence')),
  };
};
const waitStatus = (page: Page, status: string) =>
  page.waitForFunction((s) => document.querySelector('[data-testid="telemetry"]')?.getAttribute('data-status') === s, status, { timeout: 15000 });
const waypointCount = (page: Page) => page.locator('[data-testid="waypoint-row"]').count();
const cameraPose = (page: Page) => page.getAttribute('[data-testid="world-view"]', 'data-camera');

async function setManualRoute(page: Page, pts: [number, number][]) {
  if (!(await page.isDisabled('[data-testid="clear-waypoints"]'))) await page.click('[data-testid="clear-waypoints"]');
  for (const [i, [x, z]] of pts.entries()) {
    await page.click('[data-testid="add-waypoint"]');
    await page.fill(`[data-testid="wp-x-${i}"]`, String(x));
    await page.fill(`[data-testid="wp-z-${i}"]`, String(z));
  }
}

test('MG-007 Blue mission planning, flight controls, cameras, refresh and privacy', async () => {
  // Red side via the API: a room with hidden objects at distinctive coordinates.
  const room = await api('POST', '/api/rooms');
  const hidden: [string, string, number, number][] = [
    ['HAZARD', 'SURFACE', 37.3, 141.7],
    ['HAZARD', 'BURIED', 181.9, 21.3],
    ['DECOY', 'SCRAP', 133.3, 96.7],
  ];
  const ids: string[] = [];
  for (const [kind, subtype, x, z] of hidden) ids.push((await api('POST', `/api/rooms/${room.roomCode}/attacker/objects`, { kind, subtype, x, z }, room.attackerToken)).result.id);

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const blue = await ctx.newPage();
  track(blue, 'blue');
  const received: string[] = [];
  await openBlue(blue, room.roomCode, received);

  // ---- M01: same world, no Red objects --------------------------------------
  assert.equal((await blue.textContent('[data-testid="blue-room-code"]'))!.trim(), room.roomCode);
  assert.equal(await blue.getAttribute('[data-testid="world-view"]', 'data-terrain-id'), 'mg-field-01');

  // ---- M02: terrain clicks add ordered waypoints; M08: drag adds none --------
  const box = (await blue.locator('canvas').boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await blue.click('[data-testid="pick-toggle"]');
  await blue.mouse.click(cx - 120, cy + 40);
  await blue.mouse.click(cx + 120, cy - 40);
  await blue.waitForFunction(() => document.querySelectorAll('[data-testid="waypoint-row"]').length === 2);
  const wx0 = Number(await blue.inputValue('[data-testid="wp-x-0"]'));
  const wx1 = Number(await blue.inputValue('[data-testid="wp-x-1"]'));
  assert.ok(wx0 < 100 && wx1 > 100, `click order preserved (${wx0}, ${wx1})`);
  assert.equal(Math.round(wx0 * 10) / 10, wx0, 'picked coordinate rounded to 0.1');
  await blue.mouse.move(cx - 200, cy + 80);
  await blue.mouse.down();
  await blue.mouse.move(cx + 200, cy - 80, { steps: 12 });
  await blue.mouse.up();
  await blue.waitForTimeout(400);
  assert.equal(await waypointCount(blue), 2, 'orbit drag must not add a waypoint');
  await blue.click('[data-testid="pick-toggle"]'); // exit planning mode
  await blue.click('[data-testid="reset-view"]');

  // ---- M03/M04: exact entry, reorder, remove, clear; live length preview -----
  await setManualRoute(blue, [[20, 20], [80, 20], [80, 95], [135, 95], [135, 135]]);
  assert.equal(await waypointCount(blue), 5);
  assert.equal(await blue.textContent('[data-testid="route-length"]'), '230.0');
  await blue.click('[data-testid="wp-down-0"]');
  assert.equal(await blue.inputValue('[data-testid="wp-x-0"]'), '80');
  assert.notEqual(await blue.textContent('[data-testid="route-length"]'), '230.0', 'reorder recalculates length');
  await blue.click('[data-testid="wp-up-1"]');
  await blue.click('[data-testid="wp-remove-4"]');
  assert.equal(await blue.textContent('[data-testid="route-length"]'), '190.0');
  // M05/M07 in the UI: invalid point shows a reason and disables Confirm.
  await blue.click('[data-testid="add-waypoint"]');
  await blue.fill('[data-testid="wp-x-4"]', '200.01');
  await blue.fill('[data-testid="wp-z-4"]', '50');
  assert.match((await blue.textContent('[data-testid="route-invalid"]'))!, /between 0 and 200/);
  assert.ok(await blue.isDisabled('[data-testid="confirm-plan"]'));
  await blue.click('[data-testid="wp-remove-4"]');
  await setManualRoute(blue, [[20, 20], [80, 20], [80, 95], [135, 95], [135, 135]]);

  // ---- confirm plan; M13 Challenge DRAFT cannot start --------------------------
  await blue.click('[data-testid="confirm-plan"]');
  await blue.waitForSelector('[data-testid="plan-status"][data-state="confirmed"]');
  assert.ok(await blue.isDisabled('[data-testid="start-mission"]'));
  assert.match((await blue.textContent('[data-testid="start-blocked"]'))!, /lock the scenario/);
  // A draft change makes the confirmed plan stale.
  await blue.fill('[data-testid="wp-z-4"]', '136');
  await blue.waitForSelector('[data-testid="plan-status"][data-state="stale"]');
  await blue.fill('[data-testid="wp-z-4"]', '135');
  await blue.waitForSelector('[data-testid="plan-status"][data-state="confirmed"]');

  // Red locks; Blue's Start unlocks without a refresh.
  await api('POST', `/api/rooms/${room.roomCode}/attacker/lock`, undefined, room.attackerToken);
  await blue.waitForFunction(() => !(document.querySelector('[data-testid="start-mission"]') as HTMLButtonElement)?.disabled, undefined, { timeout: 5000 });

  // ---- M14: start; M16 pause freezes; M17 resume continues --------------------
  await blue.click('[data-testid="start-mission"]');
  await waitStatus(blue, 'RUNNING');
  await blue.waitForTimeout(1500);
  const t1 = await tel(blue);
  assert.ok(t1.distance > 5, `drone moving (${t1.distance})`);
  await blue.screenshot({ path: path.join(SHOTS, 'MG-007-running.png') });

  await blue.click('[data-testid="pause-mission"]');
  await waitStatus(blue, 'PAUSED');
  const paused = await tel(blue);
  await blue.waitForTimeout(1500);
  assert.equal((await tel(blue)).distance, paused.distance, 'frozen while paused');

  // ---- M26: refresh while PAUSED recovers the same mission ---------------------
  await blue.reload();
  await blue.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 20000 });
  await waitStatus(blue, 'PAUSED');
  const afterReload = await tel(blue);
  assert.equal(afterReload.missionId, paused.missionId);
  assert.equal(afterReload.distance, paused.distance);
  assert.equal(await waypointCount(blue), 5, 'planner reloads the confirmed route after refresh');
  assert.equal(await blue.getAttribute('[data-testid="plan-status"]', 'data-state'), 'confirmed');

  await blue.click('[data-testid="resume-mission"]');
  await waitStatus(blue, 'RUNNING');
  // ---- M20: 4x ------------------------------------------------------------------
  await blue.click('[data-testid="speed-4"]');
  await blue.waitForFunction(() => document.querySelector('[data-testid="tel-speed"]')?.textContent === '4×');
  const s0 = await tel(blue);
  await blue.waitForTimeout(1000);
  const s1 = await tel(blue);
  assert.ok(s1.distance - s0.distance > 20, `4x covers ~32 units/s (${s1.distance - s0.distance})`);
  // Back to 1x so the route does not finish while the cameras are being checked.
  await blue.click('[data-testid="speed-1"]');
  await blue.waitForFunction(() => document.querySelector('[data-testid="tel-speed"]')?.textContent === '1×');

  // Pause the authoritative server clock before slow software-WebGL screenshots.
  // This preserves a live, resumable mission on slow Linux CI machines.
  await blue.click('[data-testid="pause-mission"]');
  await waitStatus(blue, 'PAUSED');

  // ---- M22-M25: three distinct cameras; switching never changes the mission ---
  const poses: Record<string, string> = {};
  for (const mode of ['OVERVIEW', 'TOP_DOWN', 'FOLLOW'] as const) {
    await blue.click(`[data-testid="camera-${mode}"]`);
    await blue.waitForFunction((m) => document.querySelector('[data-testid="world-view"]')?.getAttribute('data-camera-mode') === m, mode);
    await blue.waitForTimeout(1800);
    poses[mode] = (await cameraPose(blue))!;
    await blue.screenshot({ path: path.join(SHOTS, `MG-007-${mode.toLowerCase().replace('_', '-')}.png`) });
  }
  const [ov, td, fo] = [poses.OVERVIEW, poses.TOP_DOWN, poses.FOLLOW].map((p) => p.split(',').map(Number));
  assert.ok(Math.abs(ov[0]) < 2 && ov[1] > 150 && ov[2] > 180, `overview pose ${poses.OVERVIEW}`);
  assert.ok(Math.abs(td[0]) < 2 && td[1] > 250 && Math.abs(td[2]) < 2, `top-down pose ${poses.TOP_DOWN}`);
  assert.ok(fo[1] < 80, `follow camera is low and close (${poses.FOLLOW})`);
  assert.equal(new Set(Object.values(poses)).size, 3, 'three distinct poses');
  const afterCams = await tel(blue);
  assert.equal(afterCams.missionId, paused.missionId, 'camera switches do not change the mission');
  assert.equal(afterCams.status, 'PAUSED', 'camera switches cannot resume or finish the mission');

  // ---- M27: second Blue tab shows the same mission ------------------------------
  const blue2 = await ctx.newPage();
  track(blue2, 'blue2');
  await openBlue(blue2, room.roomCode);
  await waitStatus(blue2, 'PAUSED');
  assert.equal((await tel(blue2)).missionId, paused.missionId);

  // ---- M18: stop early from tab 2; tab 1 sees it ---------------------------------
  await blue2.click('[data-testid="stop-mission"]');
  await waitStatus(blue, 'FINISHED');
  assert.match((await blue.textContent('[data-testid="tel-status"]'))!, /Stopped early/);
  const stopped = await tel(blue);
  assert.ok(stopped.distance < 230, 'partial progress kept');
  assert.ok(!(await blue.textContent('[data-testid="tel-progress"]'))!.startsWith('100'), 'not 100%');

  // ---- New mission, M09/M10 grid, M19 complete -------------------------------------
  await blue.click('[data-testid="new-mission"]');
  await blue.waitForFunction(() => document.querySelector('[data-testid="blue-state"]')?.textContent === 'LOCKED');
  await blue.click('[data-testid="camera-OVERVIEW"]');
  await blue.click('[data-testid="tab-GRID"]');
  for (const [k, v] of Object.entries({ x1: '20', z1: '25', x2: '160', z2: '145', spacing: '20' })) await blue.fill(`[data-testid="grid-${k}"]`, v);
  assert.equal(await blue.textContent('[data-testid="route-points"]'), '14');
  assert.equal(await blue.textContent('[data-testid="route-length"]'), '1100.0');
  assert.equal(await blue.isDisabled('[data-testid="confirm-plan"]'), false, 'valid grid draft can be confirmed');
  await blue.waitForTimeout(1800); // let the camera settle back to Overview
  await blue.screenshot({ path: path.join(SHOTS, 'MG-007-grid-preview.png') });
  // A small grid we can fly to completion quickly at 4x (length 100).
  for (const [k, v] of Object.entries({ x1: '20', z1: '20', x2: '60', z2: '40', spacing: '20' })) await blue.fill(`[data-testid="grid-${k}"]`, v);
  assert.equal(await blue.textContent('[data-testid="route-length"]'), '100.0');
  await blue.click('[data-testid="confirm-plan"]');
  await blue.waitForSelector('[data-testid="plan-status"][data-state="confirmed"]');
  await blue.click('[data-testid="speed-4"]');
  await blue.click('[data-testid="start-mission"]');
  await waitStatus(blue, 'FINISHED');
  assert.match((await blue.textContent('[data-testid="tel-status"]'))!, /Route completed/);
  assert.match((await blue.textContent('[data-testid="tel-progress"]'))!, /^100\.0%/);
  // Two lanes along X: (20,20)->(60,20)->(60,40)->(20,40), so the serpentine ends back at X 20.
  assert.equal((await blue.textContent('[data-testid="tel-xz"]'))!.trim(), '20.0 / 40.0');
  // Hidden objects are off-route or Basic-ignored decoys, so no candidate may appear.
  assert.match((await blue.textContent('[data-testid="findings-panel"]'))!, /No candidates yet/);

  // ---- M29: nothing hidden reached Blue --------------------------------------------
  const traffic = received.join('\n').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, '<time>');
  assert.ok(traffic.includes('mission:telemetry'), 'telemetry was captured');
  for (const id of ids) assert.ok(!traffic.includes(id), 'object id leaked');
  for (const w of ['SURFACE', 'BURIED', 'SCRAP', 'HAZARD', 'DECOY', '"objects"', '"history"', room.attackerToken]) {
    assert.ok(!traffic.includes(w), `"${w}" leaked to Blue`);
  }
  // Telemetry carries unrounded floats (e.g. distance 96.79...), so match coordinates as whole numbers.
  for (const n of ['37.3', '141.7', '181.9', '21.3', '133.3', '96.7']) assert.ok(!hasNumber(traffic, n), `coordinate ${n} leaked to Blue`);
  const dom = await blue.evaluate(() => document.documentElement.outerHTML + JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  for (const id of ids) assert.ok(!dom.includes(id));
  assert.ok(!dom.includes(room.attackerToken));

  // ---- M30: Red portal still works and still shows its objects ------------------------
  const red = await ctx.newPage();
  track(red, 'red');
  await red.goto(`${baseUrl}/red#room=${room.roomCode}&key=${room.attackerToken}`);
  await red.waitForFunction(() => document.querySelectorAll('[data-testid="object-row"]').length === 3, undefined, { timeout: 15000 });
  assert.equal(await red.getAttribute('[data-testid="state-badge"]', 'data-state'), 'FINISHED');

  // The only console errors allowed are none: every request in this journey is valid.
  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  await ctx.close();
});
