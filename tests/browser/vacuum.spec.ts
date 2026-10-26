import { test, expect, type Page } from '@playwright/test';
import type { GameAudio } from '../../src/sound';

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
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.vacuumUnlockVisible)).toBe(true);
  expect(await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; return { unlocked: t.game.vacuumUnlocked, remaining: t.game.upgradesRemaining,
      rows: t.hud.hits.filter(h => h.id.startsWith('upgrade:')).map(h => h.id) };
  })).toEqual({ unlocked: true, remaining: 1, rows: ['upgrade:vacuum', 'upgrade:food', 'upgrade:toy'] });
  await page.screenshot({ path: `artifacts/vacuum/unlocked-${info.project.name}.png` });
  await tap(page, 'upgrade:vacuum');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.upgradesRemaining)).toBe(1);
  await tap(page, 'upgrade:food');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.vacuumUnlockVisible)).toBe(true);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.filter(h => h.id.startsWith('tool:')).map(h => h.id)))
    .toEqual(['tool:vacuum', 'tool:food', 'tool:toy']);
  // Let the new stage's camera reset finish before positioning fixture targets.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
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
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.events.length), kind).toBe(cleaning ? 0 : 1);
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

for (const [layout, width, height, safeTop, safeBottom] of [
  ['short', 320, 480, 0, 0], ['safe', 390, 844, 47, 34], ['desktop', 1280, 800, 0, 0],
] as const) {
  test(`vacuum hint and unlock animation fit the ${layout} layout`, async ({ browser, baseURL }, info) => {
    const context = await browser.newContext({ viewport: { width, height }, baseURL, hasTouch: width < 700 });
    await context.addInitScript(() => localStorage.setItem('catslave-language', 'en'));
    const page = await context.newPage();
    await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    const before = await page.evaluate(({ safeTop, safeBottom }) => {
      const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset();
      t.hud.resize(t.hud.width, t.hud.height, safeTop, safeBottom);
      Object.assign(t.game.levels, { sweeper: 3, mop: 3, brush: 2 });
      t.game.phase = 'upgrade'; t.game.upgradesRemaining = 1;
      const labels: string[] = [], original = t.hud.ctx.fillText;
      t.hud.ctx.fillText = function(value, x, y, maxWidth) { labels.push(value); original.call(this, value, x, y, maxWidth); };
      t.refresh(); t.hud.ctx.fillText = original;
      return { labels, hits: t.hud.hits, bottom: t.hud.height - t.hud.bottom };
    }, { safeTop, safeBottom });
    expect(before.labels).toContain('Sweeper + Mop + Brush → Vacuum');
    expect(before.labels).toContain('Get each to level 3 · 2/3 ready');
    for (const hit of before.hits) {
      expect(hit.h).toBeGreaterThanOrEqual(44);
      expect(hit.y + hit.h).toBeLessThan(before.bottom);
    }
    await page.screenshot({ path: `artifacts/vacuum/hint-${layout}-${info.project.name}.png` });
    await tap(page, 'upgrade:brush');
    expect(await page.evaluate(() => ({ phase: window.__CATSLAVE_TEST__.game.phase,
      visible: window.__CATSLAVE_TEST__.hud.vacuumUnlockVisible }))).toEqual({ phase: 'playing', visible: true });
    await page.screenshot({ path: `artifacts/vacuum/merge-${layout}-${info.project.name}.png` });
    await page.waitForTimeout(650);
    await page.screenshot({ path: `artifacts/vacuum/celebration-${layout}-${info.project.name}.png` });
    await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.vacuumUnlockVisible), { timeout: 5000 }).toBe(false);
    await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.reset(); t.refresh(); });
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.vacuumUnlockVisible)).toBe(false);
    await context.close();
  });
}

test('vacuum feedback survives a crowded mix and rapid successive cleanups', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Windows WebKit has no Web Audio.');
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  await tap(page, 'start');
  await expect.poll(() => page.evaluate(() => (window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio }).audio.diagnostics.loaded)).toBe(5);
  const result = await page.evaluate(async () => {
    const { audio } = window.__CATSLAVE_TEST__ as typeof window.__CATSLAVE_TEST__ & { audio: GameAudio };
    for (let i = 0; i < 12; i++) audio.play('mop', undefined, `crowd:${i}`);
    const crowded = audio.diagnostics.voices;
    audio.play('vacuum');
    const first = audio.diagnostics.counts.vacuum;
    await new Promise(resolve => setTimeout(resolve, 160));
    audio.play('vacuum');
    return { crowded, first, second: audio.diagnostics.counts.vacuum, voices: audio.diagnostics.voices };
  });
  expect(result.crowded).toBe(12); expect(result.first).toBe(1); expect(result.second).toBe(2);
  expect(result.voices).toBeLessThanOrEqual(12);
});
