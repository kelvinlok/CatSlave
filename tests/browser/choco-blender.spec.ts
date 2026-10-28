import { expect, test } from '@playwright/test';

test('the shipped Blender asset drives Choco in the game and through animated poses', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await expect.poll(() => page.evaluate(() => {
    const { game, world } = window.__CATSLAVE_TEST__;
    const root = world.scene.children.find(child => child.userData.catId === game.cats[0].id);
    return { source: root?.userData.modelSource, rig: root?.userData.modelRig, asset: root?.userData.modelAsset };
  })).toEqual({ source: 'blender', rig: 'blender-armature', asset: 'models/choco.glb' });
  await page.goto('/tests/browser/cat-studio.html');
  await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  const results = await page.evaluate(() => {
    const studio = window.__CAT_STUDIO__;
    return (['idle', 'walking', 'stretching', 'sleeping', 'grooming'] as const).map((activity, i) => {
      const stats = studio.pose(activity, i + 1, 0, 2, 0.5);
      studio.model.root.updateMatrixWorld(true);
      let finite = true, importedMeshes = 0;
      studio.model.root.traverse(object => {
        finite &&= object.matrixWorld.elements.every(Number.isFinite);
        if (object.name.startsWith('choco_')) importedMeshes++;
      });
      return { activity, stats, source: studio.model.root.userData.modelSource, finite, importedMeshes };
    });
  });
  for (const result of results) {
    expect(result.source).toBe('blender');
    expect(result.finite).toBe(true);
    expect(result.importedMeshes).toBeGreaterThan(15);
    expect(result.stats.triangles).toBeGreaterThan(1000);
  }
  expect(errors).toEqual([]);
});

test('a failed model download keeps the game playable with its built-in Choco', async ({ page }) => {
  await page.route('**/models/choco.glb', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  expect(await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    t.setManualClock(true); t.game.reset(); t.refresh();
    const root = t.world.scene.children.find(child => child.userData.catId === t.game.cats[0].id);
    return { name: t.game.cats[0].name, source: root?.userData.modelSource ?? 'builtin', phase: t.game.phase };
  })).toEqual({ name: 'Choco', source: 'builtin', phase: 'playing' });
});
