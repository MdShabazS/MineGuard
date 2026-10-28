// MG-010 browser E2E: verify post-finish reveal gating and printable results.
// Uses only fictional coordinates and sanitized room data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright-core';
import { clientDist, createMineGuardServer } from '../../server/src/app.js';

assert.ok(fs.existsSync(path.join(clientDist, 'index.html')), 'Run npm run build before browser tests.');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mineguard-results-e2e-'));
const server = createMineGuardServer({ dbPath: path.join(tmp, 'state.sqlite') });
const channel = process.env.MINEGUARD_E2E_BROWSER ?? 'msedge';
let browser: Browser;
let base = '';

before(async () => {
  await new Promise<void>((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + (server.httpServer.address() as AddressInfo).port;
  browser = await chromium.launch({ channel, headless: true, args: ['--enable-unsafe-swiftshader'] });
});
after(async () => {
  await browser?.close();
  server.io.close();
  await new Promise<void>((resolve, reject) => server.httpServer.close((err) => err ? reject(err) : resolve()));
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function api(method: string, url: string, payload?: unknown, token?: string) {
  const headers: Record<string, string> = {};
  if (payload !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(base + url, {
    method, headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

test('MG-010 explicit reveal and printable report via Blue browser', async () => {
  const created = await api('POST', '/api/rooms');
  assert.equal(created.status, 201);
  const { roomCode, attackerToken } = created.data as { roomCode: string; attackerToken: string };
  const add = async (kind: string, subtype: string, x: number, z: number) => {
    const r = await api('POST', '/api/rooms/' + roomCode + '/attacker/objects', { kind, subtype, x, z }, attackerToken);
    assert.equal(r.status, 201);
  };
  await add('HAZARD', 'SURFACE', 55, 100);
  await add('HAZARD', 'BURIED', 180, 180); // definitely unscanned
  await add('DECOY', 'ROCK', 75, 100);
  assert.equal((await api('POST', '/api/rooms/' + roomCode + '/attacker/lock', undefined, attackerToken)).status, 200);

  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/blue/' + roomCode);
  await page.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 25000 });

  for (const [i, point] of [[20, 100], [100, 100]].entries()) {
    await page.click('[data-testid="add-waypoint"]');
    await page.fill('[data-testid="wp-x-' + i + '"]', String(point[0]));
    await page.fill('[data-testid="wp-z-' + i + '"]', String(point[1]));
  }
  await page.click('[data-testid="confirm-plan"]');
  await page.waitForSelector('[data-testid="plan-status"][data-state="confirmed"]', { timeout: 10000 });
  await page.click('[data-testid="speed-4"]');
  await page.click('[data-testid="start-mission"]');
  await page.waitForFunction(() =>
    document.querySelector('[data-testid="telemetry"]')?.getAttribute('data-status') === 'FINISHED',
  undefined, { timeout: 25000 });

  const root = '/api/rooms/' + roomCode + '/mission/';
  const snap = await api('GET', '/api/rooms/' + roomCode + '/mission');
  const id = (snap.data as { mission: { missionId: string } }).mission.missionId;
  assert.equal((await api('GET', root + id + '/results')).status, 409);
  const denied = await fetch(base + root + id + '/report');
  assert.equal(denied.status, 409);

  await page.waitForSelector('[data-testid="reveal-results"]');
  assert.equal(await page.locator('[data-testid="report-truth"]').count(), 0, 'no truth before explicit reveal');
  page.once('dialog', (d) => void d.accept());
  await page.click('[data-testid="reveal-results"]');
  await page.waitForSelector('[data-testid="revealed-results"]');
  const metrics = await page.locator('[data-testid="report-metrics"]').innerText();
  assert.match(metrics, /Never scanned/);
  assert.match(metrics, /True observations/);
  assert.equal(await page.locator('[data-testid="report-truth"] tbody tr').count(), 3);

  const printResponse = await fetch(base + root + id + '/report');
  assert.equal(printResponse.status, 200);
  assert.match(printResponse.headers.get('content-type') ?? '', /^text\/html/);
  const html = await printResponse.text();
  assert.match(html, /Print \/ Save as PDF/);
  assert.match(html, /SIMULATED/);
  assert.doesNotMatch(html, new RegExp(attackerToken));
  assert.doesNotMatch(html, /\/red#room=/);
  // Real headless Chromium PDF output from the standalone A4 report page.
  const printPage = await context.newPage();
  await printPage.goto(base + root + id + '/report');
  const pdf = await printPage.pdf({ format: 'A4', printBackground: true });
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdf.byteLength > 2000, 'PDF should contain the report, not a blank page');
  await printPage.close();
  await page.reload();
  await page.waitForSelector('[data-testid="revealed-results"]', { timeout: 20000 });
  assert.equal(await page.locator('[data-testid="report-truth"] tbody tr').count(), 3);
  assert.deepEqual(errors, []);
  await context.close();
});
