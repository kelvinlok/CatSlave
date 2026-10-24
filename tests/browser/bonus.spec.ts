import { expect, test, type Page } from '@playwright/test';

async function tap(page: Page, id: string) {
  const point = await page.evaluate(id => {
    const h = window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === id)!;
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.left + h.x + h.w / 2, y: r.top + h.y + h.h / 2 };
  }, id);
  await page.mouse.click(point.x, point.y);
}
async function setup(page: Page, count: number) {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(count => {
    const t = window.__CATSLAVE_TEST__, g = t.game; t.setManualClock(true); g.reset();
    for (let i = 1; i < count; i++) {
      g.cats.forEach(c => c.nextNeedAt = Infinity); g.tick(g.timeLeft); t.finishBonus();
      g.adopt(g.candidates[0].id);
      while (g.phase === 'upgrade') g.upgrade(g.availableTools.find(tool => tool.id !== 'vacuum' && g.levels[tool.id] < 3)!.id);
    }
    g.cats.forEach(c => c.nextNeedAt = Infinity); g.tick(g.timeLeft); t.refresh();
  }, count);
}
async function tick(page: Page, seconds: number, effects = 0) {
  await page.evaluate(({ seconds, effects }) => { const t = window.__CATSLAVE_TEST__; t.game.tick(seconds); t.refresh(effects); }, { seconds, effects });
}

test('bonus: all adopted cats take real pats, hold does not repeat, and winning earns the second pick', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await setup(page, 4);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.candidates)).toHaveLength(0);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.upgradesRemaining)).toBe(1);
  await page.screenshot({ path: `artifacts/bonus/intro-four-${info.project.name}.png` });
  await tap(page, 'bonus-start'); await tick(page, 2.9);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status)).toBe('countdown');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.some(h => h.id.startsWith('pat:')))).toBe(false);
  await tick(page, 0.1);
  const ids = await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.catIds);
  const first = await page.evaluate(id => {
    const t = window.__CATSLAVE_TEST__, h = t.hud.hits.find(h => h.id === `pat:${id}`)!;
    return { x: h.x + h.w / 2, y: h.y + h.h / 2,
      body: t.world.scene.children.find(o => o.userData.catId === id)!.getObjectByName('body')!.position.y };
  }, ids[0]);
  await page.mouse.move(first.x, first.y); await page.mouse.down(); await tick(page, 0.3);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.pats)).toBe(1);
  expect(await page.evaluate(id => window.__CATSLAVE_TEST__.world.scene.children.find(o => o.userData.catId === id)!.getObjectByName('body')!.position.y, ids[0])).toBeGreaterThan(first.body);
  await page.mouse.up();
  await tap(page, 'pause'); await tick(page, 30);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.elapsed)).toBeCloseTo(0.3);
  await tap(page, 'resume');
  for (let round = 0; round < 5; round++) {
    for (const id of ids) await tap(page, `pat:${id}`);
    if (round === 4) {
      expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.timeLeft)).toBeLessThan(3);
      await page.screenshot({ path: `artifacts/bonus/urgent-four-${info.project.name}.png` });
    }
    await tick(page, 2);
  }
  expect(await page.evaluate(() => ({ won: window.__CATSLAVE_TEST__.game.bonus!.won, pats: window.__CATSLAVE_TEST__.game.bonus!.pats,
    picks: window.__CATSLAVE_TEST__.game.upgradesRemaining }))).toEqual({ won: true, pats: 21, picks: 2 });
  await page.screenshot({ path: `artifacts/bonus/won-${info.project.name}.png` });
  await tap(page, 'bonus-continue');
  const candidate = await page.evaluate(() => window.__CATSLAVE_TEST__.game.candidates[0].id);
  await tap(page, `adopt:${candidate}`); await tap(page, 'upgrade:food');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('upgrade');
  await tap(page, 'upgrade:food');
  expect(await page.evaluate(() => ({ phase: window.__CATSLAVE_TEST__.game.phase, cats: window.__CATSLAVE_TEST__.game.cats.length })))
    .toEqual({ phase: 'playing', cats: 5 });
  expect(errors).toEqual([]);
});

test('bonus: a neglected cat scratches before the losing round can return to adoption', async ({ page }, info) => {
  await setup(page, 2); await tap(page, 'bonus-start'); await tick(page, 3);
  const ids = await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.catIds);
  await tick(page, 2.9); await tap(page, `pat:${ids[0]}`); await tick(page, 0.1, 0.25);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.failedCatId)).toBe(ids[1]);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status)).toBe('scratch');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.some(h => h.id === 'bonus-continue'))).toBe(false);
  await page.screenshot({ path: `artifacts/bonus/scratch-${info.project.name}.png` });
  await tap(page, 'pause'); await tick(page, 20); await tap(page, 'resume');
  await tick(page, 1.1, 0.8);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status)).toBe('scratch');
  await tick(page, 0.1, 0.15);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.upgradesRemaining)).toBe(1);
  await tap(page, 'bonus-continue');
  const id = await page.evaluate(() => window.__CATSLAVE_TEST__.game.candidates[0].id);
  await tap(page, `adopt:${id}`); await tap(page, 'upgrade:mop');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('playing');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.hp)).toBe(100);
});

test('bonus: lineup and all tap targets fit short phones, safe areas and desktop', async ({ browser, baseURL }, info) => {
  for (const [name, width, height, touch, safeTop, safeBottom] of [
    ['small', 320, 480, true, 0, 0], ['safe', 390, 844, true, 47, 34], ['desktop', 1280, 800, false, 0, 0],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, baseURL });
    const page = await context.newPage(); await setup(page, 4);
    await page.evaluate(({ safeTop, safeBottom }) => {
      const t = window.__CATSLAVE_TEST__; t.hud.resize(t.hud.width, t.hud.height, safeTop, safeBottom); t.refresh();
    }, { safeTop, safeBottom });
    await tap(page, 'bonus-start'); await tick(page, 3);
    const data = await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__;
      return { width: t.hud.width, height: t.hud.height, hits: t.hud.hits.filter(h => h.id.startsWith('pat:')) };
    });
    expect(data.hits).toHaveLength(4);
    for (const h of data.hits) {
      expect(h.w).toBeGreaterThanOrEqual(44); expect(h.h).toBeGreaterThanOrEqual(44);
      expect(h.x).toBeGreaterThanOrEqual(0); expect(h.x + h.w).toBeLessThanOrEqual(data.width);
      expect(h.y).toBeGreaterThanOrEqual(safeTop); expect(h.y + h.h).toBeLessThanOrEqual(data.height - safeBottom);
    }
    for (let i = 1; i < data.hits.length; i++) expect(data.hits[i].x).toBeGreaterThan(data.hits[i - 1].x + data.hits[i - 1].w);
    for (const h of data.hits) await tap(page, h.id);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.pats)).toBe(4);
    await page.screenshot({ path: `artifacts/bonus/${name}-${info.project.name}.png` });
    await context.close();
  }
});

test('bonus: live countdown and patience freeze on blur and resume through the scratch animation', async ({ page }) => {
  await setup(page, 1); await tap(page, 'bonus-start');
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(false));
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status), { timeout: 15000 }).toBe('playing');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const clock = await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.clock);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('paused');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.clock)).toBe(clock);
  await tap(page, 'resume');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status), { timeout: 15000, intervals: [50] }).toBe('scratch');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.some(h => h.id === 'bonus-continue'))).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.bonus!.status), { timeout: 10000 }).toBe('result');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.attackAge)).toBeGreaterThanOrEqual(1.15);
  await tap(page, 'bonus-continue');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('adoption');
});
