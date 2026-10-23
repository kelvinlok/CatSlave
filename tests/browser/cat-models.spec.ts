import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('inspects all coat variants and the articulated poses at close range', async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1, baseURL });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const folder = `artifacts/cat-polish/${info.project.name}`; await mkdir(folder, { recursive: true });
  try {
    await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
    const stats = [];
    for (const variant of [0, 1, 2, 3, 4, 5, 6, 7]) {
      stats.push(await page.evaluate(variant => window.__CAT_STUDIO__.pose('idle', 1, variant), variant));
      if (variant < 3) await page.screenshot({ path: `${folder}/coat-${variant}.png` });
    }
    for (const [i, activity] of (['walking', 'grooming', 'sleeping', 'scratching', 'eating', 'jumping'] as const).entries()) {
      await page.evaluate(({ activity, i }) => { const studio = window.__CAT_STUDIO__; studio.pose(activity, 3 + i, 0); studio.pose(activity, 3.3 + i, 0); }, { activity, i });
      await page.screenshot({ path: `${folder}/${activity}.png` });
    }
    expect(errors).toEqual([]);
    await writeFile(`${folder}/model-stats.json`, JSON.stringify({ stats, errors }, null, 2));
  } finally { await context.close(); }
});
