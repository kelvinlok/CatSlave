import { expect, test } from '@playwright/test';

test('cats use the tree, hideout and existing furnishings in the rendered room', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  for (const id of ['tree', 'box', 'window', 'cabinet', 'sun', 'rug', 'bench', 'bed', 'post']) {
    const result = await page.evaluate(id => {
      const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset();
      t.game.phase = 'tutorial'; t.game.events = []; t.game.tutorialDone = false;
      const cat = t.game.cats[0]; cat.nextNeedAt = Infinity;
      t.game.visitFurniture(cat.id, id);
      for (let i = 0; i < 800 && cat.visit?.phase !== 'use'; i++) t.game.tick(0.05);
      // Let the cat settle into its facing without starting the departure.
      t.game.tick(0.6); t.game.phase = 'playing'; t.refresh();
      t.world.focusOn(t.world.catPosition(cat.id)!); t.refresh();
      return { phase: cat.visit?.phase, activity: cat.activity, elevation: cat.elevation,
        screen: t.world.project(t.world.catPosition(cat.id)!) };
    }, id);
    expect(result.phase).toBe('use');
    expect(result.screen.visible).toBe(true);
    expect(result.screen.x).toBeGreaterThan(0); expect(result.screen.x).toBeLessThan(page.viewportSize()!.width);
    expect(result.screen.y).toBeGreaterThan(0); expect(result.screen.y).toBeLessThan(page.viewportSize()!.height);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    if (['tree', 'box', 'window', 'bench', 'post'].includes(id)) await page.screenshot({ path: `artifacts/furniture-${id}-${info.project.name}.png` });
  }
  expect(errors).toEqual([]);
});
