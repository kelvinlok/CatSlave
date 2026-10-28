import { test, expect } from '@playwright/test';
import type * as THREE from 'three';

test('every grooming preview stays centered when switching cats repeatedly', async ({ page }, info) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  const bounds = await page.evaluate(async () => {
    const path = '/node_modules/three/build/three.module.js';
    const { Box3, Vector3 } = await import(path) as typeof THREE;
    const t = window.__CATSLAVE_TEST__;
    t.game.restoreAdoptedCats(['Choco', 'Latte', '的的', '小塞', 'Yelo', 'Miller', 'Momo', '震震子']);
    t.game.phase = 'cat-dex';
    return [0, 1, 2, 3, 4, 5, 6, 7, 0, 7].map(index => {
      t.hud.dexCat = index; t.refresh();
      const root = t.world.dexScene.getObjectByName('dex-cat-model')!;
      root.updateWorldMatrix(true, true); t.world.dexCamera.updateMatrixWorld();
      const box = new Box3();
      root.traverseVisible(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry.getAttribute('position')?.count) box.union(new Box3().setFromObject(mesh, true));
      });
      const points = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        points.push(new Vector3(x, y, z).project(t.world.dexCamera).y);
      }
      return { index, center: box.getCenter(new Vector3()).project(t.world.dexCamera).y, min: Math.min(...points), max: Math.max(...points) };
    });
  });
  await page.screenshot({ path: `test-results/dex-momo-${info.project.name}.png` });
  for (const bound of bounds) {
    expect(Math.abs(bound.center), JSON.stringify(bound)).toBeLessThan(.2);
    expect(bound.min, JSON.stringify(bound)).toBeGreaterThan(-1);
    expect(bound.max, JSON.stringify(bound)).toBeLessThan(1);
  }
});

test('cat dex shows one three-column grid, locks unknown cats and persists adoption', async ({ page }, info) => {
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  async function tap(id: string) {
    const h = await page.evaluate(id => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === id)!, id);
    expect(h).toBeTruthy(); await page.mouse.click(h.x + h.w / 2, h.y + h.h / 2);
  }
  await page.screenshot({ path: `test-results/dex-menu-${info.project.name}.png` });
  await tap('cat-dex');
  const grid = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.filter(h => h.id.startsWith('dex-cat:')));
  expect(grid).toHaveLength(8);
  expect(new Set(grid.map(h => h.x)).size).toBe(3);
  expect(new Set(grid.map(h => h.y)).size).toBe(3);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.some(h => ['dex-next', 'dex-prev'].includes(h.id)))).toBe(false);
  const locked = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.hits.find(h => h.id === 'dex-cat:1')!);
  expect(locked.disabled).toBe(true);
  await page.mouse.click(locked.x + locked.w / 2, locked.y + locked.h / 2);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.dexCat)).toBeUndefined();
  await page.screenshot({ path: `test-results/dex-grid-${info.project.name}.png` });
  await tap('dex-cat:0');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.dexCat)).toBe(0);
  const headPose = () => page.evaluate(() => {
    const root = window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('dex-cat-model')!;
    return root.getObjectByName('head')!.rotation.toArray();
  });
  const before = await headPose();
  await page.screenshot({ path: `test-results/dex-profile-${info.project.name}.png` });
  await expect.poll(headPose).not.toEqual(before);
  await page.screenshot({ path: `test-results/dex-grooming-${info.project.name}.png` });
  const view = await page.evaluate(() => {
    const w = window.__CATSLAVE_TEST__.world;
    return { viewport: w.viewport, camera: w.dexCamera.position.toArray() };
  });
  const v = view.viewport, cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  const rotation = () => page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene
    .getObjectByName('dex-cat-model')!.parent!.quaternion.toArray());
  const originalRotation = await rotation();
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + 70, cy + 50, { steps: 8 }); await page.mouse.up();
  expect(await rotation()).not.toEqual(originalRotation);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.dexCamera.position.toArray())).toEqual(view.camera);
  const turned = await rotation();
  await page.mouse.move(cx - 50, cy - 40);
  expect(await rotation()).toEqual(turned);
  await page.mouse.wheel(0, 250);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.dexCamera.position.toArray())).toEqual(view.camera);
  await tap('dex-reset'); expect(await rotation()).toEqual(originalRotation);
  await page.mouse.move(cx + 100, cy - 90); await page.mouse.down();
  await page.mouse.move(cx + 100, cy + 90, { steps: 10 }); await page.mouse.up();
  expect(Math.abs((await rotation())[2])).toBeGreaterThan(.1);
  await page.screenshot({ path: `test-results/dex-rotated-${info.project.name}.png` });
  await tap('dex-reset');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => !!window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('dex-cat-model'))).toBe(false);
  await tap('dex-back');
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset();
    t.game.cats.forEach(c => { c.nextNeedAt = Infinity; }); t.game.tick(t.game.timeLeft);
    t.finishBonus(); t.game.adopt(t.game.candidates[0].id); t.refresh();
  });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('catslave-cat-dex') ?? '[]'))).toContain('Latte');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  await tap('cat-dex'); await tap('dex-cat:1');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.hud.dexCat)).toBe(1);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('dex-cat-model')!.userData.modelAsset)).toContain('latte');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
});

test('desktop cat dex layout', async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });
  const page = await context.newPage(); await page.goto(baseURL!);
  await expect.poll(() => page.evaluate(() => !!window.__CATSLAVE_TEST__)).toBe(true);
  const h = await page.evaluate(() => window.__CATSLAVE_TEST__.hud.controls.find(h => h.id === 'cat-dex')!);
  const bounds = await page.locator('#game').boundingBox();
  await page.mouse.click(bounds!.x + h.x + h.w / 2, bounds!.y + h.y + h.h / 2);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('cat-dex');
  await page.screenshot({ path: `test-results/dex-desktop-${info.project.name}.png` });
  await context.close();
});
