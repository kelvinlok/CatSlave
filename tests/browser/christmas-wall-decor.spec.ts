import { expect, test, type Page } from '@playwright/test';
import type { Mesh } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ viewport: { width: 1100, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

async function tap(page: Page, id: string) {
  const point = await page.evaluate(id => {
    const hit = window.__CATSLAVE_TEST__.hud.controls.find(hit => hit.id === id)!;
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    return { x: rect.x + hit.x + hit.w / 2, y: rect.y + hit.y + hit.h / 2 };
  }, id);
  await page.mouse.click(point.x, point.y);
}

async function capture(page: Page, name: string, eye: number[], target: number[]) {
  const frame = await page.evaluate(({ eye, target }) => {
    const t = window.__CATSLAVE_TEST__; t.refresh();
    t.world.camera.position.set(eye[0], eye[1], eye[2]); t.world.camera.lookAt(target[0], target[1], target[2]);
    return t.captureFrame();
  }, { eye, target });
  await writeFile(`artifacts/wall-decor-browser/${name}.png`, Buffer.from(frame.split(',')[1], 'base64'));
}

test('Blender stockings and wreath replace fallback and inherit festive switch independently of closet', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('catslave-language', 'en'));
  // A single native cat is sufficient for this wall-kit and closet regression.
  await page.route('**/models/**', route => /(?:lounge|christmas-tree|christmas-wall-decor|choco)\.glb/.test(route.request().url()) ? route.continue() : route.abort());
  await page.goto('/');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.roomRoot.userData.loaded && window.__CATSLAVE_TEST__.world.roomRoot.getObjectByName('Christmas lounge')?.userData.wallDecorLoaded);
  const stats = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
    const parent = t.world.roomRoot.getObjectByName('Christmas lounge')!;
    const asset = parent.getObjectByName('Blender wall decorations')!;
    asset.updateWorldMatrix(true, true);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; let meshes = 0, triangles = 0;
    asset.traverse(object => { const mesh = object as Mesh; if (!mesh.isMesh) return;
      meshes++; const g = mesh.geometry; triangles += (g.index?.count ?? g.attributes.position.count) / 3;
      g.computeBoundingBox(); const box = g.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
      box.min.toArray().forEach((value, i) => min[i] = Math.min(min[i], value));
      box.max.toArray().forEach((value, i) => max[i] = Math.max(max[i], value));
    });
    return { meshes, triangles, min, max, fallback: !!parent.getObjectByName('Wall decoration loading fallback') };
  });
  expect(stats.fallback).toBe(false); expect(stats.meshes).toBeGreaterThan(0); expect(stats.triangles).toBeGreaterThan(100);
  expect(stats.min.every(Number.isFinite) && stats.max.every(Number.isFinite)).toBe(true);
  expect(stats.max[0] - stats.min[0]).toBeGreaterThan(1); expect(stats.max[1] - stats.min[1]).toBeGreaterThan(.5);
  expect(stats.max.every(value => Math.abs(value) < 20)).toBe(true);
  await mkdir('artifacts/wall-decor-browser', { recursive: true });
  await writeFile('artifacts/wall-decor-browser/model-metrics.json', JSON.stringify(stats, null, 2));
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.reset(); t.game.cats.forEach(cat => { cat.nextNeedAt = Infinity; cat.decisionAt = Infinity; }); t.refresh(); });
  await capture(page, 'stockings', [3.2, 2.7, 1.7], [3.2, 2.45, -1.035]);
  await capture(page, 'wreath', [-1.5, 2.8, -3.6], [1.16, 2.7, -3.6]);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.hud.width === 412);
  await capture(page, 'stockings-mobile', [3.2, 2.7, 1.7], [3.2, 2.45, -1.035]);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.phase = 'title'; t.refresh(); });
  const outfit = await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobe.get('choco'));
  await tap(page, 'festive-decorations');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.roomRoot.getObjectByName('Christmas lounge')!.visible)).toBe(false);
  await tap(page, 'wardrobe:open');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe('wardrobe');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.dexScene.getObjectByName('wardrobe-cat-model')!.userData.catOutfit)).toEqual(outfit);
  await tap(page, 'wardrobe:close'); await tap(page, 'festive-decorations');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.roomRoot.getObjectByName('Christmas lounge')!.visible)).toBe(true);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.wardrobe.get('choco'))).toEqual(outfit);
  expect(errors).toEqual([]);
});
