import { expect, test } from '@playwright/test';

for (const fallback of [false, true]) {
  test(`Momo can be adopted third and joins free play with the ${fallback ? 'fallback' : 'Blender'} model`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    if (fallback) await page.route('**/models/momo.glb', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.goto('/');
    await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    const report = await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__, game = t.game;
      t.setManualClock(true); game.reset();
      for (const appearance of ['latte', 'didi', 'momo', 'yelo']) {
        game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
        game.tick(game.timeLeft); t.finishBonus();
        if (appearance === 'momo' && game.candidates.map(cat => cat.appearance).join(',') !== 'xiaosai,momo') {
          throw new Error('The third adoption must offer Xiaosai and Momo together');
        }
        const candidate = game.candidates.find(cat => cat.appearance === appearance);
        if (!candidate) throw new Error(`Missing adoption candidate: ${appearance}`);
        game.adopt(candidate.id);
        for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) {
          while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
        }
      }
      t.refresh();
      const momo = game.cats.find(cat => cat.appearance === 'momo')!;
      const root = t.world.scene.children.find(child => child.userData.catId === momo.id)!;
      const adoption = { stage: game.stage, phase: game.phase, source: root.userData.modelSource ?? 'builtin',
        rig: root.userData.modelRig ?? null, asset: root.userData.modelAsset ?? null };
      game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
      game.tick(game.timeLeft); game.startFreePlay(); t.refresh();
      const freeRoot = t.world.scene.children.find(child => child.userData.catId === momo.id)!;
      return { adoption, roster: game.freePlayRoster, freePhase: game.phase,
        freeAsset: freeRoot.userData.modelAsset ?? null, freeSource: freeRoot.userData.modelSource ?? 'builtin' };
    });
    expect(report.adoption).toEqual({ stage: 4, phase: 'playing', source: fallback ? 'builtin' : 'blender',
      rig: fallback ? null : 'blender-armature', asset: fallback ? null : 'models/momo.glb' });
    expect(report.roster).toEqual(['Choco', 'Latte', '的的', 'Momo', 'Yelo']);
    expect(report.freePhase).toBe('free-play');
    expect(report.freeSource).toBe(fallback ? 'builtin' : 'blender');
    expect(report.freeAsset).toBe(fallback ? null : 'models/momo.glb');
    expect(errors).toEqual([]);
  });
}

