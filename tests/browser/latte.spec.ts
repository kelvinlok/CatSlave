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
    t.setManualClock(true); game.reset(); game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); t.finishBonus();
    const latte = game.candidates.find(cat => cat.appearance === 'latte')!;
    game.adopt(latte.id); for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool); t.refresh();
    return game.cats.map(cat => cat.name);
  });
  expect(cats).toEqual(['Choco', 'Latte']);
  await expect.poll(() => page.evaluate(() => {
    const { game, world } = window.__CATSLAVE_TEST__;
    return game.cats.map(cat => world.scene.children.find(child => child.userData.catId === cat.id)?.userData.modelAsset);
  })).toEqual(['models/choco.glb', 'models/latte.glb']);
  await page.screenshot({ path: `${folder}/in-game.png` });
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  await page.evaluate(() => window.__CAT_STUDIO__.pose('idle', 1, 1, 0, 0.5, true));
  await page.screenshot({ path: `${folder}/latte-reference-views.png` });
  const poses = await page.evaluate(() => {
    const s = window.__CAT_STUDIO__;
    return (['idle', 'walking', 'stretching', 'sleeping', 'grooming'] as const).map((activity, i) => {
      const stats = s.pose(activity, i + 1, 1);
      s.model.root.updateMatrixWorld(true);
      let finite = true, imported = 0;
      s.model.root.traverse(object => {
        finite &&= object.matrixWorld.elements.every(Number.isFinite);
        if (object.name.startsWith('latte_')) imported++;
      });
      return { finite, imported, asset: s.model.root.userData.modelAsset, triangles: stats.triangles };
    });
  });
  for (const pose of poses) {
    expect(pose.asset).toBe('models/latte.glb');
    expect(pose.finite).toBe(true);
    expect(pose.imported).toBeGreaterThan(15);
    expect(pose.triangles).toBeGreaterThan(1000);
  }
  await page.evaluate(() => window.__CAT_STUDIO__.pose('walking', 2.55, 1));
  await page.screenshot({ path: `${folder}/latte-walking.png` });
  expect(errors).toEqual([]);
});

test('a failed Latte download preserves her adoption and leaves Blender Choco available', async ({ page }) => {
  await page.route('**/models/latte.glb', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  expect(await page.evaluate(async () => {
    const t = window.__CATSLAVE_TEST__, game = t.game;
    t.setManualClock(true); game.reset(); game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); t.finishBonus();
    const candidate = game.candidates.find(cat => cat.appearance === 'latte')!;
    game.adopt(candidate.id);
    for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
    t.refresh();
    const assetPath = '/src/blender-cat-asset.ts';
    const { preloadBlenderCatAsset } = await import(assetPath) as typeof import('../../src/blender-cat-asset');
    await preloadBlenderCatAsset('latte'); t.refresh();
    return { phase: game.phase, cats: game.cats.map(cat => ({ name: cat.name,
      source: t.world.scene.children.find(child => child.userData.catId === cat.id)?.userData.modelSource ?? 'builtin' })) };
  })).toEqual({ phase: 'playing', cats: [{ name: 'Choco', source: 'blender' }, { name: 'Latte', source: 'builtin' }] });
});
