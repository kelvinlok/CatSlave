import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
test.use({ deviceScaleFactor: 1 });
async function tap(page: Page, id: string) {
  const p = await page.evaluate(id => {
    const h = window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!;
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.x + h.x + h.w / 2, y: r.y + h.y + h.h / 2 };
  }, id);
  await page.mouse.click(p.x, p.y);
}
async function state(page: Page) {
  return page.evaluate(() => { const t = window.__CATSLAVE_TEST__; return {
    enabled: t.game.festiveDecorations, visible: t.world.roomRoot.getObjectByName('Christmas lounge')!.visible,
    outfit: t.game.wardrobe.get('choco'), phase: t.game.phase,
  }; });
}
test('remembers room decoration visibility without affecting closet choices', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    localStorage.setItem('catslave-language', 'en');
    if (!localStorage.getItem('catslave-wardrobe')) localStorage.setItem('catslave-wardrobe', JSON.stringify({ version: 1, outfits: { choco: { headwear: 'latte', footwear: 'momo' } } }));
  });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => window.__CATSLAVE_TEST__.setManualClock(true));
  const before = (await state(page)).outfit;
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.focusedId)).toBe('start');
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.focusedId)).toBe('festive-decorations');
  await tap(page, 'festive-decorations');
  await expect.poll(() => state(page)).toMatchObject({ enabled: false, visible: false, outfit: before });
  await tap(page, 'wardrobe:open');
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('wardrobe-cat-model')?.userData.catOutfit)).toEqual(before);
  await tap(page, 'wardrobe:category:headwear'); await tap(page, 'wardrobe:item:none');
  expect((await state(page)).outfit.headwear).toBe('none');
  await tap(page, 'wardrobe:close'); await page.reload();
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await expect.poll(() => state(page)).toMatchObject({ enabled: false, visible: false });
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.world.roomRoot.userData.loaded);
  expect((await state(page)).visible).toBe(false);
  await tap(page, 'festive-decorations');
  await expect.poll(() => state(page)).toMatchObject({ enabled: true, visible: true, outfit: { ...before, headwear: 'none' } });
  await page.setViewportSize({ width: 320, height: 480 });
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.width === 320 && window.__CATSLAVE_TEST__.hud.height === 480);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.restoreFreePlay(['Choco', 'Latte', '的的', '小塞', 'Yelo']); t.refresh(); });
  const hits = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls);
  const toggle = hits.find(h => h.id === 'festive-decorations')!;
  for (const hit of hits.filter(h => h.id !== toggle.id)) expect(toggle.y + toggle.h <= hit.y || hit.y + hit.h <= toggle.y).toBe(true);
  await mkdir('artifacts/decorations', { recursive: true });
  await writeFile('artifacts/decorations/compact.png', Buffer.from((await page.evaluate(() => window.__CATSLAVE_TEST__.captureFrame())).split(',')[1], 'base64'));
  expect(errors).toEqual([]);
});
test('works for the session when preference storage is blocked', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked'); }; });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await tap(page, 'festive-decorations'); expect((await state(page)).visible).toBe(false);
  await tap(page, 'festive-decorations'); expect((await state(page)).visible).toBe(true);
});
