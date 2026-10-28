import { expect, test, type Page, type Route } from '@playwright/test';
import path from 'node:path';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__, undefined, { timeout: 8000 });
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
}

async function tap(page: Page, id: string) {
  const hit = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!, id);
  expect(hit).toBeDefined(); await page.touchscreen.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
}

async function holdModels(page: Page) {
  const requests: string[] = [], pending = new Map<string, Route>();
  await page.route('**/models/*.glb', route => {
    const kind = path.basename(new URL(route.request().url()).pathname, '.glb');
    requests.push(kind); pending.set(kind, route);
  });
  return {
    requests,
    async release(kind: string, success = true) {
      await expect.poll(() => pending.has(kind)).toBe(true);
      const route = pending.get(kind)!; pending.delete(kind);
      await route.fulfill(success ? { path: `public/models/${kind}.glb`, contentType: 'model/gltf-binary' }
        : { status: 503, body: 'Unavailable' });
    },
  };
}

test('starts and accepts care input while Choco is stalled, then upgrades in place', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const models = await holdModels(page);
  await ready(page);
  await expect.poll(() => models.requests).toEqual(['choco']);
  await expect(page.locator('#model-loading')).toHaveCount(0);
  await tap(page, 'start');
  const before = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, cat = t.game.cats[0];
    t.game.spawn(cat, 'hunger'); t.refresh();
    const root = t.world.scene.children.find(root => root.userData.catId === cat.id)!;
    return { uuid: root.uuid, id: cat.id, source: root.userData.modelSource ?? 'builtin' };
  });
  expect(before.source).toBe('builtin');
  await tap(page, 'tool:food');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.selected)).toBe('food');
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.cats[0].activity = 'walking'; t.game.cats[0].stride = 3.7; t.refresh();
  });
  const state = await page.evaluate(() => {
    const g = window.__CATSLAVE_TEST__.game;
    return JSON.stringify({ cats: g.cats, events: g.events, hp: g.hp, clock: g.clock });
  });
  await models.release('choco');
  await expect.poll(() => page.evaluate(id => {
    const t = window.__CATSLAVE_TEST__;
    return t.world.scene.children.find(root => root.userData.catId === id)?.userData.modelRig;
  }, before.id)).toBe('blender-armature');
  expect(await page.evaluate(id => {
    const t = window.__CATSLAVE_TEST__, root = t.world.scene.children.find(root => root.userData.catId === id)!;
    root.updateMatrixWorld(true);
    let finite = true; root.traverse(part => { finite &&= part.matrixWorld.elements.every(Number.isFinite); });
    return { uuid: root.uuid, finite, selected: t.game.selected, phase: t.game.phase,
      state: JSON.stringify({ cats: t.game.cats, events: t.game.events, hp: t.game.hp, clock: t.game.clock }) };
  }, before.id)).toEqual({ uuid: before.uuid, finite: true, selected: 'food', phase: 'playing', state });
  await expect.poll(() => models.requests).toEqual(['choco', 'latte']); expect(errors).toEqual([]);
});

test('downloads the exact next two candidates during play without opening adoption', async ({ page }) => {
  const models = await holdModels(page); await ready(page);
  await models.release('choco', false);
  expect(models.requests).toEqual(['choco']);
  await tap(page, 'start');
  const planned = await page.evaluate(() => window.__CATSLAVE_TEST__.game.upcomingAdoption.map(cat => cat.appearance!));
  expect(planned).toHaveLength(2);
  await expect.poll(() => models.requests).toEqual(['choco', planned[0]]);
  await models.release(planned[0]);
  await expect.poll(() => models.requests).toEqual(['choco', ...planned]);
  await models.release(planned[1]);
  expect(await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.refresh(); t.refresh();
    return { phase: t.game.phase, candidates: t.game.candidates.length, residents: t.game.cats.length };
  })).toEqual({ phase: 'playing', candidates: 0, residents: 1 });
  const offered = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    t.game.cats[0].nextNeedAt = Infinity; t.game.tick(t.game.timeLeft); t.finishBonus(); t.refresh();
    return t.game.candidates.map(cat => cat.appearance);
  });
  expect(offered).toEqual(planned);
  expect(models.requests).toEqual(['choco', ...planned]);
});

