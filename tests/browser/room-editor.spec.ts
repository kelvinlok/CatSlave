import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import type { RoomLayout } from '../../src/room-layout';
import type { RoomEditorView } from '../../src/room-editor-view';
import type { RoomLayoutStore } from '../../src/room-editor';

type Hooks = Window['__CATSLAVE_TEST__'] & { editorView?: RoomEditorView; roomStore: RoomLayoutStore };
const roster = ['Choco', 'Latte', 'Yelo', 'Miller', 'Momo'];
function defaultRoomLayout(): RoomLayout {
  const manifest = JSON.parse(readFileSync('assets/lounge/furniture-manifest.json', 'utf8')) as {
    revision: number; items: { id: string; x: number; z: number }[];
  };
  return { roomRevision: manifest.revision, placed: Object.fromEntries(manifest.items.map(item => [item.id, { x: item.x, z: item.z, turn: 0 }])), unplaced: [] };
}

async function tap(page: Page, id: string, pointer: 'touch' | 'mouse' = 'touch') {
  if (id === 'room:unplaced') { await tap(page, 'room:items', pointer); await tap(page, 'room:filter:inventory', pointer); return; }
  await expect.poll(() => page.evaluate(id => !!window.__CATSLAVE_TEST__?.hud.controls.find(h => h.id === id && !h.disabled), id), { message: `available control ${id}` }).toBe(true);
  const hit = await page.evaluate(id => {
    const h = window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!, rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { ...h, x: h.x + rect.left, y: h.y + rect.top };
  }, id);
  if (pointer === 'mouse') await page.mouse.click(hit.x + hit.w / 2, hit.y + hit.h / 2);
  else await page.touchscreen.tap(hit.x + hit.w / 2, hit.y + hit.h / 2);
}
async function seed(page: Page, layout?: RoomLayout) {
  await page.addInitScript(({ roster, layout }) => {
    localStorage.setItem('catslave-language', 'en');
    localStorage.setItem('catslave-free-play', JSON.stringify(roster));
    if (layout && !localStorage.getItem('catslave-room-layouts')) {
      localStorage.setItem('catslave-room-layouts', JSON.stringify({ formatVersion: 1, activeSlot: 0, slots: [layout, layout, layout] }));
    }
  }, { roster, layout });
  // Keep the real furnished room; these checks do not depend on downloading cat meshes.
  await page.route('**/models/**', route => route.request().url().includes('lounge.glb') ? route.continue() : route.abort());
  await page.goto('/'); await ready(page);
}
async function ready(page: Page) {
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__?.world.roomEditable, null, { timeout: 90000 });
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.refresh(); });
}
async function freePlay(page: Page, continueNotice = true) {
  await tap(page, 'free-play');
  if (continueNotice && await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase === 'room-notice')) await tap(page, 'room:notice-continue');
}
async function item(page: Page, id: string, panel = 'items') {
  await tap(page, `room:${panel}`);
  for (let i = 0; i < 8; i++) {
    const found = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.some(h => h.id === `room:item:${id}`), id);
    if (found) { await tap(page, `room:item:${id}`); return; }
    await tap(page, 'room:next');
  }
  throw new Error(`Furniture picker did not contain ${id}`);
}
async function capture(page: Page, name: string) {
  await mkdir('artifacts/room-editor', { recursive: true });
  const data = await page.evaluate(() => { window.__CATSLAVE_TEST__.refresh(); return window.__CATSLAVE_TEST__.captureFrame(); });
  await writeFile(`artifacts/room-editor/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
}
async function project(page: Page, x: number, y: number, z: number) {
  return page.evaluate(({ x, y, z }) => {
    const t = window.__CATSLAVE_TEST__ as Hooks, v = t.world.viewport;
    const point = t.world.camera.position.clone().set(x, y, z).project(t.editorView!.camera);
    return { x: v.x + (point.x + 1) * v.w / 2, y: v.y + (1 - point.y) * v.h / 2 };
  }, { x, y, z });
}
function spareTable() {
  const layout = defaultRoomLayout();
  layout.unplaced = Object.entries(layout.placed).filter(([id]) => id !== 'table-1').map(([id, pose]) => ({ id, pose, reason: 'Not placed' }));
  layout.placed = { 'table-1': { x: -2, z: 0, turn: 0 } }; return layout;
}

test('direct room tools, named inventory toast and visual save cards preserve slot transactions', async ({ page }, info) => {
  await seed(page); await freePlay(page); await tap(page, 'room:open');
  const hits = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits);
  for (const id of ['undo', 'redo', 'snap', 'fit', 'reset']) {
    const hit = hits.find(hit => hit.id === `room:${id}`)!;
    expect(hit).toBeDefined(); expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44);
  }
  expect(hits.some(hit => hit.id === 'room:tools')).toBe(false);
  await tap(page, 'room:snap');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.snap)).toBe(false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomPanel)).toBe('none');
  await item(page, 'wheel'); await tap(page, 'room:store');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomToast?.label)).toBe('Exercise wheel');
  await capture(page, `direct-tools-toast-${info.project.name}`);
  await tap(page, 'room:undo'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomToast)).toBeUndefined();
  await tap(page, 'room:redo');
  const draft = await page.evaluate(() => JSON.stringify(window.__CATSLAVE_TEST__.hud.roomEditor!.draft));
  await tap(page, 'room:save');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.roomLayoutImages.size === 4);
  const previews = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return { draft: JSON.stringify(t.hud.roomEditor!.draft), liveWheel: t.world.roomRoot.getObjectByName('furniture:wheel')?.visible,
      different: t.hud.roomLayoutImages.get('draft')!.toDataURL() !== t.hud.roomLayoutImages.get('slot:0')!.toDataURL(),
      buttons: t.hud.controls.filter(hit => hit.id.startsWith('room:save-slot:')) };
  });
  expect(previews.draft).toBe(draft); expect(previews.liveWheel).toBe(false); expect(previews.different).toBe(true);
  expect(previews.buttons).toHaveLength(3);
  previews.buttons.forEach(hit => { expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44); });
  await capture(page, `save-grid-${info.project.name}`);
  await tap(page, 'room:save-slot:1'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomPanel)).toBe('confirm');
  expect(await page.evaluate(() => localStorage.getItem('catslave-room-layouts'))).toBeNull();
  await tap(page, 'room:confirm-save'); await tap(page, 'room:open'); await tap(page, 'room:slots');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.roomLayoutImages.size === 4);
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.roomSlotLayouts[1].unplaced.some(item => item.id === 'wheel'));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('catslave-room-layouts')!));
  expect(saved.activeSlot).toBe(1); expect(saved.slots[0].placed.wheel).toBeDefined(); expect(saved.slots[1].placed.wheel).toBeUndefined();
  await capture(page, `layout-grid-${info.project.name}`);
  await tap(page, 'room:load-slot:0'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed.wheel)).toBeDefined();
  await tap(page, 'room:cancel'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomLayout.layout.placed.wheel)).toBeUndefined();
});

test('simple editor uses drag, selection overlays and reversible top/free views', async ({ page }, info) => {
  await seed(page, spareTable()); await freePlay(page); await tap(page, 'room:open');
  const controls = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.map(hit => hit.id));
  expect(controls.filter(id => ['room:items', 'room:view'].includes(id))).toHaveLength(2);
  for (const id of ['snap', 'fit', 'reset']) expect(controls).toContain(`room:${id}`);
  for (const id of ['left', 'right', 'up', 'down', 'turn', 'store', 'rotate', 'tools', 'in', 'out', 'unplaced']) expect(controls).not.toContain(`room:${id}`);
  await capture(page, `simple-editor-${info.project.name}`);
  await item(page, 'table-1');
  const overlay = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return { hits: t.hud.controls.filter(hit => ['room:store', 'room:rotate'].includes(hit.id)), viewport: t.world.viewport };
  });
  expect(overlay.hits).toHaveLength(2);
  for (const hit of overlay.hits) {
    expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44);
    expect(hit.y).toBeGreaterThanOrEqual(overlay.viewport.y); expect(hit.y + hit.h).toBeLessThanOrEqual(overlay.viewport.y + overlay.viewport.h);
  }
  await capture(page, `simple-editor-selected-${info.project.name}`);
  const from = await project(page, -2, .7, 0), to = await project(page, -1.5, .7, 0);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 5 }); await page.mouse.up();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'].x)).toBeCloseTo(-1.5);
  const top = await page.evaluate(() => (window.__CATSLAVE_TEST__ as Hooks).editorView!.camera.toJSON());
  const draft = await page.evaluate(() => JSON.stringify(window.__CATSLAVE_TEST__.hud.roomEditor!.draft));
  await tap(page, 'room:view');
  expect(await page.evaluate(() => (window.__CATSLAVE_TEST__ as Hooks).editorView!.camera.type)).toBe('PerspectiveCamera');
  const empty = await project(page, 1, 0, 0);
  const before = await page.evaluate(() => (window.__CATSLAVE_TEST__ as Hooks).editorView!.camera.position.toArray());
  await page.mouse.move(empty.x, empty.y); await page.mouse.down(); await page.mouse.move(empty.x + 45, empty.y + 12, { steps: 4 }); await page.mouse.up();
  expect(await page.evaluate(() => (window.__CATSLAVE_TEST__ as Hooks).editorView!.camera.position.toArray())).not.toEqual(before);
  expect(await page.evaluate(() => JSON.stringify(window.__CATSLAVE_TEST__.hud.roomEditor!.draft))).toBe(draft);
  await capture(page, `simple-editor-free-view-${info.project.name}`);
  await tap(page, 'room:view');
  expect(await page.evaluate(() => (window.__CATSLAVE_TEST__ as Hooks).editorView!.camera.toJSON())).toEqual(top);
  await tap(page, 'room:store');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'])).toBeUndefined();
  await tap(page, 'room:undo');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'].x)).toBeCloseTo(-1.5);
  await tap(page, 'language'); await capture(page, `simple-editor-cantonese-${info.project.name}`);
  await tap(page, 'room:cancel');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomLayout.layout.placed['table-1'].x)).toBe(-2);
});

test('stores furniture in inventory, persists it without update warnings, and places it back', async ({ page }, info) => {
  await seed(page); await freePlay(page); await tap(page, 'room:open');
  const original = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed.wheel);
  await item(page, 'wheel'); await tap(page, 'room:store');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.unplaced)).toContainEqual({
    id: 'wheel', pose: original, reason: 'Stored in inventory', stored: true,
  });
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.world.roomRoot.getObjectByName('furniture:wheel')?.visible)).toBe(false);
  await tap(page, 'room:undo');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed.wheel)).toEqual(original);
  await tap(page, 'room:redo');
  await capture(page, `inventory-controls-${info.project.name}`);
  await tap(page, 'room:unplaced'); await capture(page, `inventory-panel-${info.project.name}`);
  await tap(page, 'room:close-panel'); await tap(page, 'room:save'); await tap(page, 'room:save-slot:0');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomLayout.spots.some(spot => spot.id === 'wheel'))).toBe(false);
  await page.reload(); await ready(page); await freePlay(page, false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
  await tap(page, 'room:open'); await item(page, 'wheel', 'unplaced');
  const point = await project(page, original.x, 0, original.z);
  await page.touchscreen.tap(point.x, point.y);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed.wheel)).toBeDefined();
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.unplaced)).toEqual([]);
  await tap(page, 'room:cancel');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomLayout.layout.placed.wheel)).toBeUndefined();
});

test('visual furniture grid groups copies and uses actual model previews with room and inventory controls', async ({ page }, info) => {
  const layout = defaultRoomLayout();
  for (const id of ['chair-2', 'chair-4']) {
    layout.unplaced.push({ id, pose: layout.placed[id], reason: 'Stored in inventory', stored: true }); delete layout.placed[id];
  }
  await seed(page, layout); await freePlay(page); await tap(page, 'room:open'); await tap(page, 'room:items');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.roomThumbnailIds.every(id => window.__CATSLAVE_TEST__.hud.roomThumbnails.has(id)));
  while (!await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.some(hit => hit.id === 'room:group:chairs'))) {
    await tap(page, 'room:next');
    await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.roomThumbnailIds.every(id => window.__CATSLAVE_TEST__.hud.roomThumbnails.has(id)));
  }
  const gallery = await page.evaluate(() => {
    const hud = window.__CATSLAVE_TEST__.hud;
    const preview = hud.roomThumbnails.get('chair-1')!, pixels = preview.getContext('2d')!.getImageData(0, 0, preview.width, preview.height).data;
    let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) visible++;
    return { groups: hud.controls.filter(hit => hit.id.startsWith('room:group:')).map(hit => hit.id),
      copies: hud.controls.filter(hit => hit.id.startsWith('room:item:chair-')), visible };
  });
  expect(gallery.groups.filter(id => id === 'room:group:chairs')).toHaveLength(1);
  expect(gallery.copies).toHaveLength(4); expect(gallery.visible).toBeGreaterThan(1000);
  gallery.copies.forEach(hit => { expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44); });
  expect(gallery.copies.find(hit => hit.id === 'room:item:chair-1')?.label).toContain('In the room');
  expect(gallery.copies.find(hit => hit.id === 'room:item:chair-2')?.label).toContain('inventory');
  await capture(page, `furniture-grid-${info.project.name}`);
  while (await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.some(hit => hit.id === 'room:next'))) {
    await tap(page, 'room:next');
    await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.roomThumbnailIds.every(id => window.__CATSLAVE_TEST__.hud.roomThumbnails.has(id)));
    const index = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomPage);
    await capture(page, `furniture-grid-page-${index + 1}-${info.project.name}`);
  }
  const previews = await page.evaluate(() => [...window.__CATSLAVE_TEST__.hud.roomThumbnails].map(([id, canvas]) => {
    const { width, height } = canvas, pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    let clipped = 0, visible = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (pixels[(y * width + x) * 4 + 3]) {
      visible++; if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) clipped++;
    }
    return { id, clipped, visible };
  }));
  expect(previews).toHaveLength(12);
  previews.forEach(preview => { expect(preview.clipped, preview.id).toBe(0); expect(preview.visible, preview.id).toBeGreaterThan(200); });
  expect((await page.evaluate(() => window.__CATSLAVE_TEST__.stats()) as { calls: number }).calls).toBeLessThan(10);
  await tap(page, 'room:filter:inventory');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.filter(hit => hit.id.startsWith('room:group:')).map(hit => hit.id))).toEqual(['room:group:chairs']);
  await capture(page, `furniture-grid-inventory-${info.project.name}`);
  await tap(page, 'room:item:chair-2');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.selectedId)).toBe('chair-2');
  await tap(page, 'room:items'); await tap(page, 'room:filter:room');
  while (!await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.some(hit => hit.id === 'room:group:chairs'))) await tap(page, 'room:next');
  await tap(page, 'room:group:chairs');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.selectedId)).toBe('chair-1');
  await tap(page, 'room:store'); await tap(page, 'room:unplaced');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.unplaced.filter(item => item.id.startsWith('chair-')).length)).toBe(3);
  await tap(page, 'room:close-panel'); await tap(page, 'language'); await tap(page, 'room:items');
  await capture(page, `furniture-grid-cantonese-${info.project.name}`);
  if (info.project.name === 'mobile-chromium') {
    await page.setViewportSize({ width: 320, height: 568 });
    await capture(page, 'furniture-grid-small-phone');
    const controls = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls);
    controls.forEach(hit => { expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44); });
    await page.setViewportSize({ width: 1280, height: 900 }); await capture(page, 'furniture-grid-landscape-phone');
  }
});

test('desktop furniture gallery supports mouse selection', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });
  try {
    const page = await context.newPage(); await seed(page);
    await tap(page, 'free-play', 'mouse'); await tap(page, 'room:open', 'mouse'); await tap(page, 'room:items', 'mouse');
    await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.roomThumbnailIds.every(id => window.__CATSLAVE_TEST__.hud.roomThumbnails.has(id)));
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.rotateRequired)).toBe(false);
    await capture(page, 'furniture-grid-desktop');
    await tap(page, 'room:item:chair-3', 'mouse');
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.selectedId)).toBe('chair-3');
  } finally { await context.close(); }
});

test('editor freezes cats, preserves camera and slots on cancel, and supports keyboard history', async ({ page, browser }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await seed(page); await freePlay(page);
  const before = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return { cats: JSON.stringify(t.game.cats), clock: t.game.clock, camera: t.world.camera.toJSON(), stored: localStorage.getItem('catslave-room-layouts') };
  });
  await tap(page, 'room:open');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('room-editor');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.scene.children.filter(c => c.userData.catId !== undefined && c.visible).length)).toBe(0);
  await item(page, 'table-1');
  const original = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1']);
  await page.keyboard.press('ArrowRight');
  const moved = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1']);
  expect(moved.x).toBeCloseTo(original.x + .25);
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'])).toEqual(original);
  await page.keyboard.press('Control+y');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'])).toEqual(moved);
  await capture(page, `editor-${info.project.name}`);
  await tap(page, 'language');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('yue-Hant');
  await capture(page, `editor-cantonese-${info.project.name}`); await tap(page, 'language');
  const ids = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls);
  for (const hit of ids) { expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44); }
  await tap(page, 'room:cancel');
  const after = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return { cats: JSON.stringify(t.game.cats), clock: t.game.clock, camera: t.world.camera.toJSON(), stored: localStorage.getItem('catslave-room-layouts') };
  });
  expect(after).toEqual(before); expect(errors).toEqual([]);
  const baseURL = new URL(page.url()).origin;
  await page.close(); // Do not render two furnished rooms simultaneously on software WebGL.
  const desktopContext = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false, reducedMotion: 'reduce' });
  try {
    const desktop = await desktopContext.newPage(); await seed(desktop); await tap(desktop, 'free-play', 'mouse');
    if (await desktop.evaluate(() => window.__CATSLAVE_TEST__.game.phase === 'room-notice')) await tap(desktop, 'room:notice-continue', 'mouse');
    await tap(desktop, 'room:open', 'mouse'); await capture(desktop, `editor-desktop-${info.project.name}`);
    await desktop.screenshot({ path: `artifacts/room-editor/desktop-viewport-${info.project.name}.png` });
    await tap(desktop, 'room:cancel', 'mouse');
    expect(await desktop.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
  } finally { await desktopContext.close(); }
});

test('real furniture drag, rotation and save-to-another-slot survive reload', async ({ page }, info) => {
  await seed(page, spareTable()); await freePlay(page); await tap(page, 'room:open');
  const from = await project(page, -2, .85, 0);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(from.x + 24, from.y, { steps: 4 }); await page.mouse.up();
  const moved = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1']);
  expect(moved.x).toBeGreaterThan(-2);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.selectedId)).toBe('table-1');
  await tap(page, 'room:rotate');
  const finalPose = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1']);
  expect(finalPose.turn).toBe(1);
  await tap(page, 'room:save'); await tap(page, 'room:save-slot:1'); await tap(page, 'room:confirm-save');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem('catslave-room-layouts')!));
  expect(record.activeSlot).toBe(1); expect(record.slots[0].placed['table-1']).toEqual(spareTable().placed['table-1']);
  expect(record.slots[1].placed['table-1']).toEqual(finalPose);
  await page.reload(); await ready(page); await freePlay(page);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomLayout.layout.placed['table-1'])).toEqual(finalPose);
  await tap(page, 'room:open'); await capture(page, `saved-slot-${info.project.name}`);
  await tap(page, 'room:cancel');
  await tap(page, 'pause'); await tap(page, 'home'); await tap(page, 'confirm-home'); await tap(page, 'start');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomLayout.layout.placed['table-1'])).toEqual(defaultRoomLayout().placed['table-1']);
});

test('updated-room reconciliation omits invalid furniture, alerts once and supports recovery', async ({ page }, info) => {
  const layout = defaultRoomLayout(); layout.placed['table-1'] = { x: 99, z: 99, turn: 0 };
  await seed(page, layout); await freePlay(page, false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('room-notice');
  const state = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; let visible: boolean | undefined;
    t.world.roomRoot.traverse(object => { if (object.userData.furnitureId === 'table-1') visible = object.visible; });
    return { layout: t.game.roomLayout.layout, notice: t.hud.roomNotice, visible, stored: JSON.parse(localStorage.getItem('catslave-room-layouts')!) };
  });
  expect(state.layout.placed['table-1']).toBeUndefined(); expect(state.visible).toBe(false);
  expect(state.notice!.unplaced.find(item => item.id === 'table-1')?.reason).toMatch(/outside/i);
  expect(state.stored.slots[0].placed['table-1'].x).toBe(99);
  await capture(page, `update-notice-${info.project.name}`);
  await tap(page, 'room:notice-continue');
  await page.reload(); await ready(page); await freePlay(page, false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
  await tap(page, 'room:open'); await item(page, 'table-1', 'unplaced');
  const destination = await project(page, -2, 0, 0); await page.touchscreen.tap(destination.x, destination.y);
  const recovered = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1']);
  expect(recovered.x).toBeCloseTo(-2); expect(recovered.z).toBeCloseTo(0); expect(recovered.turn).toBe(0);
  await tap(page, 'room:undo'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'])).toBeUndefined();
  await tap(page, 'room:redo'); await tap(page, 'room:save'); await tap(page, 'room:save-slot:0');
  const applied = await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomLayout.layout.placed['table-1']);
  expect(applied.x).toBeCloseTo(-2); expect(applied.z).toBeCloseTo(0); expect(applied.turn).toBe(0);
});

test('real two-finger editor gestures cancel furniture drag and survive pointer cancellation', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Real multi-touch injection uses Chromium CDP.');
  await seed(page, spareTable()); await freePlay(page); await tap(page, 'room:open');
  const client = await context.newCDPSession(page), from = await project(page, -2, .85, 0);
  const send = async (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', touchPoints: { id: number; x: number; y: number }[]) => {
    await client.send('Input.dispatchTouchEvent', { type, touchPoints });
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  };
  await send('touchStart', [{ id: 1, ...from }]);
  await send('touchMove', [{ id: 1, x: from.x + 10, y: from.y }]);
  await send('touchStart', [{ id: 1, x: from.x + 10, y: from.y }, { id: 2, x: from.x + 60, y: from.y }]);
  const before = await page.evaluate(() => (window.__CATSLAVE_TEST__ as Hooks).editorView!.camera.zoom);
  await send('touchMove', [{ id: 1, x: from.x - 10, y: from.y + 10 }, { id: 2, x: from.x + 90, y: from.y + 10 }]);
  expect(await page.evaluate(() => (window.__CATSLAVE_TEST__ as Hooks).editorView!.camera.zoom)).toBeGreaterThan(before);
  await send('touchCancel', []);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'])).toEqual(spareTable().placed['table-1']);
  await tap(page, 'room:fit'); await item(page, 'table-1'); await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'].x)).toBeCloseTo(-1.75);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('room-editor');
  await tap(page, 'room:cancel'); expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
});

test('native import/export and denied storage preserve the draft and support session-only use', async ({ page }) => {
  await seed(page); await freePlay(page); await tap(page, 'room:open'); await tap(page, 'room:slots');
  const downloadEvent = page.waitForEvent('download'); await tap(page, 'room:export');
  const download = await downloadEvent, exported = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(exported.formatVersion).toBe(1); expect(Object.keys(exported.layout.placed)).toHaveLength(18);
  const imported = spareTable(); imported.placed['table-1'].x = -1.5;
  const chooserEvent = page.waitForEvent('filechooser'); await tap(page, 'room:import');
  const chooser = await chooserEvent;
  await chooser.setFiles({ name: 'room-layout.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ formatVersion: 1, layout: imported })) });
  await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'].x)).toBe(-1.5);
  expect(await page.evaluate(() => localStorage.getItem('catslave-room-layouts'))).toBeNull();
  await tap(page, 'room:close-panel'); await tap(page, 'room:undo');
  expect(await page.evaluate(() => Object.keys(window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed).length)).toBe(18);
  await tap(page, 'room:redo');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'catslave-room-layouts') throw new DOMException('Storage denied', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await tap(page, 'room:save'); await tap(page, 'room:save-slot:0');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomPanel)).toBe('storage');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.roomEditor!.draft.placed['table-1'].x)).toBe(-1.5);
  await tap(page, 'room:session');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('free-play');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.roomLayout.layout.placed['table-1'].x)).toBe(-1.5);
  expect(await page.evaluate(() => localStorage.getItem('catslave-room-layouts'))).toBeNull();
});
