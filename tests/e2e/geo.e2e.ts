// BITM geo-overlay regression. The imagery service is intentionally mocked:
// this verifies application switching and texturing without downloading,
// redistributing, or relying on any copyrighted raster during CI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { before, after, test } from 'node:test';
import { chromium, type Browser } from 'playwright-core';
import { clientDist, createMineGuardServer } from '../../server/src/app.js';

assert.ok(fs.existsSync(path.join(clientDist, 'index.html')), 'Run npm run build first');
const server = createMineGuardServer({ dbPath: ':memory:' });
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
});

test('BITM: switch real-world imagery and offline map without changing the canonical simulator world', async () => {
  const context = await browser.newContext({ viewport: { width: 1260, height: 930 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // A tiny synthetic test tile, NOT satellite imagery or a provider download.
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9kQAAAAASUVORK5CYII=', 'base64');
  let requestedTiles = 0;
  await context.route('**/World_Imagery/MapServer/tile/**', async (route) => {
    requestedTiles++;
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' },
      body: pixel,
    });
  });
  try {
    await page.goto(base + '/red');
    await page.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 25000 });
    const board = page.locator('[data-testid="world-view"]');
    const originalChecksum = await board.getAttribute('data-checksum');
    assert.equal(await board.getAttribute('data-map-mode'), 'ORIGINAL');
    await page.click('[data-testid="map-satellite"]');
    await page.waitForSelector('[data-testid="world-view"][data-imagery-status="ready"]', { timeout: 30000 });
    assert.ok(requestedTiles > 0 && requestedTiles < 144, 'bounded XYZ tile requests for 5 km reference');
    assert.equal(await board.getAttribute('data-map-mode'), 'SATELLITE');
    assert.equal(await board.getAttribute('data-checksum'), originalChecksum);
    assert.match((await page.locator('[data-testid="map-attribution"]').textContent()) ?? '', /Esri/);
    assert.match((await page.locator('[data-testid="world-view"]').textContent()) ?? '', /5 km radius/i);

    // Local (already licensed) image is loaded from disk without a remote tile request.
    const offlinePng = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#486d49';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#bdad83';
      ctx.fillRect(100, 100, 150, 150);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const beforeOffline = requestedTiles;
    await page.click('[data-testid="map-offline"]');
    await page.locator('[data-testid="map-file"]').setInputFiles({
      name: 'licensed-test-map.png',
      mimeType: 'image/png',
      buffer: Buffer.from(offlinePng, 'base64'),
    });
    await page.waitForSelector('[data-testid="world-view"][data-map-mode="OFFLINE"][data-imagery-status="ready"]', { timeout: 18000 });
    assert.equal(requestedTiles, beforeOffline);
    assert.match((await page.locator('[data-testid="map-attribution"]').textContent()) ?? '', /User-supplied imagery/);
    assert.equal(await board.getAttribute('data-checksum'), originalChecksum);

    await page.click('[data-testid="map-original"]');
    await page.waitForSelector('[data-testid="world-view"][data-map-mode="ORIGINAL"]');
    assert.equal(await board.getAttribute('data-checksum'), originalChecksum);
    assert.equal(await page.locator('[data-testid="map-attribution"]').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
