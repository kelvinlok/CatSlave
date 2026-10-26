import { expect, test } from '@playwright/test';

const customAssets = ['choco', 'latte', 'didi', 'xiaosai', 'yelo', 'miller'];

test('the generic palette cat stays procedural after all custom assets load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/browser/cat-studio.html');
  await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  const report = await page.evaluate(async assets => {
    const configPath = '/src/config.ts';
    const { PALETTE } = await import(configPath) as typeof import('../../src/config');
    const studio = window.__CAT_STUDIO__;
    const custom = assets.map(asset => {
      const variant = PALETTE.findIndex(cat => cat.appearance === asset);
      studio.pose('idle', 1, variant);
      return { rig: studio.model.root.userData.modelRig, asset: studio.model.root.userData.modelAsset };
    });
    const stats = studio.pose('walking', 2, PALETTE.findIndex(cat => !cat.appearance));
    studio.model.root.updateMatrixWorld(true);
    let nativeBones = 0, finite = true;
    studio.model.root.traverse(object => {
      if (object.name.startsWith('DEF_')) nativeBones++;
      finite &&= object.matrixWorld.elements.every(Number.isFinite);
    });
    return {
      custom, source: studio.model.root.userData.modelSource ?? 'builtin',
      asset: studio.model.root.userData.modelAsset ?? null,
      nativeBones, finite, triangles: stats.triangles,
    };
  }, customAssets);
  expect(report.custom).toEqual(customAssets.map(asset => ({ rig: 'blender-armature', asset: `models/${asset}.glb` })));
  expect(report.source).toBe('builtin');
  expect(report.asset).toBeNull();
  expect(report.nativeBones).toBe(0);
  expect(report.finite).toBe(true);
  expect(report.triangles).toBeGreaterThan(1000);
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
