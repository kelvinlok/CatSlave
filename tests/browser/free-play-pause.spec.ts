import { expect, test, type Page } from '@playwright/test';

async function tap(page: Page, id: string) {
  const hit = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!, id);
  await page.touchscreen.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
}

async function stallFrame(page: Page) {
  return page.evaluate(() => new Promise<{ phase: string; reason: string; elapsed: number }>(resolve => {
    requestAnimationFrame(() => {
      const game = window.__CATSLAVE_TEST__.game, before = game.clock;
      // Simulate synchronous model setup / shader compilation with the live clock.
      const until = performance.now() + 1100;
      while (performance.now() < until) { /* Block one frame. */ }
      requestAnimationFrame(() => resolve({ phase: game.phase, reason: game.pauseReason, elapsed: game.clock - before }));
    });
  }));
}

test('free play stays live through entry and loading stalls, but still supports pause', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('catslave-free-play', JSON.stringify(['Choco', 'Latte', 'Yelo', 'Miller', 'Momo'])));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    // Run after the entry action, before its first animation frame.
    document.querySelector('canvas')!.addEventListener('pointerup', () => {
      const until = performance.now() + 1100;
      while (performance.now() < until) { /* Simulate expensive entry setup. */ }
    }, { once: true });
  });
  await tap(page, 'free-play');
  const entry = await stallFrame(page);
  expect(entry.phase, entry.reason).toBe('free-play');
  expect(entry.elapsed).toBeGreaterThan(0);
  expect(entry.elapsed).toBeLessThanOrEqual(0.101);
  await tap(page, 'pause');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('paused');
  await tap(page, 'resume');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('paused');
  expect(errors).toEqual([]);
});

test('timed play still pauses after a long frame', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.reset(); t.refresh(); });
  const stalled = await stallFrame(page);
  expect(stalled.phase).toBe('paused');
  expect(stalled.reason).toBe('A little interruption. Ready to continue?');
  expect(stalled.elapsed).toBe(0);
});
