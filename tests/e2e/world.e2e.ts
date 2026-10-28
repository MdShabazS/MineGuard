// Browser end-to-end check for MG-002: opens the Red and Blue portals side by
// side in a real (headless) browser against the production server, and checks
// both render the same WebGL world and report consistent X/Z coordinates.
//
// Usage: npm run build && npm run test:e2e
// Browser: MINEGUARD_E2E_BROWSER=msedge|chrome (default msedge, uses the installed browser).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright-core';
import { clientDist, createMineGuardServer } from '../../server/src/app.js';
import { createWorldDefinition } from '../../shared/world.js';

const SHOTS = path.resolve('tasks/evidence/screenshots');
const channel = process.env.MINEGUARD_E2E_BROWSER ?? 'msedge';
const world = createWorldDefinition();

assert.ok(fs.existsSync(path.join(clientDist, 'index.html')), 'run "npm run build" first');

const { httpServer, io } = createMineGuardServer({ dbPath: ':memory:' });
let baseUrl = '';
let browser: Browser;

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
});

async function openPortal(route: string): Promise<{ page: Page; errors: string[] }> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${baseUrl}${route}`);
  await page.waitForSelector('[data-testid="world-view"][data-rendered="true"]', { timeout: 20000 });
  await page.waitForSelector('canvas');
  // Let a few frames render before measuring.
  await page.waitForTimeout(1500);
  return { page, errors };
}

const viewAttr = (page: Page, name: string) => page.getAttribute('[data-testid="world-view"]', name);

test('Red and Blue portals render the same shared 3D world', async () => {
  const red = await openPortal('/red');
  const blue = await openPortal('/blue');
  try {
    for (const { page } of [red, blue]) {
      assert.equal(await viewAttr(page, 'data-terrain-id'), world.terrainId);
      assert.equal(await viewAttr(page, 'data-checksum'), world.checksum);
      const gl = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return !!(c && (c.getContext('webgl2') || c.getContext('webgl')));
      });
      assert.ok(gl, 'WebGL context available');
      const box = await page.locator('canvas').boundingBox();
      assert.ok(box && box.width > 600 && box.height > 300, `canvas size ${JSON.stringify(box)}`);
    }
    assert.match((await red.page.textContent('[data-testid="portal-title"]')) ?? '', /Red Team/);
    assert.match((await blue.page.textContent('[data-testid="portal-title"]')) ?? '', /Blue Team/);

    await red.page.screenshot({ path: path.join(SHOTS, 'MG-002-red.png') });
    await blue.page.screenshot({ path: path.join(SHOTS, 'MG-002-blue.png') });
    assert.deepEqual(red.errors, [], `Red console errors: ${red.errors.join(' | ')}`);
    assert.deepEqual(blue.errors, [], `Blue console errors: ${blue.errors.join(' | ')}`);
  } finally {
    await red.page.close();
    await blue.page.close();
  }
});

test('clicking the same screen point gives the same X/Z in both portals; a drag is not a click', async () => {
  const red = await openPortal('/red');
  const blue = await openPortal('/blue');
  try {
    const picks: string[] = [];
    for (const { page } of [red, blue]) {
      const box = (await page.locator('canvas').boundingBox())!;
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.click(cx, cy);
      await page.waitForFunction(() => document.querySelector('[data-testid="world-view"]')?.getAttribute('data-picked'));
      const picked = (await viewAttr(page, 'data-picked'))!;
      const [x, z] = picked.split(',').map(Number);
      // The default camera looks at the world centre (100, 100); terrain height shifts the hit slightly.
      assert.ok(Math.abs(x - 100) < 8 && Math.abs(z - 100) < 8, `centre click landed at ${picked}`);
      picks.push(picked);

      // An orbit drag must not change the picked coordinate.
      await page.mouse.move(cx - 150, cy);
      await page.mouse.down();
      await page.mouse.move(cx + 150, cy + 40, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      assert.equal(await viewAttr(page, 'data-picked'), picked, 'drag changed the pick');
    }
    assert.equal(picks[0], picks[1], 'Red and Blue map the same screen point to different X/Z');
  } finally {
    await red.page.close();
    await blue.page.close();
  }
});