test('requests adoption previews on demand and accepts adoption before their downloads finish', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const models = await holdModels(page); await ready(page); await models.release('choco', false);
  const candidates = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.reset();
    t.game.cats[0].nextNeedAt = Infinity; t.game.tick(t.game.timeLeft); t.finishBonus(); t.refresh();
    return t.game.candidates.map(cat => ({ id: cat.id, appearance: cat.appearance }));
  });
  expect(candidates[0].appearance).toBe('latte');
  await expect.poll(() => models.requests).toEqual(['choco', 'latte']);
  await tap(page, `adopt:${candidates[0].id}`);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('upgrade');
  const uuid = await page.evaluate(id => window.__CATSLAVE_TEST__.world.scene.children.find(root => root.userData.catId === id)!.uuid, candidates[0].id);
  await models.release('latte');
  await expect.poll(() => page.evaluate(id => window.__CATSLAVE_TEST__.world.scene.children.find(root => root.userData.catId === id)?.userData.modelAsset, candidates[0].id)).toBe('models/latte.glb');
  expect(await page.evaluate(id => {
    const t = window.__CATSLAVE_TEST__;
    return { ids: t.game.cats.map(cat => cat.id), candidates: t.game.candidates.length, phase: t.game.phase,
      uuid: t.world.scene.children.find(root => root.userData.catId === id)!.uuid,
      stalePreview: !!t.world.scene.getObjectByName(`preview-cat-${id}`) };
  }, candidates[0].id)).toMatchObject({ candidates: 0, phase: 'upgrade', uuid, stalePreview: false });
  // A previously requested candidate may finish after leaving adoption/reset.
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.reset(); t.refresh(); });
  if (candidates[1].appearance !== 'primitive') await models.release(candidates[1].appearance!, false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.length)).toBe(1);
  expect(new Set(models.requests).size).toBe(models.requests.length);
  expect(errors).toEqual([]);
});

test('restores only the saved roster on entering free play, and tolerates individual failures', async ({ page }) => {
  const roster = ['Choco', 'Latte', '的的', 'Miller', 'Momo'];
  await page.addInitScript(names => localStorage.setItem('catslave-free-play', JSON.stringify(names)), roster);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const models = await holdModels(page); await ready(page);
  await expect.poll(() => models.requests).toEqual(['choco']);
  await models.release('choco', false); await tap(page, 'free-play');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.map(cat => cat.name))).toEqual(roster);
  await expect.poll(() => models.requests).toEqual(['choco', 'latte']);
  const id = await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.at(-1)!.id);
  await tap(page, `free-cat:${id}`); await tap(page, 'free-mode:wand');
  for (const kind of ['latte', 'didi', 'miller']) await models.release(kind, false);
  await models.release('momo');
  await expect.poll(() => page.evaluate(id => window.__CATSLAVE_TEST__.world.scene.children.find(root => root.userData.catId === id)?.userData.modelAsset, id)).toBe('models/momo.glb');
  expect(models.requests).toEqual(['choco', 'latte', 'didi', 'miller', 'momo']);
  expect(await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return { phase: t.game.phase, selected: t.game.selectedFreeCatId, mode: t.game.freeInteraction,
      roster: JSON.parse(localStorage.getItem('catslave-free-play')!),
      sources: t.game.cats.map(cat => t.world.scene.children.find(root => root.userData.catId === cat.id)?.userData.modelSource ?? 'builtin') };
  })).toEqual({ phase: 'free-play', selected: id, mode: 'wand', roster, sources: ['builtin', 'builtin', 'builtin', 'builtin', 'blender'] });
  expect(errors).toEqual([]);
});
