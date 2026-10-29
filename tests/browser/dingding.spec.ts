import { expect, test } from '@playwright/test';

for (const fallback of [false, true]) {
  test(`丁丁 joins saved free play and the dex with the ${fallback ? 'fallback' : 'Blender'} model`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    if (fallback) await page.route('**/models/dingding.glb', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/');
    await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    const report = await page.evaluate(async () => {
      const t = window.__CATSLAVE_TEST__, game = t.game;
      t.setManualClock(true);
      game.restoreFreePlay(['Choco', 'Latte', '的的', 'Miller', '丁丁']);
      if (!game.startFreePlay()) throw new Error('Saved roster did not unlock free play');
      t.refresh();
      const path = '/src/blender-cat-asset.ts';
      const { preloadBlenderCatAsset } = await import(path) as typeof import('../../src/blender-cat-asset');
      await preloadBlenderCatAsset('dingding'); t.refresh();
      const cat = game.cats.find(cat => cat.appearance === 'dingding')!;
      const root = t.world.scene.children.find(child => child.userData.catId === cat.id)!;
      const free = { source: root.userData.modelSource ?? 'builtin', rig: root.userData.modelRig ?? null,
        asset: root.userData.modelAsset ?? null };
      game.phase = 'cat-dex'; t.hud.dexCat = undefined; t.refresh();
      return { free, roster: game.freePlayRoster, discovered: game.adoptedCats };
    });
    const cards = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.filter(hit => hit.id.startsWith('dex-cat:')));
    expect(cards).toHaveLength(9);
    const ninth = cards.find(hit => hit.id === 'dex-cat:8')!;
    expect(ninth.label).toContain('丁丁'); expect(ninth.disabled).toBe(false);
    const canvas = await page.locator('#game').boundingBox();
    await page.mouse.click(canvas!.x + ninth.x + ninth.w / 2, canvas!.y + ninth.y + ninth.h / 2);
    const preview = await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__, dex = t.world.dexScene.getObjectByName('dex-cat-model')!;
      dex.updateMatrixWorld(true);
      let finite = true;
      dex.traverse(object => { finite &&= object.matrixWorld.elements.every(Number.isFinite); });
      return { selected: t.hud.dexCat, finite, source: dex.userData.modelSource ?? 'builtin',
        rig: dex.userData.modelRig ?? null, asset: dex.userData.modelAsset ?? null };
    });
    const expected = { source: fallback ? 'builtin' : 'blender', rig: fallback ? null : 'blender-armature',
      asset: fallback ? null : 'models/dingding.glb' };
    expect(report.free).toEqual(expected); expect(preview).toEqual({ ...expected, selected: 8, finite: true });
    expect(report.roster).toEqual(['Choco', 'Latte', '的的', 'Miller', '丁丁']);
    expect(report.discovered).toContain('丁丁');
    expect(errors).toEqual([]);
  });
}
