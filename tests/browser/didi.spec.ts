import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('的的 joins the household and keeps his signature tongue in animated poses', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const folder = `artifacts/didi/${info.project.name}`; await mkdir(folder, { recursive: true });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  const cats = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, game = t.game;
    t.setManualClock(true); game.reset();
    for (const appearance of ['latte', 'didi']) {
      game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); t.finishBonus();
      game.adopt(game.candidates.find(cat => cat.appearance === appearance)!.id); for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
    }
    t.refresh(); return game.cats.map(cat => cat.name);
  });
  expect(cats).toEqual(['Choco', 'Latte', '的的']);
  await page.screenshot({ path: `${folder}/in-game.png` });
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  for (const [i, activity] of (['idle', 'walking', 'grooming', 'sleeping'] as const).entries()) {
    const attached = await page.evaluate(({ i, activity }) => {
      const s = window.__CAT_STUDIO__;
      s.pose(activity, 1 + i, 2); s.pose(activity, 1.4 + i, 2);
      return s.model.head.getObjectByName('tongue')?.parent === s.model.head;
    }, { i, activity });
    expect(attached).toBe(true);
    await page.screenshot({ path: `${folder}/${activity}.png` });
  }
  for (const variant of [0, 1, 3]) {
    expect(await page.evaluate(variant => {
      const s = window.__CAT_STUDIO__; s.pose('idle', 1, variant);
      return !!s.model.root.getObjectByName('tongue');
    }, variant)).toBe(false);
  }
  expect(errors).toEqual([]);
});
