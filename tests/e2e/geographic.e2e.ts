// BITM satellite-view E2E: provider imagery is MOCKED on purpose. This test
// verifies projection UI, mode switching, licensed import and original fallback;
// it does NOT prove Esri live service availability or imagery capture date.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright-core';
import { clientDist, createMineGuardServer } from '../../server/src/app.js';
import { BITM_AREA } from '../../shared/geographic.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlV5dQAAAAASUVORK5CYII=',
  'base64',
);
assert.ok(fs.existsSync(path.join(clientDist, 'index.html')), 'npm run build required before E2E');

const instance = createMineGuardServer({ dbPath: ':memory:', autoTick: false });
const channel = process.env.MINEGUARD_E2E_BROWSER ?? 'msedge';
let browser: Browser;
let origin = '';
before(async () => {
  await new Promise<void>((resolve) => instance.httpServer.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + (instance.httpServer.address() as AddressInfo).port;
  browser = await chromium.launch({ channel, headless: true, args: ['--enable-unsafe-swiftshader'] });
});
after(async () => {
  await browser?.close();
  instance.io.close();
  await new Promise<void>((resolve, reject) => instance.httpServer.close((err) => err ? reject(err) : resolve()));
});
async function open(pathname: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1240, height: 920 } });
  await page.route('https://server.arcgisonline.com/**', async (route) => {
    // Mocked JPEG export endpoint; one tiny PNG is enough for texture-loading UI.
    assert.match(route.request().url(), /World_Imagery\/MapServer\/export/);
    await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG });
  });
  await page.goto(origin + pathname);
  await page.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 30000 });
  return page;
}

test('Red and Blue both select the same BITM 5km satellite view while world truth stays unchanged', async () => {
  const red = await open('/red');
  const blue = await open('/blue');
  try {
    const before = await red.locator('[data-testid="world-view"]').getAttribute('data-checksum');
    const blueBefore = await blue.locator('[data-testid="world-view"]').getAttribute('data-checksum');
    assert.equal(before, blueBefore);
    for (const page of [red, blue]) {
      assert.equal(await page.locator('[data-testid="world-view"]').getAttribute('data-map-mode'), 'ORIGINAL');
      await page.click('[data-testid="map-mode-bitm"]');
      await page.waitForSelector('[data-testid="world-view"][data-map-mode="BITM"][data-map-available="true"]', { timeout: 18000 });
      const meta = await page.locator('[data-testid="bitm-map-metadata"]').innerText();
      assert.match(meta, /5 km radius/);
      assert.match(meta, /illustrative, not real DEM elevation/);
      assert.ok(meta.includes(BITM_AREA.latitude.toFixed(6)) && meta.includes(BITM_AREA.longitude.toFixed(6)));
      await page.waitForSelector('[data-testid="bitm-map-label"]', { timeout: 12000 });
      assert.equal(await page.locator('[data-testid="world-view"]').getAttribute('data-checksum'), before);
    }
    // Public world JSON stays private-object free and bit-for-bit unchanged by view mode.
    const worldText = await (await fetch(origin + '/api/world')).text();
    assert.ok(!worldText.includes('attackerToken') && !worldText.includes('HAZARD'));
    await blue.click('[data-testid="map-mode-original"]');
    assert.equal(await blue.locator('[data-testid="world-view"]').getAttribute('data-map-mode'), 'ORIGINAL');
  } finally {
    await red.close();
    await blue.close();
  }
});

test('licensed user image import stays browser-local and original terrain can be restored', async () => {
  const page = await open('/blue');
  try {
    await page.locator('[data-testid="import-map-image"]').setInputFiles({
      name: 'licensed-area.png', mimeType: 'image/png', buffer: PNG,
    });
    await page.waitForSelector('[data-testid="world-view"][data-map-mode="IMPORT"][data-map-available="true"]', { timeout: 15000 });
    assert.match(await page.locator('[data-testid="imported-map-name"]').innerText(), /licensed-area.png/);
    await page.click('[data-testid="map-mode-original"]');
    assert.equal(await page.locator('[data-testid="world-view"]').getAttribute('data-map-mode'), 'ORIGINAL');
    await page.click('[data-testid="map-mode-import"]');
    await page.waitForSelector('[data-testid="world-view"][data-map-available="true"]', { timeout: 15000 });
  } finally {
    await page.close();
  }
});
