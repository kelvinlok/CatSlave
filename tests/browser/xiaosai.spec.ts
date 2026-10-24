import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('小塞 can be adopted and renders the tabby face in close-up and animated poses', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const folder = `artifacts/xiaosai/${info.project.name}`; await mkdir(folder, { recursive: true });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  const cats = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, game = t.game;
    t.setManualClock(true); game.reset();
    for (const appearance of ['latte', 'didi', 'xiaosai']) {
      game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); t.finishBonus();
      game.adopt(game.candidates.find(cat => cat.appearance === appearance)!.id); for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
    }
    t.refresh(); return game.cats.map(cat => cat.name);
  });
  expect(cats).toEqual(['Choco', 'Latte', '的的', '小塞']);
  await page.screenshot({ path: `${folder}/in-game.png` });
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  await page.evaluate(() => window.__CAT_STUDIO__.pose('idle', 1.4, 3, 0, 0.5, false, true));
  await page.screenshot({ path: `${folder}/head-details.png` });
  for (const [i, activity] of (['walking', 'sleeping', 'grooming'] as const).entries()) {
    await page.evaluate(({ i, activity }) => {
      const s = window.__CAT_STUDIO__; s.pose(activity, 2 + i, 3); s.pose(activity, 2.55 + i, 3);
    }, { i, activity });
    await page.screenshot({ path: `${folder}/${activity}.png` });
  }
  expect(errors).toEqual([]);
});
