import { expect, test } from '@playwright/test';

for (const fallback of [false, true]) {
  test(`Yelo can be adopted fourth and joins free play with her ${fallback ? 'fallback' : 'Blender'} model`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    if (fallback) await page.route('**/models/yelo.glb', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/');
    await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    const report = await page.evaluate(async () => {
      const t = window.__CATSLAVE_TEST__, game = t.game;
      t.setManualClock(true); game.reset();
      for (const appearance of ['latte', 'didi', 'xiaosai', 'yelo']) {
        game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
        game.tick(game.timeLeft); t.finishBonus();
        const candidate = game.candidates.find(cat => cat.appearance === appearance);
        if (!candidate) throw new Error(`Missing adoption candidate: ${appearance}`);
        game.adopt(candidate.id);
        for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) {
          while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
        }
      }
      t.refresh();
      const assetPath = '/src/blender-cat-asset.ts';
      const { preloadBlenderCatAsset } = await import(assetPath) as typeof import('../../src/blender-cat-asset');
      await preloadBlenderCatAsset('yelo'); t.refresh();
      const yelo = game.cats.find(cat => cat.appearance === 'yelo')!;
      const root = t.world.scene.children.find(child => child.userData.catId === yelo.id)!;
      const adoption = { stage: game.stage, phase: game.phase, source: root.userData.modelSource ?? 'builtin',
        rig: root.userData.modelRig ?? null, asset: root.userData.modelAsset ?? null };
      game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
      game.tick(game.timeLeft); game.startFreePlay(); t.refresh();
      const freeRoot = t.world.scene.children.find(child => child.userData.catId === yelo.id)!;
      return { adoption, roster: game.freePlayRoster, freePhase: game.phase,
        freeAsset: freeRoot.userData.modelAsset ?? null, freeSource: freeRoot.userData.modelSource ?? 'builtin' };
    });
    expect(report.adoption).toEqual({ stage: 4, phase: 'playing', source: fallback ? 'builtin' : 'blender',
      rig: fallback ? null : 'blender-armature', asset: fallback ? null : 'models/yelo.glb' });
    expect(report.roster).toEqual(['Choco', 'Latte', '的的', '小塞', 'Yelo']);
    expect(report.freePhase).toBe('free-play');
    expect(report.freeSource).toBe(fallback ? 'builtin' : 'blender');
    expect(report.freeAsset).toBe(fallback ? null : 'models/yelo.glb');
    expect(errors).toEqual([]);
  });
}
