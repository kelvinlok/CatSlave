import { expect, test } from '@playwright/test';

test('Choco appears in the game and renders the reference markings from both sides', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset(); t.refresh();
  });
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].name)).toBe('Choco');
  await page.screenshot({ path: `test-results/choco-game-${info.project.name}.png` });
  await page.setViewportSize({ width: 1200, height: 700 });
  // Render the production model at inspection size; gameplay uses this same rig.
  await page.evaluate(async () => {
    const path = '/tests/browser/cat-studio.ts';
    const { mountCatStudio } = await import(path);
    window.__CAT_STUDIO__ = mountCatStudio(); window.__CAT_STUDIO__.pose('idle', 1);
  });
  await page.locator('#cat-studio').screenshot({ path: `test-results/choco-model-${info.project.name}.png` });
  expect(errors).toEqual([]);
});
