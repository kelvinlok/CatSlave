import { expect, test } from '@playwright/test';
import type { Game } from '../../src/simulation';
import type { Hud } from '../../src/hud';
import type { World } from '../../src/world';

type Runtime = { game: Game; hud: Hud; world: World; setManualClock(value: boolean): void; refresh(): void; stats(): { fps: number; calls: number; triangles: number; textures: number; geometries: number } };

test('centers a portrait canvas on desktop and maps clicks into it', async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false, baseURL });
  try {
    const page = await context.newPage(); await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    const target = await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset(true); t.refresh();
      const r = document.querySelector('canvas')!.getBoundingClientRect(), hit = t.hud.hits.find(h => h.id === 'tool:food')!;
      return { x: r.left + hit.x + hit.w / 2, y: r.top + hit.y + hit.h / 2, left: r.left, w: r.width, h: r.height, rotate: t.hud.rotateRequired };
    });
    expect(target.rotate).toBe(false); expect(target.w).toBeLessThan(target.h); expect(target.left * 2 + target.w).toBe(1280);
    await page.mouse.click(target.x, target.y);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selected)).toBe('food');
    await page.screenshot({ path: `test-results/portrait-desktop-${info.project.name}.png` });
  } finally { await context.close(); }
});

test('uses the visible viewport and offsets touch input when browser chrome reduces the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset(true);
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: { width: 350, height: 600, offsetLeft: 22, offsetTop: 12 } });
    window.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.height)).toBe(600);
  const target = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, rect = document.querySelector('canvas')!.getBoundingClientRect();
    const hit = t.hud.hits.find(h => h.id === 'tool:food')!;
    return { x: rect.left + hit.x + hit.w / 2, y: rect.top + hit.y + hit.h / 2, width: rect.width, height: rect.height, left: rect.left, top: rect.top };
  });
  expect(target.width).toBe(350); expect(target.height).toBe(600); expect(target.left).toBe(22); expect(target.top).toBe(12);
  await page.touchscreen.tap(target.x, target.y);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selected)).toBe('food');
});

test('keeps controls in bounds, care targets separate, and resources bounded', async ({ page, browserName }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  for (const viewport of [{ width: 320, height: 480 }, { width: 390, height: 664 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.width)).toBe(viewport.width);
    // Playwright #42885: Windows WebKit 1.64 paints resized WebGL canvases blank.
    // Reload only for static layout screenshots; the separate resize test does not reload.
    if (browserName === 'webkit') {
      await page.reload(); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
      await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
    }
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__; t.game.reset(true); t.refresh();
    });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const hits = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits);
    for (const h of hits) {
      expect(h.x, h.id).toBeGreaterThanOrEqual(0); expect(h.y, h.id).toBeGreaterThanOrEqual(0);
      expect(h.x + h.w, h.id).toBeLessThanOrEqual(viewport.width + 0.1); expect(h.y + h.h, h.id).toBeLessThanOrEqual(viewport.height + 0.1);
      expect(h.w, h.id).toBeGreaterThanOrEqual(48); expect(h.h, h.id).toBeGreaterThanOrEqual(48);
    }
    const room = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.layout.room);
    const controls = hits.filter(hit => hit.id === 'pause' || hit.id.startsWith('tool:') || hit.id.startsWith('view:'));
    for (const control of controls) expect(control.x + control.w <= room.x || control.x >= room.x + room.w || control.y + control.h <= room.y || control.y >= room.y + room.h).toBe(true);
    await page.screenshot({ path: `test-results/layout-${viewport.width}x${viewport.height}-${info.project.name}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.width)).toBe(390);
  if (browserName === 'webkit') {
    await page.reload(); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  }
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.reset();
    for (const tool of ['sweeper', 'mop', 'brush', 'food'] as const) {
      t.game.cats.forEach(c => { c.nextNeedAt = Infinity; }); t.game.tick(t.game.timeLeft); t.finishBonus();
      t.game.adopt(t.game.candidates[0].id); t.game.upgrade(tool); t.game.upgrade(tool);
    }
    t.game.cats.forEach((cat, i) => t.game.spawn(cat, (['poop', 'vomit', 'fur', 'hunger', 'boredom'] as const)[i])); t.game.tick(2); t.refresh();
  });
  await page.waitForTimeout(1200);
  const cards = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.filter(h => h.id.startsWith('event:') || h.id.startsWith('focus:')));
  expect(cards).toHaveLength(5);
  for (const card of cards) { expect(card.x).toBeGreaterThanOrEqual(0); expect(card.x + card.w).toBeLessThanOrEqual(390); }
  await page.screenshot({ path: `test-results/five-cats-${info.project.name}.png` });
  // FPS here characterizes this emulated desktop runtime, never a real phone.
  const stats = [];
  for (let i = 0; i < 3; i++) { await page.waitForTimeout(1100); stats.push(await page.evaluate(() => window.__CATSLAVE_TEST__.stats())); }
  console.log(`${info.project.name} five-cat runtime: ${JSON.stringify(stats)}`);
  const before = await page.evaluate(() => (window.__CATSLAVE_TEST__ as unknown as Runtime).stats());
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.reset(true); t.refresh(); });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  const after = await page.evaluate(() => (window.__CATSLAVE_TEST__ as unknown as Runtime).stats());
  expect(after.textures).toBeLessThanOrEqual(before.textures + 1);
  expect(after.geometries).toBeLessThanOrEqual(before.geometries + 1);
  expect(errors).toEqual([]);
});

test('cancels gestures on resize and pauses for WebGL context recovery', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset(true); t.refresh();
  });
  const hit = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id.startsWith('event:'))!);
  await page.mouse.move(hit.x + 20, hit.y + hit.h / 2); await page.mouse.down();
  await page.mouse.move(hit.x + 50, hit.y + hit.h / 2);
  const progress = await page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0].progress);
  expect(progress).toBeGreaterThan(0);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.width)).toBe(320);
  await page.mouse.move(400, 210); await page.mouse.up();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0].progress)).toBe(progress);
  const supported = await page.evaluate(() => {
    const gl = (document.querySelector('canvas') as HTMLCanvasElement).getContext('webgl2')!;
    const extension = gl.getExtension('WEBGL_lose_context');
    if (!extension) return false;
    extension.loseContext(); setTimeout(() => extension.restoreContext(), 250); return true;
  });
  test.skip(!supported, 'The browser does not expose the WebGL context-loss testing extension.');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('paused');
  await page.waitForTimeout(700);
  const resume = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'resume')!);
  await page.touchscreen.tap(resume.x + resume.w / 2, resume.y + resume.h / 2);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('tutorial');
});
