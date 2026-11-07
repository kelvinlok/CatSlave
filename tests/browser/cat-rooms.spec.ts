import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ deviceScaleFactor: 1 });
const roster = ['Choco', 'Latte', '的的', '小塞', 'Yelo'];
const names = [...roster, 'Miller', 'Momo', '震震子', '丁丁'];

async function tap(page: Page, id: string) {
  const point = await page.evaluate(id => {
    const h = window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id);
    if (!h || h.disabled) throw new Error(`Unavailable control ${id}`);
    const r = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: r.x + h.x + h.w / 2, y: r.y + h.y + h.h / 2 };
  }, id);
  await page.mouse.click(point.x, point.y);
}
async function selectCat(page: Page, index: number) {
  for (let step = 0; step < 12; step++) {
    const visible = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.filter(h => /^cat-rooms:cat:\d$/.test(h.id)).map(h => Number(h.id.split(':')[2])));
    if (visible.includes(index)) { await tap(page, `cat-rooms:cat:${index}`); return; }
    await tap(page, index < Math.min(...visible) ? 'cat-rooms:previous-items' : 'cat-rooms:next-items');
  }
  throw new Error(`Cat ${index} not reachable`);
}
async function confirmDisabled(page: Page) {
  return page.evaluate(() => !!window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'cat-rooms:confirm')?.disabled);
}
async function settle(page: Page) {
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    for (let i = 0; i < 3000 && t.game.roomTransitions.length; i++) {
      const waking = t.game.roomTransitions.filter(move => move.direction === 'wake').map(move => move.catId);
      t.game.tick(.05); if (t.game.cats.length > 5) throw new Error('Lounge cap exceeded');
      for (const id of waking) if (!t.game.roomTransitions.some(move => move.catId === id)) {
        const cat = t.game.cats.find(cat => cat.id === id);
        if (cat && cat.elevation !== 0) throw new Error('Waking cat did not land on the floor');
      }
    }
    if (t.game.roomTransitions.length) throw new Error('Transfer did not finish');
    t.game.cats.forEach(cat => cat.decisionAt = Infinity); t.refresh();
  });
}
async function start(page: Page, active = roster, sleeping = ['Miller'], native = ['choco']) {
  await page.addInitScript(({ roster, active, sleeping }) => {
    localStorage.setItem('catslave-language', 'en'); localStorage.setItem('catslave-free-play', JSON.stringify(roster));
    localStorage.setItem('catslave-cat-dex', JSON.stringify([...new Set([...roster, ...active, ...sleeping])]));
    if (!localStorage.getItem('catslave-cat-rooms')) localStorage.setItem('catslave-cat-rooms', JSON.stringify({ version: 1, active, rooms: [...sleeping, ...Array(8 - sleeping.length).fill(null)] }));
    if (!localStorage.getItem('catslave-wardrobe')) localStorage.setItem('catslave-wardrobe', JSON.stringify({ version: 1, outfits: { choco: { headwear: 'none', footwear: 'momo' } } }));
  }, { roster, active, sleeping });
  await page.route('**/models/**', route => [...native, 'lounge', 'christmas-tree', 'christmas-wall-decor'].some(name => route.request().url().includes(`${name}.glb`)) ? route.continue() : route.abort());
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__?.world.roomRoot.userData.loaded);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.refresh(); });
  await tap(page, 'free-play');
  if (await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase === 'room-notice')) await tap(page, 'room:notice-continue');
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.cats.forEach(cat => cat.decisionAt = Infinity); t.refresh(); });
}
async function capture(page: Page, name: string) {
  await mkdir('artifacts/cat-rooms-cat-picker', { recursive: true });
  const frame = await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.refresh(); return t.captureFrame(); });
  await writeFile(`artifacts/cat-rooms-cat-picker/${name}.png`, Buffer.from(frame.split(',')[1], 'base64'));
}

test('cat selection sends and invites directly while preserving outfits, capacity and saved membership', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await start(page);
  const original = await page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; return { id: g.cats.find(c => c.name === 'Choco')!.id, outfit: g.wardrobe.get('choco') }; });
  await tap(page, 'cat-rooms:open'); await tap(page, 'cat-rooms:group:sleeping'); await selectCat(page, 5);
  expect(await confirmDisabled(page)).toBe(true);
  await tap(page, 'cat-rooms:group:lounge'); await selectCat(page, 0);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomTransitions.length)).toBe(0);
  await tap(page, 'cat-rooms:confirm'); await tap(page, 'cat-rooms:close'); await settle(page);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.length)).toBe(4);
  await tap(page, 'cat-rooms:open');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.catRoomsGroup)).toBe('sleeping');
  await selectCat(page, 0); expect(await confirmDisabled(page)).toBe(false);
  await tap(page, 'cat-rooms:confirm'); await tap(page, 'cat-rooms:close'); await settle(page);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.find(c => c.name === 'Choco')?.id)).toBe(original.id);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobe.get('choco'))).toEqual(original.outfit);
  await tap(page, 'cat-rooms:open'); await tap(page, 'cat-rooms:group:lounge'); await selectCat(page, 0);
  await tap(page, 'cat-rooms:confirm'); await tap(page, 'cat-rooms:close'); await settle(page);
  await tap(page, 'cat-rooms:open'); await selectCat(page, 5); await tap(page, 'cat-rooms:confirm'); await tap(page, 'cat-rooms:close'); await settle(page);
  await tap(page, 'cat-rooms:open'); await tap(page, 'cat-rooms:group:sleeping'); await selectCat(page, 0);
  expect(await confirmDisabled(page)).toBe(true);
  const saved = await page.evaluate(() => window.__CATSLAVE_TEST__.game.exportCatRooms());
  expect(saved?.active).toHaveLength(5); expect(saved?.active).toContain('Miller'); expect(saved?.rooms).toContain('Choco');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('catslave-cat-rooms') ?? 'null'))).toEqual(saved);
  await page.reload(); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.refresh(); });
  await tap(page, 'free-play');
  if (await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase === 'room-notice')) await tap(page, 'room:notice-continue');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.exportCatRooms())).toEqual(saved);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobe.get('choco'))).toEqual(original.outfit);
  expect(errors).toEqual([]);
});

