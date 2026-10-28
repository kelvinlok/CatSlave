import { expect, test } from '@playwright/test';

for (const fallback of [false, true]) {
  test(`震震子 joins saved free play and the dex with the ${fallback ? 'fallback' : 'Blender'} model`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    if (fallback) await page.route('**/models/zhenzhenzi.glb', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/');
    await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    const report = await page.evaluate(async () => {
      const t = window.__CATSLAVE_TEST__, game = t.game;
      t.setManualClock(true);
      game.restoreFreePlay(['Choco', 'Latte', '的的', 'Miller', '震震子']);
      if (!game.startFreePlay()) throw new Error('Saved roster did not unlock free play');
      t.refresh();
      const path = '/src/blender-cat-asset.ts';
      const { preloadBlenderCatAsset } = await import(path) as typeof import('../../src/blender-cat-asset');
      await preloadBlenderCatAsset('zhenzhenzi'); t.refresh();
      const cat = game.cats.find(cat => cat.appearance === 'zhenzhenzi')!;
      const root = t.world.scene.children.find(child => child.userData.catId === cat.id)!;
      const free = { source: root.userData.modelSource ?? 'builtin', rig: root.userData.modelRig ?? null,
        asset: root.userData.modelAsset ?? null };
      game.phase = 'cat-dex'; t.hud.dexCat = 7; t.refresh();
      const dex = t.world.dexScene.getObjectByName('dex-cat-model')!;
      dex.updateMatrixWorld(true);
      let finite = true;
      dex.traverse(object => { finite &&= object.matrixWorld.elements.every(Number.isFinite); });
      return { free, roster: game.freePlayRoster, discovered: game.adoptedCats,
        dex: { source: dex.userData.modelSource ?? 'builtin', rig: dex.userData.modelRig ?? null,
          asset: dex.userData.modelAsset ?? null }, finite };
    });
    const expected = { source: fallback ? 'builtin' : 'blender', rig: fallback ? null : 'blender-armature',
      asset: fallback ? null : 'models/zhenzhenzi.glb' };
    expect(report.free).toEqual(expected); expect(report.dex).toEqual(expected);
    expect(report.roster).toEqual(['Choco', 'Latte', '的的', 'Miller', '震震子']);
    expect(report.discovered).toContain('震震子'); expect(report.finite).toBe(true);
    expect(errors).toEqual([]);
  });
}
