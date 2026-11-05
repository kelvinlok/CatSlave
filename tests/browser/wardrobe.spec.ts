import { test, expect, type Page, type Route } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { CatOutfit, CostumeItemId, CostumeSlot } from '../../src/wardrobe';

test.use({ deviceScaleFactor: 1 });
const storageKey = 'catslave-wardrobe';
const defaultChoco: CatOutfit = { headwear: 'choco', neckwear: 'choco', footwear: 'choco' };

async function ready(page: Page) {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
}
async function tap(page: Page, id: string) {
  await expect.poll(() => page.evaluate(id => !!window.__CATSLAVE_TEST__.hud.controls.find(hit => hit.id === id), id)).toBe(true);
  const p = await page.evaluate(id => {
    const hit = window.__CATSLAVE_TEST__.hud.controls.find(hit => hit.id === id)!;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: rect.left + hit.x + hit.w / 2, y: rect.top + hit.y + hit.h / 2 };
  }, id);
  await page.mouse.click(p.x, p.y);
}
async function selectedOutfit(page: Page, appearance = 'choco') {
  return page.evaluate(appearance => window.__CATSLAVE_TEST__.game.wardrobe.get(appearance), appearance);
}
async function choose(page: Page, slot: CostumeSlot, item: CostumeItemId) {
  await tap(page, `wardrobe:category:${slot}`);
  for (let i = 0; i < 12; i++) {
    if (await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.some(hit => hit.id === id), `wardrobe:item:${item}`)) {
      await tap(page, `wardrobe:item:${item}`); return;
    }
    const state = await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__;
      return { offset: t.game.wardrobeItemOffset, previous: t.hud.controls.some(hit => hit.id === 'wardrobe:previous-items'),
        next: t.hud.controls.some(hit => hit.id === 'wardrobe:next-items') };
    });
    if (item === 'none' && state.previous) await tap(page, 'wardrobe:previous-items');
    else if (state.next) await tap(page, 'wardrobe:next-items');
    else if (state.previous) await tap(page, 'wardrobe:previous-items');
    else throw new Error(`Cannot reach wardrobe item ${item}`);
  }
  throw new Error(`Wardrobe item ${item} never became visible`);
}
async function preview(page: Page) {
  return page.evaluate(() => {
    const root = window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('wardrobe-cat-model');
    if (!root) return undefined;
    return { source: root.userData.modelSource ?? 'builtin', outfit: root.userData.catOutfit,
      hat: !!root.getObjectByName('christmas-headwear'), neck: !!root.getObjectByName('christmas-neckwear'),
      shoes: [0, 1, 2, 3].filter(i => !!root.getObjectByName(`christmas-shoe${i}`)).length };
  });
}

test('mixes pieces with real input, scrolls without equipping, persists, and resets only one cat', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await ready(page);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.restoreAdoptedCats(['Latte']); t.refresh(); });
  await tap(page, 'wardrobe:open');
  await choose(page, 'headwear', 'momo'); await choose(page, 'neckwear', 'latte'); await choose(page, 'footwear', 'xiaosai');
  const mixed: CatOutfit = { headwear: 'momo', neckwear: 'latte', footwear: 'xiaosai' };
  expect(await selectedOutfit(page)).toEqual(mixed);
  await expect.poll(async () => (await preview(page))?.outfit).toEqual(mixed);
  expect(await selectedOutfit(page, 'latte')).toEqual({ headwear: 'latte', neckwear: 'latte', footwear: 'latte' });

  const card = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, hit = t.hud.controls.find(hit => hit.id.startsWith('wardrobe:item:'))!;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: hit.x + hit.w / 2 + rect.left, y: hit.y + hit.h / 2 + rect.top };
  });
  const beforeDrag = await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobeItemOffset);
  await page.mouse.move(card.x, card.y); await page.mouse.down(); await page.mouse.move(card.x + 100, card.y, { steps: 6 }); await page.mouse.up();
  expect(await selectedOutfit(page)).toEqual(mixed);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobeItemOffset)).not.toBe(beforeDrag);
  const beforeWheel = await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobeItemOffset);
  await page.mouse.move(card.x, card.y); await page.mouse.wheel(0, 180);
  expect(await selectedOutfit(page)).toEqual(mixed);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobeItemOffset)).not.toBe(beforeWheel);

  await tap(page, 'wardrobe:next-cat');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobeCatIndex)).toBe(1);
  await choose(page, 'headwear', 'didi');
  await tap(page, 'wardrobe:previous-cat');
  expect(await selectedOutfit(page)).toEqual(mixed);
  await tap(page, 'wardrobe:close'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('title');
  await tap(page, 'wardrobe:open'); expect(await selectedOutfit(page)).toEqual(mixed);
  await expect.poll(() => page.evaluate(key => !!localStorage.getItem(key), storageKey)).toBe(true);
  await page.reload(); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  await tap(page, 'wardrobe:open'); expect(await selectedOutfit(page)).toEqual(mixed);
  for (const slot of ['headwear', 'neckwear', 'footwear'] as const) await choose(page, slot, 'none');
  await expect.poll(() => preview(page)).toMatchObject({ outfit: { headwear: 'none', neckwear: 'none', footwear: 'none' }, hat: false, neck: false, shoes: 0 });
  await tap(page, 'wardrobe:reset'); expect(await selectedOutfit(page)).toEqual(defaultChoco);
  expect((await selectedOutfit(page, 'latte')).headwear).toBe('didi');
  expect(errors).toEqual([]);
});

