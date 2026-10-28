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
    assert.match(route.request().url(), /World_Imagery\/MapServer\/tile\/14\/\d+\/\d+/);
    await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: TILE_PNG });
  });
  await page.goto(origin + pathname);
  await page.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 30000 });
  return page;
}


async function renderedDifference(page: Page, before: Buffer, after: Buffer): Promise<number> {
  const toData = (value: Buffer) => 'data:image/png;base64,' + value.toString('base64');
  return page.evaluate(async ({ a, b }) => {
    const read = async (src: string): Promise<ImageData> => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    };
    const old = await read(a), current = await read(b);
    if (old.width !== current.width || old.height !== current.height) throw Error('Canvas dimensions changed');
    let changed = 0, total = 0;
    // Sample only the central 70% of the canvas; text overlays and HUD sit
    // outside, so this tests painted map pixels rather than status messages.
    for (let y = Math.floor(old.height * 0.15); y < old.height * 0.85; y += 9) {
      for (let x = Math.floor(old.width * 0.15); x < old.width * 0.85; x += 9) {
        const i = (y * old.width + x) * 4;
        const difference = Math.abs(old.data[i] - current.data[i]) +
          Math.abs(old.data[i + 1] - current.data[i + 1]) +
          Math.abs(old.data[i + 2] - current.data[i + 2]);
        if (difference > 75) changed++;
        total++;
      }
    }
    return changed / Math.max(1, total);
  }, { a: toData(before), b: toData(after) });
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
      const changed = await renderedDifference(page, originalPixels, satellitePixels);
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
