import { expect, test, type Page } from '@playwright/test';

async function tap(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.some(h => h.id === id), id)).toBe(true);
  const p = await page.evaluate(id => {
    const h = window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id)!;
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2 };
  }, id);
  await page.mouse.click(p.x, p.y);
}
async function phase(page: Page) { return page.evaluate(() => window.__CATSLAVE_TEST__.game.phase); }

test.beforeEach(async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
});

test('pause, help, confirmations, tutorial replay and main menu have working return paths', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await tap(page, 'learn');
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.events[0].progress = 0.4; t.refresh(); });
  await tap(page, 'pause'); await tap(page, 'help');
  expect(await phase(page)).toBe('paused');
  await page.screenshot({ path: `artifacts/ui-review/help-${info.project.name}.png` });
  await tap(page, 'back'); await tap(page, 'restart');
  expect(await phase(page)).toBe('paused');
  await tap(page, 'back'); await tap(page, 'resume');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0].progress)).toBe(0.4);
  await tap(page, 'pause'); await tap(page, 'restart'); await tap(page, 'confirm-restart');
  expect(await phase(page)).toBe('tutorial');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0].progress)).toBe(0);
  await tap(page, 'pause'); await tap(page, 'home');
  await page.keyboard.press('Escape');
  expect(await phase(page)).toBe('paused');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.modal)).toBeUndefined();
  await tap(page, 'home'); await tap(page, 'confirm-home'); expect(await phase(page)).toBe('title');
  await tap(page, 'start'); expect(await phase(page)).toBe('playing');
  await tap(page, 'pause'); await tap(page, 'restart'); await tap(page, 'confirm-restart');
  expect(await phase(page)).toBe('playing');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.stage)).toBe(0);
  expect(errors).toEqual([]);
});

test('keyboard focus, hover, pressed, drag-off and pointer cancellation behave consistently', async ({ page }, info) => {
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.focusedId)).toBe('start');
  await page.screenshot({ path: `artifacts/ui-review/keyboard-${info.project.name}.png` });
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); expect(await phase(page)).toBe('tutorial');
  await page.keyboard.press('Escape'); await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.focusedId)).toBe('resume');
  await page.keyboard.press('Tab'); await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.modal)).toBe('help');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); expect(await phase(page)).toBe('tutorial');
  const hit = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'tool:food')!);
  await page.mouse.move(hit.x + 25, hit.y + 25); await page.mouse.down();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.pressedId)).toBe('tool:food');
  await page.mouse.move(hit.x + 25, hit.y - 25); await page.mouse.up();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selected)).toBe('sweeper');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.pressedId)).toBeUndefined();
  await page.mouse.move(hit.x + 25, hit.y + 25); await page.mouse.down();
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!;
    canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
  });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selected)).toBe('sweeper');
  await tap(page, 'tool:food'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selected)).toBe('food');
});

test('zoom limits and max-level upgrades are visibly disabled and cannot advance', async ({ page }) => {
  await tap(page, 'start');
  for (let i = 0; i < 5; i++) await tap(page, 'view:in');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewZoom)).toBe(2.5);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'view:in')!.disabled)).toBe(true);
  await tap(page, 'view:reset');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.viewZoom)).toBe(1.65);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.events = []; t.game.cats.forEach(c => c.nextNeedAt = Infinity);
    t.game.tick(t.game.timeLeft); t.finishBonus(); t.game.adopt(t.game.candidates[0].id); t.game.levels.sweeper = 3; t.refresh();
  });
  const disabled = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'upgrade:sweeper')!);
  expect(disabled.disabled).toBe(true);
  await page.mouse.click(disabled.x + disabled.w / 2, disabled.y + disabled.h / 2);
  expect(await phase(page)).toBe('upgrade');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.upgradesRemaining)).toBe(2);
  await tap(page, 'upgrade:mop'); expect(await phase(page)).toBe('upgrade');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.upgradesRemaining)).toBe(1);
  await tap(page, 'upgrade:toy'); expect(await phase(page)).toBe('playing');
});

