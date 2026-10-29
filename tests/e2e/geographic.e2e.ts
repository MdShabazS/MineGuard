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
import { visiblePixelDifference } from '../helpers/screenshot-difference.js';

// A real, sizeable test PNG rather than the former 1×1 pixel. This is a
// fixture from the fictional world, NOT a claim that it is satellite imagery.
const TILE_PNG = fs.readFileSync(path.join(process.cwd(), 'tasks/evidence/screenshots/MG-007-overview.png'));
const SMALL_PNG = Buffer.from(
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
  await page.route('https://services.arcgisonline.com/**', async (route) => {
    assert.match(route.request().url(), /World_Imagery\/MapServer\/tile\/1[4-9]\/\d+\/\d+/);
    await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: TILE_PNG });
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
      const originalPixels = await page.locator('[data-testid="world-view"] canvas').screenshot();
      await page.click('[data-testid="map-mode-bitm"]');
      await page.waitForSelector('[data-testid="world-view"][data-map-mode="BITM"][data-map-available="true"]', { timeout: 18000 });
      const meta = await page.locator('[data-testid="bitm-map-metadata"]').innerText();
      assert.match(meta, /5 km radius/);
      assert.match(meta, /illustrative, not real DEM elevation/);
      assert.ok(meta.includes(BITM_AREA.latitude.toFixed(6)) && meta.includes(BITM_AREA.longitude.toFixed(6)));
      const tileStatus = await page.locator('[data-testid="world-view"]').getAttribute('data-map-tile-status');
      assert.match(tileStatus ?? '', /^\d+\/\d+ satellite tiles displayed$/);
      await page.waitForTimeout(350); // WebGL upload/render after CanvasTexture creation
      const satellitePixels = await page.locator('[data-testid="world-view"] canvas').screenshot();
      const changed = await visiblePixelDifference(page, originalPixels, satellitePixels);
      assert.ok(changed > 0.10, 'Satellite map must materially repaint the rendered terrain, not just report "loaded": difference=' + changed);
      assert.equal(await page.locator('[data-testid="bitm-map-label"]').count(), 0,
        'No obstructive 5 km circle or label by default');
      await page.click('[data-testid="toggle-map-boundary"]');
      await page.waitForSelector('[data-testid="bitm-map-label"]', { timeout: 12000 });
      await page.click('[data-testid="toggle-map-boundary"]');
      await page.waitForSelector('[data-testid="bitm-map-label"]', { state: 'detached' });
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
      name: 'licensed-area.png', mimeType: 'image/png', buffer: SMALL_PNG,
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


test('BITM satellite supports zoom buttons, panning, real image detail requests and a full-size map', {
  timeout: 90000,
}, async () => {
  const page = await open('/blue');
  try {
    const detailedRequests: string[] = [];
    page.on('request', (r) => {
      if (/World_Imagery\/MapServer\/tile\/1[7-9]\//.test(r.url())) detailedRequests.push(r.url());
    });
    await page.click('[data-testid="map-mode-bitm"]');
    await page.waitForSelector('[data-testid="world-view"][data-map-available="true"]', { timeout: 20000 });
    const baseChecksum = await page.locator('[data-testid="world-view"]').getAttribute('data-checksum');

    const canvas = page.locator('[data-testid="world-view"] canvas');
    const startCamera = await page.locator('[data-testid="world-view"]').getAttribute('data-camera');
    for (let i = 0; i < 6; i++) {
      await page.click('[data-testid="satellite-zoom-in"]');
    }
    await page.waitForFunction(() => {
      const world = document.querySelector('[data-testid="world-view"]');
      return world?.getAttribute('data-satellite-detail-state') === 'ready' &&
        Number(world.getAttribute('data-satellite-detail-zoom')) >= 18 &&
        Number(world.getAttribute('data-satellite-detail-loaded')) >= 8;
    }, undefined, { timeout: 35000 });
    assert.ok(detailedRequests.length >= 8,
      'Zooming in must load actual higher-resolution tile URLs, not upscale z14 only');
    assert.match(await page.locator('[data-testid="satellite-detail-status"]').innerText(), /higher-detail image tiles/);
    assert.equal(await page.locator('[data-testid="world-view"]').getAttribute('data-checksum'), baseChecksum);
    const zoomCamera = await page.locator('[data-testid="world-view"]').getAttribute('data-camera');
    assert.notEqual(startCamera, zoomCamera);

    // Drag must move the map, not place a route waypoint or trigger camera orbit.
    const rect = await canvas.boundingBox();
    assert.ok(rect);
    const mouseX = rect.x + rect.width * 0.55;
    const mouseY = rect.y + rect.height * 0.50;
    await page.mouse.move(mouseX, mouseY);
    await page.mouse.down();
    await page.mouse.move(mouseX + 110, mouseY + 55, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(650);
    assert.notEqual(await page.locator('[data-testid="world-view"]').getAttribute('data-camera'), zoomCamera,
      'Left-drag should pan the satellite map');

    const widthBefore = (await page.locator('[data-testid="world-view"]').boundingBox())!.width;
    await page.click('[data-testid="satellite-expand"]');
    const widthAfter = (await page.locator('[data-testid="world-view"]').boundingBox())!.width;
    assert.ok(widthAfter > widthBefore * 1.2, 'Expand map should materially enlarge the visible satellite');
    await page.keyboard.press('Escape');
    const widthClosed = (await page.locator('[data-testid="world-view"]').boundingBox())!.width;
    assert.ok(widthClosed < widthAfter * 0.85);

    await page.click('[data-testid="satellite-recenter"]');
    await page.waitForTimeout(500);
    await page.click('[data-testid="map-mode-original"]');
    assert.equal(await page.locator('[data-testid="world-view"]').getAttribute('data-map-mode'), 'ORIGINAL');
  } finally {
    await page.close();
  }
});