test('one active cat with eight sleepers can invite directly and queue cats sharing a room column', async ({ page }) => {
  await start(page, ['Choco'], names.slice(1), ['latte']);
  await tap(page, 'cat-rooms:open');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.catRoomsGroup)).toBe('sleeping');
  expect(await confirmDisabled(page)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('cat-rooms-cat-model')?.userData.modelSource)).toBe('blender');
  if (!process.env.CAT_ROOMS_SKIP_CAPTURES) await capture(page, 'mobile-invite');
  await selectCat(page, 8); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.catRoomsCatIndex)).toBe(8);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomTransitions.length)).toBe(0);
  await selectCat(page, 1); await tap(page, 'cat-rooms:confirm');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.length)).toBe(2);
  await tap(page, 'cat-rooms:group:sleeping'); await selectCat(page, 3);
  expect(await confirmDisabled(page)).toBe(false); await tap(page, 'cat-rooms:confirm');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.length)).toBe(3);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomTransitions.find(t => t.roomIndex === 2)?.phase)).toBe('queued');
  await tap(page, 'cat-rooms:group:sleeping'); await selectCat(page, 5); await tap(page, 'cat-rooms:confirm');
  await tap(page, 'cat-rooms:group:sleeping'); await selectCat(page, 6); await tap(page, 'cat-rooms:confirm');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.length)).toBe(5);
  await tap(page, 'cat-rooms:group:sleeping'); await selectCat(page, 4); expect(await confirmDisabled(page)).toBe(true);
  await tap(page, 'cat-rooms:close'); await settle(page);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.map(c => c.name).sort())).toEqual(['Choco', 'Latte', '小塞', 'Miller', 'Momo'].sort());
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomTransitions.length)).toBe(0);
});

test('four active cats show an actionable sleeper preview on compact screens', async ({ page }) => {
  await start(page, roster.slice(0, 4), ['Yelo'], ['yelo']);
  await page.setViewportSize({ width: 320, height: 480 });
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.width === 320 && window.__CATSLAVE_TEST__.hud.height === 480);
  await tap(page, 'cat-rooms:open');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.catRoomsGroup)).toBe('sleeping');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.catRoomsCatIndex)).toBe(4);
  expect(await confirmDisabled(page)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('cat-rooms-cat-model')?.userData.modelSource)).toBe('blender');
  const preview = await page.evaluate(() => { const t = window.__CATSLAVE_TEST__, r = document.querySelector('canvas')!.getBoundingClientRect(); return { ...t.hud.catRoomsLayout.preview, left: r.x, top: r.y, rotation: t.world.dexScene.getObjectByName('cat-rooms-cat-model')!.parent!.quaternion.toArray() }; });
  const x = preview.left + preview.x + preview.w / 2, y = preview.top + preview.y + preview.h / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 40, y, { steps: 4 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('cat-rooms-cat-model')!.parent!.quaternion.toArray())).not.toEqual(preview.rotation);
  await capture(page, 'compact-invite');
  const hits = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.filter(h => h.id.startsWith('cat-rooms:') && h.id !== 'cat-rooms:background'));
  for (const hit of hits) {
    expect(hit.x).toBeGreaterThanOrEqual(0); expect(hit.y).toBeGreaterThanOrEqual(0);
    expect(hit.x + hit.w).toBeLessThanOrEqual(320); expect(hit.y + hit.h).toBeLessThanOrEqual(480);
    for (const other of hits.filter(o => o.id !== hit.id)) expect(hit.x + hit.w <= other.x || other.x + other.w <= hit.x || hit.y + hit.h <= other.y || other.y + other.h <= hit.y).toBe(true);
  }
  await tap(page, 'cat-rooms:confirm');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.length)).toBe(5);
  await tap(page, 'cat-rooms:close'); await settle(page);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats.some(c => c.name === 'Yelo'))).toBe(true);
});
