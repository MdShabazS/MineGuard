// MG-011 CI NETWORK EMULATION — real non-loopback IPv4 server interface with
// isolated desktop and mobile-emulated Chromium browser contexts.
// This is NOT evidence of two physical devices or public HTTPS tunnel access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright-core';
import { clientDist, createMineGuardServer } from '../../server/src/app.js';

const ip = Object.values(os.networkInterfaces()).flatMap((arr) => arr ?? [])
  .find((nic) => !nic.internal && nic.family === 'IPv4' && !nic.address.startsWith('169.254.'))?.address;
const browserChannel = process.env.MINEGUARD_E2E_BROWSER ?? 'msedge';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mg-011-lan-e2e-'));
const instance = createMineGuardServer({ dbPath: path.join(temp, 'state.sqlite') });
const built = fs.existsSync(path.join(clientDist, 'index.html'));
let browser: Browser;
let origin = '';

before(async () => {
  assert.ok(built, 'Build production client before network browser tests');
  await new Promise<void>((resolve) => instance.httpServer.listen(0, '0.0.0.0', resolve));
  const port = (instance.httpServer.address() as AddressInfo).port;
  origin = 'http://' + ip + ':' + port;
  browser = await chromium.launch({
    channel: browserChannel,
    headless: true,
    args: ['--enable-unsafe-swiftshader', '--no-sandbox'],
  });
});
after(async () => {
  await browser?.close();
  instance.io.close();
  if (instance.httpServer.listening) {
    await new Promise<void>((resolve, reject) => instance.httpServer.close((err) => err ? reject(err) : resolve()));
  }
  fs.rmSync(temp, { recursive: true, force: true });
});

test('MG-011 CI: desktop Red + emulated mobile Blue connect by non-loopback IPv4, isolate truth and rejoin', {
  skip: !ip && 'Runner has no non-loopback IPv4 interface; cannot simulate LAN',
}, async () => {
  const creation = await fetch(origin + '/api/rooms', { method: 'POST' });
  assert.equal(creation.status, 201);
  const { roomCode, attackerToken } = await creation.json() as { roomCode: string; attackerToken: string };
  const tokenHeader = { authorization: 'Bearer ' + attackerToken, 'content-type': 'application/json' };

  const placed = await fetch(origin + '/api/rooms/' + roomCode + '/attacker/objects', {
    method: 'POST', headers: tokenHeader,
    body: JSON.stringify({ kind: 'HAZARD', subtype: 'SURFACE', x: 44.5, z: 66.2 }),
  });
  assert.equal(placed.status, 201);
  const objectId = (await placed.json() as { result: { id: string } }).result.id;

  const desktop = await browser.newContext({ viewport: { width: 1380, height: 900 } });
  const mobile = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  try {
    const red = await desktop.newPage();
    const blue = await mobile.newPage();
    const errors: string[] = [];
    red.on('pageerror', (e) => errors.push('red: ' + e.message));
    blue.on('pageerror', (e) => errors.push('blue: ' + e.message));
    const bluePackets: string[] = [];
    blue.on('response', async (res) => {
      if (res.url().includes('/api/') && !res.url().endsWith('/api/world'))
        bluePackets.push(await res.text().catch(() => ''));
    });
    blue.on('websocket', (ws) => ws.on('framereceived', (f) => bluePackets.push(String(f.payload))));

    await Promise.all([
      red.goto(origin + '/red#room=' + roomCode + '&key=' + attackerToken),
      blue.goto(origin + '/blue/' + roomCode),
    ]);
    await Promise.all([
      red.waitForSelector('[data-testid="room-code"]', { timeout: 25000 }),
      blue.waitForSelector('[data-testid="blue-room-code"]', { timeout: 25000 }),
    ]);
    assert.equal((await red.locator('[data-testid="room-code"]').textContent())?.trim(), roomCode);
    assert.equal((await blue.locator('[data-testid="blue-room-code"]').textContent())?.trim(), roomCode);
    await Promise.all([
      red.waitForSelector('[data-testid="world-view"][data-checksum]', { timeout: 25000 }),
      blue.waitForSelector('[data-testid="world-view"][data-checksum]', { timeout: 25000 }),
    ]);
    assert.equal(await red.locator('[data-testid="world-view"]').getAttribute('data-checksum'),
      await blue.locator('[data-testid="world-view"]').getAttribute('data-checksum'));
    assert.equal(await blue.locator('[data-testid="object-row"]').count(), 0, 'Blue should not see Red objects');
    assert.equal(await red.locator('[data-testid="object-row"]').count(), 1, 'Red should see its private object');

    const updated = await fetch(origin + '/api/rooms/' + roomCode + '/attacker/objects', {
      method: 'POST', headers: tokenHeader,
      body: JSON.stringify({ kind: 'DECOY', subtype: 'ROCK', x: 188.8, z: 181.2 }),
    });
    assert.equal(updated.status, 201);
    const secondId = (await updated.json() as { result: { id: string } }).result.id;
    await blue.waitForFunction(() =>
      document.querySelector('[data-testid="blue-revision"]')?.textContent?.trim() === '2',
    undefined, { timeout: 20000 });

    // Force a simulated mobile network outage. Socket.IO must rejoin its
    // original public room once networking resumes; no private data is added.
    await mobile.setOffline(true);
    // Chromium's offline emulation does not always close already-established
    // WebSocket transports. Simulate the actual transport break explicitly
    // while the mobile browser is offline, then verify the app's reconnect UX.
    for (const socket of instance.io.sockets.sockets.values()) socket.conn.close();
    await blue.waitForFunction(() =>
      document.querySelector('[data-testid="blue-room"]')?.textContent?.includes('reconnecting'),
    undefined, { timeout: 15000 });
    await mobile.setOffline(false);
    await blue.waitForFunction(() =>
      document.querySelector('[data-testid="blue-room"]')?.textContent?.includes('live'),
    undefined, { timeout: 25000 });
    const publicSnapshot = await fetch(origin + '/api/rooms/' + roomCode + '/public');
    assert.equal(publicSnapshot.status, 200);
    const pub = JSON.stringify(await publicSnapshot.json());
    assert.ok(!pub.includes(objectId));
    assert.ok(!pub.includes(secondId));
    assert.ok(!pub.includes(attackerToken));
    const blueContents = await blue.evaluate(() =>
      document.documentElement.outerHTML + JSON.stringify({ ...localStorage, ...sessionStorage }));
    const packets = bluePackets.join('\n');
    for (const sensitive of [objectId, secondId, attackerToken, '44.5', '66.2', '188.8', '181.2']) {
      assert.ok(!blueContents.includes(sensitive), 'Blue DOM contained private value');
      assert.ok(!packets.includes(sensitive), 'Blue transport contained private value');
    }
    assert.deepEqual(errors, []);
  } finally {
    await mobile.close();
    await desktop.close();
  }
});
