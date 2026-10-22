import { test, expect, type Page } from '@playwright/test';
import type { Game } from '../../src/simulation';
import type { World } from '../../src/world';
import type { Hud } from '../../src/hud';

declare global { interface Window { __CATSLAVE_TEST__: { game: Game; world: World; hud: Hud; refresh(effectsDt?: number): void; setManualClock(value: boolean): void; stats(): object; }; } }
type Hit = { x: number; y: number; w: number; h: number; id: string; eventId?: number };
async function hit(page: Page, id: string): Promise<Hit> {
  await expect.poll(() => page.evaluate(id => !!window.__CATSLAVE_TEST__?.hud.hits.find(h => h.id === id), id)).toBe(true);
  return page.evaluate(id => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id)!, id);
}
async function tap(page: Page, id: string) {
  const h = await hit(page, id); await page.touchscreen.tap(h.x + h.w / 2, h.y + h.h / 2);
}
async function state(page: Page) { return page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; return { phase: g.phase, hp: g.hp, stage: g.stage, count: g.cats.length, completed: g.completed, clock: g.clock, selected: g.selected, events: g.events.map(e => ({ ...e })), survived: g.stagesSurvived }; }); }
async function stroke(page: Page, h: Hit, turns = 4, duration = 0) {
  const y = h.y + h.h * 0.6, left = h.x + 20, right = h.x + h.w - 20;
  await page.mouse.move(left, y); await page.mouse.down();
  for (let i = 0; i < turns; i++) {
    for (let n = 1; n <= 4; n++) {
      const a = n / 4, x = i % 2 ? right + (left - right) * a : left + (right - left) * a;
      await page.mouse.move(x, y + Math.sin(a * Math.PI) * 6);
      if (duration) await page.waitForTimeout(duration / turns / 4);
    }
  }
  await page.mouse.up();
}
async function care(page: Page) {
  const event = (await state(page)).events[0]; if (!event) return;
  const tools = { poop: 'sweeper', vomit: 'mop', fur: 'brush', hunger: 'food', boredom: 'toy' };
  const tool = tools[event.kind];
  await page.evaluate(id => { const t = window.__CATSLAVE_TEST__; const e = t.game.events.find(e => e.id === id)!; t.refresh(); }, event.id);
  await tap(page, `tool:${tool}`);
  const h = await hit(page, `event:${event.id}`);
  if (tool === 'food') for (let i = 0; i < 4; i++) { if ((await state(page)).events.some(e => e.id === event.id)) await page.touchscreen.tap(h.x + h.w / 2, h.y + h.h * 0.6); }
  else await stroke(page, h, 12, tool === 'toy' ? 2600 : 0);
  await expect.poll(async () => {
    const current = await state(page);
    return current.events.some(e => e.id === event.id) ? JSON.stringify(current) : 'complete';
  }).toBe('complete');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
});

test('renders only a canvas and completes all five tutorial gestures', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  expect(await page.locator('button, input, select').count()).toBe(0);
  await page.screenshot({ path: `test-results/title-${info.project.name}.png` });
  await tap(page, 'learn');
  for (let i = 0; i < 5; i++) {
    await expect.poll(async () => (await state(page)).phase).toBe('tutorial');
    if (i === 0) {
      const e = (await state(page)).events[0]; const h = await hit(page, `event:${e.id}`);
      await tap(page, 'tool:food');
      await page.touchscreen.tap(h.x + h.w / 2, h.y + h.h * 0.6);
      expect((await state(page)).events[0].progress).toBe(0);
      await page.screenshot({ path: `test-results/tutorial-${info.project.name}.png` });
    }
    await care(page); await tap(page, 'tutorial-next');
  }
  expect((await state(page)).phase).toBe('playing'); expect((await state(page)).completed).toBe(0);
  expect(errors).toEqual([]);
});

test('plays an accelerated five-stage run through real care, adoption, and upgrade UI', async ({ page }, info) => {
  test.setTimeout(300_000); // Real pointer strokes on software-rendered mobile browsers.
  await tap(page, 'start');
  const upgradeOrder = ['sweeper', 'mop', 'brush', 'food'];
  for (let stage = 0; stage < 5; stage++) {
    // The fixture advances simulation time; all care, adoption and upgrades use actual input.
    for (let tick = 0; tick < 2; tick++) {
      await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.tick(6); t.refresh(); });
      while ((await state(page)).events.length && (await state(page)).phase === 'playing') await care(page);
    }
    await page.screenshot({ path: `test-results/stage-${stage + 1}-${info.project.name}.png` });
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__; const remaining = t.game.timeLeft;
      // Safe end-of-shift time jump: the already-tested scheduler is suppressed here.
      t.game.cats.forEach(c => { c.nextNeedAt = t.game.clock + remaining + 1; });
      t.game.tick(remaining); t.refresh();
    });
    if (stage < 4) {
      expect((await state(page)).phase).toBe('adoption');
      if (stage === 0) await page.screenshot({ path: `test-results/adoption-${info.project.name}.png` });
      const id = await page.evaluate(() => window.__CATSLAVE_TEST__.game.candidates[0].id);
      await tap(page, `adopt:${id}`);
      if (stage === 0) await page.screenshot({ path: `test-results/upgrade-${info.project.name}.png` });
      await tap(page, `upgrade:${upgradeOrder[stage]}`);
      expect((await state(page)).count).toBe(stage + 2);
    }
  }
  expect((await state(page)).phase).toBe('victory'); expect((await state(page)).survived).toBe(5);
  await page.screenshot({ path: `test-results/victory-${info.project.name}.png` });
  await tap(page, 'restart'); expect((await state(page)).count).toBe(1); expect((await state(page)).hp).toBe(100);
});

test('keeps a fixed room view, retains work, pauses, resizes, and loses a run', async ({ page }, info) => {
  await tap(page, 'learn');
  const event = (await state(page)).events[0], h = await hit(page, `event:${event.id}`);
  await stroke(page, h, 1); const partial = (await state(page)).events[0].progress;
  expect(partial).toBeGreaterThan(0); expect(partial).toBeLessThan(1);
  const camera = await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.quaternion.toArray());
  const viewport = page.viewportSize()!;
  await page.mouse.move(8, viewport.height * 0.35); await page.mouse.down();
  await page.mouse.move(150, viewport.height * 0.35, { steps: 8 }); await page.mouse.up();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.camera.quaternion.toArray())).toEqual(camera);
  expect((await state(page)).events[0].progress).toBe(partial);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.some(h => h.id === 'left' || h.id === 'right'))).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const clock = (await state(page)).clock; await page.waitForTimeout(150);
  expect((await state(page)).phase).toBe('paused'); expect((await state(page)).clock).toBe(clock);
  await tap(page, 'resume'); expect((await state(page)).phase).toBe('tutorial');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.width)).toBe(844);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: `test-results/landscape-${info.project.name}.png` });
  await tap(page, 'pause'); await tap(page, 'restart');
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.hp = 10; t.game.spawn(t.game.cats[0], 'poop');
    t.game.events[0].deadline = t.game.clock; t.game.events[0].nextAttackAt = t.game.clock + 1; t.game.tick(1); t.refresh();
  });
  expect((await state(page)).phase).toBe('game-over');
  await page.screenshot({ path: `test-results/game-over-${info.project.name}.png` });
  await tap(page, 'restart'); expect((await state(page)).hp).toBe(100);
});
