import { test, expect, type Page } from '@playwright/test';

async function tap(page: Page, id: string) {
  const p = await page.evaluate(id => {
    const h = window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id)!;
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2 };
  }, id);
  await page.mouse.click(p.x, p.y);
}

test('final cleaning upgrade replaces tools and one click cleans each mess', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset();
    Object.assign(t.game.levels, { sweeper: 3, mop: 3, brush: 2 });
    t.game.phase = 'upgrade'; t.game.upgradesRemaining = 2; t.refresh();
  });
  await tap(page, 'upgrade:brush');
  expect(await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; return { unlocked: t.game.vacuumUnlocked, remaining: t.game.upgradesRemaining,
      rows: t.hud.hits.filter(h => h.id.startsWith('upgrade:')).map(h => h.id) };
  })).toEqual({ unlocked: true, remaining: 1, rows: ['upgrade:vacuum', 'upgrade:food', 'upgrade:toy'] });
  await page.screenshot({ path: `artifacts/vacuum/unlocked-${info.project.name}.png` });
  await tap(page, 'upgrade:vacuum');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.upgradesRemaining)).toBe(1);
  await tap(page, 'upgrade:food');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.filter(h => h.id.startsWith('tool:')).map(h => h.id)))
    .toEqual(['tool:vacuum', 'tool:food', 'tool:toy']);
  for (const kind of ['poop', 'vomit', 'fur', 'hunger', 'boredom'] as const) {
    const p = await page.evaluate(kind => {
      const t = window.__CATSLAVE_TEST__; t.game.events = [];
      const cat = t.game.cats[0]; cat.position = { x: 0, z: 0 }; cat.visit = undefined;
      t.game.spawn(cat, kind); t.game.select('vacuum'); t.refresh();
      t.world.focusOn(t.world.eventPosition(t.game.events[0])); t.refresh();
      const event = t.game.events[0], h = t.hud.hits.find(h => h.id === `event:${event.id}`)!;
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      return { id: event.id, tool: h.tool, x: r.left + (h.arch?.x ?? h.x + h.w / 2),
        y: r.top + (h.arch ? h.arch.y - (h.arch.outerY + h.arch.innerY) / 2 : h.y + h.h / 2) };
    }, kind);
    const cleaning = ['poop', 'vomit', 'fur'].includes(kind);
    if (cleaning) expect(p.tool).toBe('vacuum');
    if (kind === 'poop') {
      await page.screenshot({ path: `artifacts/vacuum/tray-${info.project.name}.png` });
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(100);
      expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0].progress)).toBe(0);
      await page.mouse.move(5, 100); await page.mouse.up();
      expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events)).toHaveLength(1);
    }
    await page.mouse.click(p.x, p.y);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events.length)).toBe(cleaning ? 0 : 1);
    if (!cleaning) expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events[0].progress)).toBe(0);
  }
  for (const [key, expected] of [['2', 'food'], ['3', 'toy'], ['1', 'vacuum'], ['5', 'vacuum']]) {
    await page.keyboard.press(key); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selected)).toBe(expected);
  }
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.reset(); t.refresh(); });
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.filter(h => h.id.startsWith('tool:')).map(h => h.id)))
    .toEqual(['tool:sweeper', 'tool:mop', 'tool:brush', 'tool:food', 'tool:toy']);
  expect(errors).toEqual([]);
});
