import { expect, test, type Page } from '@playwright/test';

test.use({ reducedMotion: 'no-preference' });

async function tap(page: Page, id: string) {
  const h = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.find(hit => hit.id === id)!, id);
  expect(h, id).toBeDefined();
  await page.touchscreen.tap(h.x + h.w / 2, h.y + h.h / 2);
}
async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
}

test('entrance crosses the glass door, holds the clock, pauses and supports keyboard skip', async ({ page }) => {
  await ready(page); await tap(page, 'start');
  const start = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return { entering: t.world.enteringRoom, position: t.world.camera.position.toArray(), clock: t.game.clock };
  });
  expect(start.entering).toBe(true); expect(start.position[0]).toBeCloseTo(-4.6); expect(start.position[2]).toBeGreaterThan(8);
  await page.evaluate(() => window.__CATSLAVE_TEST__.refresh(1));
  const moving = await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.toArray());
  expect(moving).not.toEqual(start.position);
  // The topmost Pause control comes first in keyboard order.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.focusedId)).toBe('pause');
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('paused');
  await page.evaluate(() => window.__CATSLAVE_TEST__.refresh(10));
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.toArray())).toEqual(moving);
  await tap(page, 'resume');
  await page.setViewportSize({ width: 360, height: 740 });
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.width)).toBe(360);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.toArray())).toEqual(moving);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.enteringRoom)).toBe(false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.position.toArray())).toEqual([-2.6, 1.65, 5.4]);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.clock)).toBe(start.clock);
});

test('a slow arrival render does not open pause, and the game clock starts after arrival', async ({ page }) => {
  // Isolate the deliberate stall from unrelated asset uploads on software GPUs.
  await page.route('**/models/*.glb', route => route.abort());
  await ready(page); await tap(page, 'start');
  const arrival = await page.evaluate(() => new Promise<{ phase: string; clock: number; entering: boolean }>(resolve => {
    const t = window.__CATSLAVE_TEST__;
    t.refresh(3.79);
    const draw = t.hud.draw.bind(t.hud);
    t.hud.draw = (...args) => {
      draw(...args);
      if (t.world.enteringRoom) return;
      t.hud.draw = draw;
      const until = performance.now() + 1100;
      while (performance.now() < until) { /* Simulate expensive final-frame rendering. */ }
      requestAnimationFrame(() => requestAnimationFrame(() => resolve({ phase: t.game.phase, clock: t.game.clock, entering: t.world.enteringRoom })));
    };
    t.setManualClock(false);
  }));
  expect(arrival.entering).toBe(false); expect(arrival.phase).toBe('playing');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.clock)).toBeGreaterThan(0);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
});

test('reduced motion starts directly in the wider main view and free play keeps its own camera', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page); await tap(page, 'start');
  expect(await page.evaluate(() => ({ entering: window.__CATSLAVE_TEST__.world.enteringRoom, zoom: window.__CATSLAVE_TEST__.world.camera.zoom })))
    .toEqual({ entering: false, zoom: 1 });
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    t.game.restoreFreePlay(['Choco', 'Latte', 'Yelo', 'Miller', 'Momo']); t.game.phase = 'title'; t.refresh();
  });
  await tap(page, 'free-play');
  expect(await page.evaluate(() => ({ entering: window.__CATSLAVE_TEST__.world.enteringRoom, zoom: window.__CATSLAVE_TEST__.world.camera.zoom })))
    .toEqual({ entering: false, zoom: 1.65 });
});
