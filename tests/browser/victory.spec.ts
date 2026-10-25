import { expect, test } from '@playwright/test';

test('victory welcomes the full household and keeps both exits usable on every layout', async ({ browser, baseURL }, info) => {
  test.setTimeout(180_000);
  for (const [name, width, height, safeTop, safeBottom] of [
    ['short', 320, 480, 0, 0], ['safe', 390, 844, 47, 34], ['desktop', 1280, 800, 0, 0],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height }, baseURL, hasTouch: width < 700 });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    await page.evaluate(({ safeTop, safeBottom }) => {
      const t = window.__CATSLAVE_TEST__, g = t.game; t.setManualClock(true); g.reset();
      t.hud.resize(t.hud.width, t.hud.height, safeTop, safeBottom);
      for (const tool of ['sweeper', 'mop', 'brush', 'food'] as const) {
        g.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); g.tick(g.timeLeft); t.finishBonus();
        g.adopt(g.candidates[0].id); g.upgrade(tool); g.upgrade(tool);
      }
      g.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); g.tick(g.timeLeft); t.refresh();
    }, { safeTop, safeBottom });
    await expect.poll(() => page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__;
      return t.world.scene.getObjectByName(`preview-cat-${t.game.cats[t.game.cats.length - 1].id}`)?.position.z;
    })).toBeCloseTo(4.1, 4);
    const layout = await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__, v = t.world.viewport;
      return { phase: t.game.phase, hearts: t.world.victoryHearts(), v, hits: t.hud.hits,
        size: { w: t.hud.width, h: t.hud.height },
        cats: t.game.cats.map(cat => {
          const model = t.world.scene.getObjectByName(`preview-cat-${cat.id}`)!;
          const head = model.getObjectByName('head')!;
          const edges = [-0.4, 0.4].map(x => t.world.project(head.localToWorld(head.position.clone().set(x, 0.2, 0.3))).x);
          return { happy: model.getObjectByName('closedEye0')!.visible && model.getObjectByName('closedEye1')!.visible, edges };
        }) };
    });
    expect(layout.phase).toBe('victory'); expect(layout.cats).toHaveLength(5);
    expect(layout.cats.every(cat => cat.happy)).toBe(true);
    for (const cat of layout.cats) for (const x of cat.edges) {
      expect(x).toBeGreaterThan(layout.v.x + 2);
      expect(x).toBeLessThan(layout.v.x + layout.v.w - 2);
    }
    for (const point of layout.hearts) {
      expect(point.visible).toBe(true);
      expect(point.x).toBeGreaterThan(layout.v.x + 15);
      expect(point.x).toBeLessThan(layout.v.x + layout.v.w - 15);
      expect(point.y).toBeGreaterThan(layout.v.y + 10);
      expect(point.y).toBeLessThan(layout.v.y + layout.v.h - 30);
    }
    for (const hit of layout.hits) {
      expect(hit.y).toBeGreaterThanOrEqual(safeTop);
      expect(hit.y + hit.h).toBeLessThanOrEqual(layout.size.h - safeBottom);
      expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({ path: `artifacts/victory/${name}-${info.project.name}.png` });
    const exit = name === 'safe' ? 'home' : 'restart';
    const point = await page.evaluate(exit => {
      const hit = window.__CATSLAVE_TEST__.hud.hits.find(hit => hit.id === exit)!;
      const bounds = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: bounds.left + hit.x + hit.w / 2, y: bounds.top + hit.y + hit.h / 2 };
    }, exit);
    if (width < 700) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe(exit === 'home' ? 'title' : 'playing');
    expect(await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__;
      return { camera: t.world.camera.position.toArray(), zoom: t.world.camera.zoom, hearts: t.world.victoryHearts().length };
    })).toEqual({ camera: [0, 1.65, 5.8], zoom: 1.65, hearts: 0 });
    expect(errors).toEqual([]); await context.close();
  }
});
