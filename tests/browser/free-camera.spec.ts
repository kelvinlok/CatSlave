import { test, expect, type Page } from '@playwright/test';

async function tap(page: Page, id: string) {
  const hit = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!, id);
  await page.touchscreen.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
}
async function pose(page: Page) {
  return page.evaluate(() => { const c = window.__CATSLAVE_TEST__.world.camera; return { position: c.position.toArray(), rotation: c.quaternion.toArray(), zoom: c.zoom }; });
}
test.beforeEach(async ({ page }) => {
  // Input/layout checks do not depend on the expensive furnished room models.
  await page.route('**/models/**', route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
    t.game.restoreFreePlay(['Choco', 'Latte', 'Yelo', 'Miller', 'Momo']); t.game.startFreePlay(); t.refresh();
  });
});

test('compact camera tools, drag navigation, reset and keyboard zoom', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const petHeight = await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewport.h);
  const cameraTools = () => page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.filter(h => h.id.startsWith('free-camera:') || h.id.startsWith('view:') || h.id.startsWith('free-move:')).map(h => h.id));
  expect(await cameraTools()).toEqual([]);
  await tap(page, 'free-mode:camera');
  expect(await cameraTools()).toEqual(['free-camera:look', 'free-camera:move', 'view:reset']);
  const v = await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewport);
  expect(v.h).toBe(petHeight - 60);
  const origin = await pose(page);
  const x = v.x + v.w / 2, y = v.y + v.h / 2;
  async function drag(dx: number, dy: number) {
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y + dy); await page.mouse.up();
  }
  await drag(50, 20);
  expect((await pose(page)).rotation).not.toEqual(origin.rotation);
  await tap(page, 'view:reset');
  expect(await pose(page)).toEqual(origin);
  await tap(page, 'free-camera:move'); await drag(25, -60);
  const moved = await pose(page);
  expect(moved.position[2]).toBeLessThan(origin.position[2]);
  expect(moved.position[0]).toBeGreaterThan(origin.position[0]);
  expect(moved.rotation).toEqual(origin.rotation);
  await page.keyboard.press('+'); expect((await pose(page)).zoom).toBeGreaterThan(origin.zoom);
  await tap(page, 'view:reset'); expect(await pose(page)).toEqual(origin);
  await tap(page, 'free-mode:wand'); expect(await cameraTools()).toEqual([]);
  await tap(page, 'free-mode:pet'); expect(await cameraTools()).toEqual([]);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await tap(page, 'free-mode:camera');
    const layout = await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; return { controls: t.hud.controls, v: t.world.viewport, height: t.hud.height, width: t.hud.width }; });
    for (const h of layout.controls) {
      expect(h.w).toBeGreaterThanOrEqual(44); expect(h.h).toBeGreaterThanOrEqual(44);
      expect(h.x).toBeGreaterThanOrEqual(0); expect(h.x + h.w).toBeLessThanOrEqual(layout.width);
      expect(h.y + h.h).toBeLessThanOrEqual(layout.height);
      if (h.id.startsWith('free-mode:') || h.id.startsWith('free-camera:') || h.id === 'view:reset') expect(h.y).toBeGreaterThanOrEqual(layout.v.y + layout.v.h);
    }
  }
  expect(errors).toEqual([]);
});

test('real touch look, two-finger pan/pinch, finger lift and cancellation', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Chromium CDP provides real multi-touch injection.');
  await tap(page, 'free-mode:camera');
  const client = await context.newCDPSession(page);
  const v = await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewport);
  const x = v.x + v.w / 2, y = v.y + v.h / 2;
  const touch = (id: number, dx = 0, dy = 0) => ({ id, x: x + dx, y: y + dy });
  const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: ReturnType<typeof touch>[]) => {
    await client.send('Input.dispatchTouchEvent', { type, touchPoints });
    // Chrome coalesces touch moves until the next rendered frame.
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  };
  const initial = await pose(page);
  await send('touchStart', [touch(1, -40)]); await send('touchMove', [touch(1, -20, 10)]);
  expect((await pose(page)).rotation).not.toEqual(initial.rotation);
  await send('touchStart', [touch(1, -20, 10), touch(2, 40, 10)]);
  const beforePinch = await pose(page);
  await send('touchMove', [touch(1, -45, 30), touch(2, 65, 30)]);
  const pinched = await pose(page);
  expect(pinched.zoom).toBeGreaterThan(beforePinch.zoom);
  expect(pinched.position[1]).toBeGreaterThan(beforePinch.position[1]);
  expect(pinched.rotation).toEqual(beforePinch.rotation);
  await send('touchEnd', [touch(2, 65, 30)]);
  expect(await pose(page)).toEqual(pinched);
  await send('touchMove', [touch(1, -30, 30)]);
  expect((await pose(page)).rotation).not.toEqual(pinched.rotation);
  await send('touchCancel', []);
  await tap(page, 'view:reset'); expect(await pose(page)).toEqual(initial);
  await send('touchStart', [touch(1), touch(2, 40)]);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await send('touchEnd', []);
  await tap(page, 'resume');
  const resumed = await pose(page);
  await send('touchStart', [touch(1)]); await send('touchMove', [touch(1, 20)]); await send('touchEnd', []);
  expect((await pose(page)).rotation).not.toEqual(resumed.rotation);
});
