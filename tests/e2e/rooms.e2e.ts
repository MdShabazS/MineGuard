// MG-004 browser end-to-end test: Red builds a scenario through the real UI,
// Blue joins via the public link in a separate browser context, and every byte
// Blue receives (HTTP + WebSocket) is checked for hidden scenario data.
//
// Usage: npm run build && npm run test:e2e
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { clientDist, createMineGuardServer } from '../../server/src/app.js';

const SHOTS = path.resolve('tasks/evidence/screenshots');
const channel = process.env.MINEGUARD_E2E_BROWSER ?? 'msedge';
assert.ok(fs.existsSync(path.join(clientDist, 'index.html')), 'run "npm run build" first');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mineguard-e2e-'));
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

async function newPage(ctx: BrowserContext, label: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label}: ${m.text()}`));
  return page;
}

async function worldReady(page: Page) {
  await page.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 20000 });
  await page.waitForTimeout(1200);
}

async function canvasCentre(page: Page) {
  const box = (await page.locator('canvas').boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const rows = (page: Page) => page.locator('[data-testid="object-row"]');
async function waitRows(page: Page, n: number) {
  await page.waitForFunction((count) => document.querySelectorAll('[data-testid="object-row"]').length === count, n, { timeout: 10000 });
}
async function rowData(page: Page) {
  return rows(page).evaluateAll((els) =>
    els.map((e) => ({ id: e.getAttribute('data-id')!, subtype: e.getAttribute('data-subtype')!, x: Number(e.getAttribute('data-x')), z: Number(e.getAttribute('data-z')) })),
  );
}
const revision = async (page: Page) => Number(((await page.textContent('[data-testid="scenario-revision"]')) ?? '').replace('rev ', ''));

async function addByCoordinates(page: Page, subtype: string, x: string, z: string) {
  await page.click(`[data-testid="category-${subtype}"]`);
  await page.fill('[data-testid="coord-x"]', x);
  await page.fill('[data-testid="coord-z"]', z);
  await page.click('[data-testid="add-object"]');
}

test('MG-004 Red scenario editing, Blue isolation, sync, refresh and lock', async () => {
  const redCtx = await browser.newContext();
  const blueCtx = await browser.newContext();
  const red = await newPage(redCtx, 'red');

  // ---- R01: create room -------------------------------------------------------
  await red.goto(`${baseUrl}/red`);
  await red.click('[data-testid="create-room"]');
  await red.waitForSelector('[data-testid="room-code"]');
  await worldReady(red);
  const roomCode = (await red.textContent('[data-testid="room-code"]'))!.trim();
  assert.match(roomCode, /^[A-HJ-NP-Z2-9]{6}$/);
  const hash = new URLSearchParams(new URL(red.url()).hash.slice(1));
  const token = hash.get('key')!;
  assert.equal(hash.get('room'), roomCode);
  assert.ok(token.length >= 40);
  const defenderLink = (await red.textContent('[data-testid="defender-link"]'))!.trim();
  assert.equal(defenderLink, `${baseUrl}/blue/${roomCode}`);
  assert.ok(!(await red.textContent('[data-testid="attacker-link"]'))!.includes(token), 'private link is masked by default');

  // ---- R03: terrain click places exactly one object ---------------------------
  const c = await canvasCentre(red);
  await red.click('[data-testid="category-SURFACE"]');
  await red.mouse.click(c.x, c.y);
  await waitRows(red, 1);
  const [first] = await rowData(red);
  assert.equal(first.subtype, 'SURFACE');
  assert.ok(Math.abs(first.x - 100) < 8 && Math.abs(first.z - 100) < 8, `placed at ${first.x},${first.z}`);
  assert.equal(Math.round(first.x * 10) / 10, first.x, 'normalised to 0.1');

  // ---- R04: orbit drag creates nothing ----------------------------------------
  await red.mouse.move(c.x - 200, c.y + 60);
  await red.mouse.down();
  await red.mouse.move(c.x + 200, c.y - 20, { steps: 12 });
  await red.mouse.up();
  await red.waitForTimeout(600);
  assert.equal(await rows(red).count(), 1, 'drag must not place');
  // Restore the camera so the marker is back under the centre point.
  await red.reload();
  await worldReady(red);
  await waitRows(red, 1);

  // Clicking an existing marker selects it instead of placing a duplicate.
  await red.mouse.click(c.x, c.y);
  await red.waitForSelector(`[data-testid="object-editor"][data-id="${first.id}"]`, { timeout: 5000 });
  await red.waitForTimeout(400);
  assert.equal(await rows(red).count(), 1, 'marker click must select, not place');

  // ---- R05/R06: exact coordinates for each category ----------------------------
  await addByCoordinates(red, 'OBSCURED', '30.44', '40.05');
  await waitRows(red, 2);
  await addByCoordinates(red, 'BURIED', '120', '105');
  await waitRows(red, 3);
  await addByCoordinates(red, 'ROCK', '0', '200');
  await waitRows(red, 4);
  let data = await rowData(red);
  const obscured = data.find((d) => d.subtype === 'OBSCURED')!;
  assert.deepEqual([obscured.x, obscured.z], [30.4, 40.1]);
  assert.ok(data.some((d) => d.subtype === 'BURIED' && d.x === 120 && d.z === 105));
  assert.ok(data.some((d) => d.subtype === 'ROCK' && d.x === 0 && d.z === 200));

  // ---- R07: invalid coordinates are rejected with a clear message --------------
  const revBefore = await revision(red);
  for (const [x, z] of [['200.01', '50'], ['abc', '50'], ['50', ''], ['-0.1', '10'], ['Infinity', '10']]) {
    await addByCoordinates(red, 'SURFACE', x, z);
    await red.waitForSelector('[data-testid="error-banner"]');
    assert.match((await red.textContent('[data-testid="error-banner"]'))!, /X and Z must be finite numbers between 0 and 200 virtual units/);
  }
  assert.equal(await rows(red).count(), 4);
  assert.equal(await revision(red), revBefore);

  // ---- R08/R09: move and change category; stable ID ----------------------------
  await red.click(`[data-testid="object-row"][data-id="${obscured.id}"]`);
  await red.waitForSelector(`[data-testid="object-editor"][data-id="${obscured.id}"]`);
  await red.fill('[data-testid="edit-x"]', '31');
  await red.fill('[data-testid="edit-z"]', '42.26');
  await red.click('[data-testid="save-object"]');
  await red.waitForSelector(`[data-testid="object-row"][data-id="${obscured.id}"][data-x="31"][data-z="42.3"]`);
  await red.selectOption('[data-testid="edit-category"]', { label: 'Scrap decoy' });
  await red.click('[data-testid="save-object"]');
  await red.waitForSelector(`[data-testid="object-row"][data-id="${obscured.id}"][data-subtype="SCRAP"]`);
  assert.equal(await rows(red).count(), 4, 'edits must not add objects');

  // ---- R10: delete with confirmation -------------------------------------------
  const rock = (await rowData(red)).find((d) => d.subtype === 'ROCK')!;
  await red.click(`[data-testid="object-row"][data-id="${rock.id}"]`);
  await red.click('[data-testid="delete-object"]');
  await red.click('[data-testid="confirm-delete"]');
  await waitRows(red, 3);
  assert.match((await red.textContent('[data-testid="history"]'))!, /Deleted rock/);

  // ---- R13: a second Red session sees the same list and live updates -----------
  const red2 = await newPage(redCtx, 'red2');
  await red2.goto(red.url());
  await worldReady(red2);
  await waitRows(red2, 3);
  assert.deepEqual((await rowData(red2)).map((d) => d.id).sort(), (await rowData(red)).map((d) => d.id).sort());
  await addByCoordinates(red, 'CONTAINER', '150.5', '20');
  await waitRows(red2, 4);

  // ---- R02/R11: Blue joins via public link; record every byte it receives ------
  const blue = await newPage(blueCtx, 'blue');
  const received: string[] = [];
  blue.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/') && !url.endsWith('/api/world')) received.push(`${url} ${await res.text().catch(() => '')}`);
  });
  blue.on('websocket', (ws) => ws.on('framereceived', (f) => received.push(String(f.payload))));
  await blue.goto(defenderLink);
  await worldReady(blue);
  await blue.waitForSelector('[data-testid="blue-room-code"]');
  assert.equal((await blue.textContent('[data-testid="blue-room-code"]'))!.trim(), roomCode);
  assert.equal(await blue.getAttribute('[data-testid="world-view"]', 'data-checksum'), await red.getAttribute('[data-testid="world-view"]', 'data-checksum'));
  assert.equal(await blue.locator('[data-testid="object-row"]').count(), 0);

  // Red keeps editing while Blue watches.
  await addByCoordinates(red, 'BURIED', '77.7', '88.8');
  await waitRows(red, 5);
  await blue.waitForFunction((rev) => document.querySelector('[data-testid="blue-revision"]')?.textContent === String(rev), await revision(red));

  // ---- R17: refresh both roles -------------------------------------------------
  await red.reload();
  await worldReady(red);
  await waitRows(red, 5);
  await blue.reload();
  await worldReady(blue);
  await blue.waitForSelector('[data-testid="blue-room-code"]');

  // ---- R15: lock -----------------------------------------------------------------
  await red.click('[data-testid="lock-scenario"]');
  await red.waitForSelector('[data-testid="state-badge"][data-state="LOCKED"]');
  assert.ok(await red.isDisabled('[data-testid="add-object"]'));
  await blue.waitForFunction(() => document.querySelector('[data-testid="blue-state"]')?.textContent === 'LOCKED');
  // Bypass the UI: a direct API call with the real token is still refused.
  const bypass = await red.evaluate(
    async ({ code, key }) => {
      const r = await fetch(`/api/rooms/${code}/attacker/objects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ kind: 'HAZARD', subtype: 'SURFACE', x: 5, z: 5 }),
      });
      return { status: r.status, body: await r.json() };
    },
    { code: roomCode, key: token },
  );
  assert.equal(bypass.status, 409);
  assert.equal(bypass.body.error, 'STATE_LOCKED');
  // Blue cannot use the attacker API with just the room code.
  const blueTry = await blue.evaluate(async (code) => (await fetch(`/api/rooms/${code}/attacker/snapshot`)).status, roomCode);
  assert.equal(blueTry, 401);

  // ---- R11 verdict: nothing hidden ever reached Blue ----------------------------
  data = await rowData(red);
  const traffic = received.join('\n');
  assert.ok(traffic.includes('room:public-snapshot') || traffic.includes(roomCode), 'blue traffic was captured');
  for (const d of data) assert.ok(!traffic.includes(d.id), `object id leaked to Blue: ${d.id}`);
  for (const word of ['SURFACE', 'OBSCURED', 'BURIED', 'SCRAP', 'CONTAINER', 'HAZARD', 'DECOY', '"objects"', '"history"', '"x":', '"z":', token]) {
    assert.ok(!traffic.includes(word), `"${word}" leaked to Blue`);
  }
  const blueStorage = await blue.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.documentElement.outerHTML);
  for (const d of data) assert.ok(!blueStorage.includes(d.id), 'object id in Blue DOM/storage');
  assert.ok(!blueStorage.includes(token), 'token in Blue DOM/storage');

  await red.screenshot({ path: path.join(SHOTS, 'MG-004-red.png'), fullPage: true });
  await blue.screenshot({ path: path.join(SHOTS, 'MG-004-blue.png'), fullPage: true });
  // The browser logs every deliberately rejected request as a console error. Expect
  // exactly those (5 invalid coordinates, 1 locked bypass, 1 Blue attacker call) and nothing else.
  const network = (label: string, status: number) => `${label}: Failed to load resource: the server responded with a status of ${status}`;
  const unexpected = errors.filter((e) => ![network('red', 400), network('red', 409), network('blue', 401)].some((n) => e.startsWith(n)));
  assert.deepEqual(unexpected, [], `unexpected browser errors: ${unexpected.join(' | ')}`);
  assert.equal(errors.filter((e) => e.startsWith(network('red', 400))).length, 5);
  assert.equal(errors.filter((e) => e.startsWith(network('red', 409))).length, 1);
  assert.equal(errors.filter((e) => e.startsWith(network('blue', 401))).length, 1);

  await redCtx.close();
  await blueCtx.close();
});
