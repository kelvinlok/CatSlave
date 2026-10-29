import { expect, test } from '@playwright/test';

const customAssets = ['choco', 'latte', 'didi', 'xiaosai', 'yelo', 'miller', 'momo', 'zhenzhenzi', 'dingding'];

test('the complete custom roster loads authored models with finite animated transforms', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/browser/cat-studio.html');
  await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  const report = await page.evaluate(async assets => {
    const configPath = '/src/config.ts';
    const { PALETTE } = await import(configPath) as typeof import('../../src/config');
    const studio = window.__CAT_STUDIO__;
    return { roster: PALETTE.map(cat => cat.appearance), custom: assets.map(asset => {
      const variant = PALETTE.findIndex(cat => cat.appearance === asset);
      const stats = studio.pose('walking', 2, variant);
      studio.model.root.updateMatrixWorld(true);
      let finite = true;
      studio.model.root.traverse(object => { finite &&= object.matrixWorld.elements.every(Number.isFinite); });
      return { rig: studio.model.root.userData.modelRig, asset: studio.model.root.userData.modelAsset, finite, triangles: stats.triangles };
    }) };
  }, customAssets);
  expect(report.roster).toEqual(customAssets);
  report.custom.forEach((model, index) => {
    expect(model.rig).toBe('blender-armature'); expect(model.asset).toBe(`models/${customAssets[index]}.glb`);
    expect(model.finite).toBe(true); expect(model.triangles).toBeGreaterThan(1000);
  });
  expect(errors).toEqual([]);
});

for (const [failedVariant, asset] of customAssets.entries()) {
  test(`a failed ${asset} download falls back independently while the other custom cats stay native`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let failedRequests = 0;
    await page.route(`**/models/${asset}.glb`, route => {
      failedRequests++;
      return route.fulfill({ status: 503, body: 'Unavailable' });
    });
    await page.goto('/tests/browser/cat-studio.html');
    await page.waitForFunction(() => !!window.__CAT_STUDIO__);
    const models = await page.evaluate(async assets => {
      const configPath = '/src/config.ts';
      const { PALETTE } = await import(configPath) as typeof import('../../src/config');
      const studio = window.__CAT_STUDIO__;
      return assets.map(asset => {
        const variant = PALETTE.findIndex(cat => cat.appearance === asset);
        const stats = studio.pose('walking', 2, variant);
        studio.model.root.updateMatrixWorld(true);
        let finite = true;
        studio.model.root.traverse(object => { finite &&= object.matrixWorld.elements.every(Number.isFinite); });
        return {
          source: studio.model.root.userData.modelSource ?? 'builtin',
          rig: studio.model.root.userData.modelRig ?? null,
          asset: studio.model.root.userData.modelAsset ?? null,
          finite, triangles: stats.triangles,
        };
      });
    }, customAssets);
    expect(failedRequests).toBe(1);
    for (const [variant, model] of models.entries()) {
      expect(model.finite).toBe(true);
      expect(model.triangles).toBeGreaterThan(1000);
      if (variant === failedVariant) {
        expect(model.source).toBe('builtin');
        expect(model.rig).toBeNull();
        expect(model.asset).toBeNull();
      } else {
        expect(model.source).toBe('blender');
        expect(model.rig).toBe('blender-armature');
        expect(model.asset).toBe(`models/${customAssets[variant]}.glb`);
      }
    }
    expect(errors).toEqual([]);
  });
}
