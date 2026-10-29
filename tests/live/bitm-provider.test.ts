// Optional LIVE-provider integration smoke test (not part of ordinary e2e):
// opens the REAL Esri World Imagery service in headless Chromium, without
// faking provider tiles or downloading/exporting a map file. May fail due to
// temporary third-party connectivity; must not be called a guaranteed SLA.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright-core';
import { clientDist, createMineGuardServer } from '../../server/src/app.js';
import { visiblePixelDifference } from '../helpers/screenshot-difference.js';

assert.ok(fs.existsSync(path.join(clientDist, 'index.html')), 'Build frontend first');
const app = createMineGuardServer({ dbPath: ':memory:', autoTick: false });
let browser: Browser;
let host = '';
before(async () => {
  await new Promise<void>((resolve) => app.httpServer.listen(0, '127.0.0.1', resolve));
  host = 'http://127.0.0.1:' + (app.httpServer.address() as AddressInfo).port;
  browser = await chromium.launch({
    channel: process.env.MINEGUARD_E2E_BROWSER ?? 'chromium',
    headless: true,
    args: ['--enable-unsafe-swiftshader'],
  });
});
after(async () => {
  await browser?.close();
  app.io.close();
  await new Promise<void>((resolve, reject) => app.httpServer.close((error) => error ? reject(error) : resolve()));
});

test('LIVE BITM imagery: actual cross-origin Esri photo tiles render, not just a decorative circle', {
  timeout: 120000,
}, async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });
  const tileResponses: { status: number; type: string | null }[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/World_Imagery/MapServer/tile/14/')) {
      tileResponses.push({ status: response.status(), type: response.headers()['content-type'] ?? null });
    }
  });
  try {
    await page.goto(host + '/blue');
    await page.waitForSelector('[data-testid="world-view"][data-rendered="true"]');
    const canvas = page.locator('[data-testid="world-view"] canvas');
    const before = await canvas.screenshot();
    await page.click('[data-testid="map-mode-bitm"]');
    await page.waitForSelector('[data-testid="world-view"][data-map-available="true"]', { timeout: 90000 });
    const tileStatus = await page.locator('[data-testid="world-view"]').getAttribute('data-map-tile-status');
    assert.ok(tileStatus);
    const count = tileStatus.match(/(\d+)\/(\d+) satellite tiles/);
    assert.ok(count, 'UI should report actual successful tile counts: ' + tileStatus);
    assert.ok(Number(count[1]) >= 9, 'At least nine real satellite tiles must decode successfully');
    assert.ok(Number(count[1]) / Number(count[2]) > 0.80, 'At least 80% of actual map tiles must load');
    assert.ok(tileResponses.length >= Number(count[1]), 'Browser should receive actual Esri tile HTTP requests');
    assert.ok(tileResponses.filter((x) => x.status === 200 && x.type?.startsWith('image/')).length >= 9,
      'Esri tile responses must be real images, not API errors');
    assert.equal(await page.locator('[data-testid="bitm-map-label"]').count(), 0,
      'A large circle/label must not hide the imagery by default');
    await page.waitForTimeout(350);
    const after = await canvas.screenshot();

    // Decode screenshot pixels in an in-memory browser canvas. No imagery
    // screenshots or real map bytes are saved, redistributed or cached.
    const diff = await visiblePixelDifference(page, before, after, 0.2, 10);
    assert.ok(diff > 0.10, 'Actual visible pixels must change materially; delta fraction=' + diff);
    console.log('LIVE BITM overview visible: ' + tileStatus + ', material pixel change=' + diff.toFixed(3));

    // The original z14 overview is not enough to identify individual
    // buildings. Prove that pressing zoom requests and displays genuine
    // higher-native-resolution Esri tiles near BITM, not enlarged z14 pixels.
    const detailResponses: { status: number; type: string | null; url: string }[] = [];
    page.on('response', (response) => {
      if (/World_Imagery\/MapServer\/tile\/1[7-9]\//.test(response.url())) {
        detailResponses.push({
          status: response.status(),
          type: response.headers()['content-type'] ?? null,
          url: response.url(),
        });
      }
    });
    for (let i = 0; i < 6; i++) {
      await page.click('[data-testid="satellite-zoom-in"]');
    }
    await page.waitForFunction(() => {
      const element = document.querySelector('[data-testid="world-view"]');
      return element?.getAttribute('data-satellite-detail-state') === 'ready' &&
        Number(element.getAttribute('data-satellite-detail-zoom')) >= 18 &&
        Number(element.getAttribute('data-satellite-detail-loaded')) >= 8;
    }, undefined, { timeout: 80000 });
    const detailZoom = await page.locator('[data-testid="world-view"]').getAttribute('data-satellite-detail-zoom');
    const detailStatus = await page.locator('[data-testid="satellite-detail-status"]').innerText();
    assert.ok(detailResponses.filter((r) => r.status === 200 && r.type?.startsWith('image/')).length >= 8,
      'Higher zoom must receive real photo images from Esri, not a scaled overview');
    assert.ok(detailStatus.includes('higher-detail image tiles'));
    console.log('LIVE BITM CLOSE-UP visible: z' + detailZoom + ', ' + detailStatus +
      ', high-resolution requests=' + detailResponses.length);
  } finally {
    await page.close();
  }
});