test('opens the selected free-play cat and returns to free play or the selected dex profile', async ({ page }) => {
  await ready(page);
  const selectedId = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.restoreFreePlay(['Choco', 'Latte', '的的', '小塞', 'Yelo']);
    t.game.startFreePlay(); t.game.chooseFreeCat(t.game.cats[3].id); t.refresh(); return t.game.selectedFreeCatId;
  });
  const camera = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.world.camera.position.set(-1.1, 1.8, 3.2);
    t.world.setViewOrientation(t.world.camera.quaternion.clone().setFromAxisAngle(t.world.camera.up, .41));
    t.world.zoomView(-100); t.world.translateView(-100, 0, 0); t.refresh();
    return { position: t.world.camera.position.toArray(), quaternion: t.world.camera.quaternion.toArray(), zoom: t.world.camera.zoom, aspect: t.world.camera.aspect };
  });
  expect(camera.zoom).toBe(.2);
  await tap(page, 'wardrobe:open');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobeCatIndex)).toBe(3);
  const frozen = await page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; return { clock: g.clock, cats: JSON.stringify(g.cats) }; });
  await page.evaluate(() => window.__CATSLAVE_TEST__.game.tick(60));
  expect(await page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; return { clock: g.clock, cats: JSON.stringify(g.cats) }; })).toEqual(frozen);
  await choose(page, 'footwear', 'momo'); await tap(page, 'wardrobe:close');
  expect(await page.evaluate(() => ({ phase: window.__CATSLAVE_TEST__.game.phase, selected: window.__CATSLAVE_TEST__.game.selectedFreeCatId }))).toEqual({ phase: 'free-play', selected: selectedId });
  expect(await page.evaluate(() => {
    const camera = window.__CATSLAVE_TEST__.world.camera;
    return { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), zoom: camera.zoom, aspect: camera.aspect };
  })).toEqual(camera);
  await expect.poll(() => page.evaluate(id => window.__CATSLAVE_TEST__.world.scene.children.find(root => root.userData.catId === id)?.userData.catOutfit, selectedId)).toEqual({ headwear: 'xiaosai', neckwear: 'xiaosai', footwear: 'momo' });
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.phase = 'cat-dex'; t.hud.dexCat = 1; t.refresh(); });
  await tap(page, 'wardrobe:dress'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobeCatIndex)).toBe(1);
  await tap(page, 'wardrobe:close'); expect(await page.evaluate(() => ({ phase: window.__CATSLAVE_TEST__.game.phase, cat: window.__CATSLAVE_TEST__.hud.dexCat }))).toEqual({ phase: 'cat-dex', cat: 1 });
});

test('storage denial retains live choices and leaves the closet usable', async ({ page }) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'catslave-wardrobe') throw new DOMException('Storage blocked for test', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await ready(page); await tap(page, 'wardrobe:open'); await choose(page, 'headwear', 'none');
  expect((await selectedOutfit(page)).headwear).toBe('none');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobeSaveFailed)).toBe(true);
  await tap(page, 'wardrobe:close'); await tap(page, 'wardrobe:open');
  expect((await selectedOutfit(page)).headwear).toBe('none'); await tap(page, 'wardrobe:reset');
  expect(await selectedOutfit(page)).toEqual(defaultChoco);
});

test('keeps restored choices when a delayed native cat replaces the fallback preview', async ({ page }) => {
  let held: Route | undefined;
  await page.route('**/models/choco.glb', route => { held = route; });
  await page.addInitScript(() => localStorage.setItem('catslave-wardrobe', JSON.stringify({ version: 1,
    outfits: { choco: { headwear: 'none', neckwear: 'latte', footwear: 'momo' } } })));
  await ready(page); await tap(page, 'wardrobe:open');
  const outfit: CatOutfit = { headwear: 'none', neckwear: 'latte', footwear: 'momo' };
  await expect.poll(() => preview(page)).toMatchObject({ source: 'builtin', outfit, hat: false, neck: true, shoes: 4 });
  await expect.poll(() => !!held).toBe(true);
  await held!.fulfill({ path: 'public/models/choco.glb', contentType: 'model/gltf-binary' });
  await expect.poll(() => preview(page), { timeout: 30000 }).toMatchObject({ source: 'blender', outfit, hat: false, neck: true, shoes: 4 });
  expect(await selectedOutfit(page)).toEqual(outfit);
});

test('keeps title actions visible on compact screens with both Closet and unlocked free play', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 }); await ready(page);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.restoreFreePlay(['Choco', 'Latte', '的的', '小塞', 'Yelo']); t.refresh();
  });
  const controls = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls);
  for (const id of ['start', 'learn', 'cat-dex', 'wardrobe:open', 'free-play', 'sound', 'language']) {
    const hit = controls.find(hit => hit.id === id); expect(hit, id).toBeTruthy();
    expect(hit!.x, id).toBeGreaterThanOrEqual(0); expect(hit!.y, id).toBeGreaterThanOrEqual(0);
    expect(hit!.x + hit!.w, id).toBeLessThanOrEqual(320); expect(hit!.y + hit!.h, id).toBeLessThanOrEqual(480);
  }
  const frame = await page.evaluate(() => window.__CATSLAVE_TEST__.captureFrame());
  await mkdir('artifacts/wardrobe-qa', { recursive: true });
  await writeFile('artifacts/wardrobe-qa/title-compact.png', Buffer.from(frame.split(',')[1], 'base64'));
  await tap(page, 'wardrobe:open'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('wardrobe');
});
