import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('Latte can be adopted and shows her asymmetric coat and dorsal patches', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const folder = `artifacts/latte/${info.project.name}`; await mkdir(folder, { recursive: true });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  const cats = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, game = t.game;
    t.setManualClock(true); game.reset(); game.stageElapsed = game.config.duration - 0.01; game.tick(0.02);
    const latte = game.candidates.find(cat => cat.appearance === 'latte')!;
    game.adopt(latte.id); game.upgrade('food'); t.refresh();
    return game.cats.map(cat => cat.name);
  });
  expect(cats).toEqual(['Choco', 'Latte']);
  await page.screenshot({ path: `${folder}/in-game.png` });
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  await page.evaluate(() => window.__CAT_STUDIO__.pose('idle', 1, 1, 0, 0.5, true));
  await page.screenshot({ path: `${folder}/latte-reference-views.png` });
  await page.evaluate(() => { const s = window.__CAT_STUDIO__; s.pose('walking', 2, 1); s.pose('walking', 2.55, 1); });
  await page.screenshot({ path: `${folder}/latte-walking.png` });
  expect(errors).toEqual([]);
});