test('both endings return home and a new shift starts with fresh progress', async ({ page }) => {
  for (const ending of ['game-over', 'victory'] as const) {
    await page.evaluate(ending => {
      const t = window.__CATSLAVE_TEST__; t.game.reset(); t.game.phase = ending;
      t.game.hp = 10; t.game.completed = 27; t.game.levels.food = 3; t.refresh();
    }, ending);
    await tap(page, 'home'); expect(await phase(page)).toBe('title');
    await tap(page, 'start');
    expect(await page.evaluate(() => {
      const g = window.__CATSLAVE_TEST__.game;
      return { phase: g.phase, hp: g.hp, completed: g.completed, food: g.levels.food, cats: g.cats.length };
    })).toEqual({ phase: 'playing', hp: 100, completed: 0, food: 1, cats: 1 });
  }
});

test('all menu states fit short phones, safe areas and desktop without overlapping controls', async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  for (const [name, width, height, touch, safeTop, safeBottom] of [
    ['small', 320, 480, true, 0, 0], ['safe', 390, 844, true, 47, 34], ['desktop', 1280, 800, false, 0, 0],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, baseURL });
    const page = await context.newPage(); await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    await page.evaluate(({ safeTop, safeBottom }) => {
      const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
      t.hud.resize(t.hud.width, t.hud.height, safeTop, safeBottom); t.world.resize(t.hud.width, t.hud.height, t.hud.layout.room);
    }, { safeTop, safeBottom });
    for (const state of ['title', 'tutorial', 'paused', 'help', 'restart', 'adoption', 'upgrade', 'game-over', 'victory'] as const) {
      const data = await page.evaluate(state => {
        const t = window.__CATSLAVE_TEST__, g = t.game;
        if (state === 'title') g.phase = 'title';
        else if (state === 'tutorial') g.reset(true);
        else if (state === 'paused') g.pause('The room waited while you were away.');
        else if (state === 'help' || state === 'restart') t.hud.modal = state;
        else if (state === 'adoption') { g.reset(); g.cats.forEach(c => c.nextNeedAt = Infinity); g.tick(g.timeLeft); t.finishBonus(); }
        else if (state === 'upgrade') g.adopt(g.candidates[0].id);
        else g.phase = state;
        // Inspect actual rendered text extents, rather than asserting only hitboxes.
        const overflow: string[] = [], ctx = t.hud.ctx, original = ctx.fillText;
        ctx.fillText = function(value, x, y, ...rest) {
          const w = this.measureText(value).width;
          const left = x - (this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' ? w : 0);
          if (left < -0.5 || left + w > t.hud.width + 0.5 || y < 0 || y > t.hud.height) overflow.push(value);
          original.call(this, value, x, y, ...rest);
        };
        try { t.refresh(); } finally { ctx.fillText = original; }
        return { hits: t.hud.hits.filter(h => h.eventId === undefined), width: t.hud.width, height: t.hud.height, overflow };
      }, state);
      expect(data.overflow, `${name}/${state} text`).toEqual([]);
      for (const hit of data.hits) {
        expect(hit.x, `${name}/${state}/${hit.id}`).toBeGreaterThanOrEqual(0);
        expect(hit.y).toBeGreaterThanOrEqual(safeTop);
        expect(hit.x + hit.w).toBeLessThanOrEqual(data.width);
        expect(hit.y + hit.h).toBeLessThanOrEqual(data.height - safeBottom);
        expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44);
      }
      for (let i = 0; i < data.hits.length; i++) for (let j = i + 1; j < data.hits.length; j++) {
        const a = data.hits[i], b = data.hits[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap, `${name}/${state}: ${a.id} overlaps ${b.id}`).toBe(false);
      }
      await page.screenshot({ path: `artifacts/ui-review/${name}-${state}-${info.project.name}.png` });
    }
    await context.close();
  }
});
