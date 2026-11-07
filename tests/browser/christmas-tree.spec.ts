import { expect, test, type Page } from '@playwright/test';
import type { Mesh, MeshStandardMaterial } from 'three';
import { mkdir, writeFile } from 'node:fs/promises';

test.use({ deviceScaleFactor: 1, reducedMotion: 'no-preference' });

async function capture(page: Page, name: string) {
  const data = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.refresh();
    t.world.camera.position.set(-1.8, 2.6, 3.3); t.world.camera.lookAt(-1.8, 1.3, -2);
    return t.captureFrame();
  });
  await mkdir('artifacts/tree', { recursive: true });
  await writeFile(`artifacts/tree/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
}

test('movable Blender tree pulses and a cat climbs then safely slips down', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__CATSLAVE_TEST__?.world.roomEditable && window.__CATSLAVE_TEST__.world.roomRoot.getObjectByName('Christmas tree')?.userData.loaded);
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
    t.game.restoreFreePlay(['Choco', 'Latte', 'Yelo', 'Miller', 'Momo']); t.game.startFreePlay();
    const layout = structuredClone(t.game.roomLayout.layout);
    layout.placed['christmas-tree'] = { x: -1.8, z: -2, turn: 0 };
    if (!t.game.applyRoomLayout(layout)) throw new Error('Cannot move tree');
    t.game.cats.forEach(cat => { cat.nextNeedAt = Infinity; cat.decisionAt = Infinity; });
    t.refresh();
  });
  const moved = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, root = t.world.roomRoot.getObjectByName('furniture:christmas-tree')!;
    return { x: root.position.x, z: root.position.z, approach: t.game.roomLayout.spots.find(s => s.id === 'christmas-tree')!.route[0] };
  });
  expect(moved).toMatchObject({ x: -1.8, z: -2 });
  expect(moved.approach.x).toBeCloseTo(-1.8); expect(moved.approach.z).toBeCloseTo(-.85);
  const light = () => page.evaluate(() => {
    const tree = window.__CATSLAVE_TEST__.world.roomRoot.getObjectByName('Christmas tree')!;
    const values: number[] = [];
    tree.traverse(object => { const mesh = object as Mesh; if (!mesh.isMesh) return;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (mat.name.startsWith('TreeLights_')) values.push((mat as MeshStandardMaterial).emissiveIntensity);
    }); return values;
  });
  const initial = await light(); expect(initial.length).toBeGreaterThan(0);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.clock += .5; t.refresh(); });
  expect(await light()).not.toEqual(initial);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => window.__CATSLAVE_TEST__.refresh());
  expect((await light()).every(value => value === 1.6)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, cat = t.game.cats[0], p = t.game.roomLayout.spots.find(s => s.id === 'christmas-tree')!.route[0];
    cat.position = { x: p.x, z: p.z }; cat.destination = { ...cat.position }; cat.yaw = Math.PI;
    if (!t.game.visitFurniture(cat.id, 'christmas-tree')) throw new Error('Tree visit rejected');
    for (let i = 0; i < 40 && cat.visit?.phase !== 'use'; i++) t.game.tick(.05);
    if (cat.visit?.phase !== 'use') throw new Error('Never reached tree');
    t.refresh();
  });
  await capture(page, 'approach');
  const heights: number[] = [];
  for (let stage = 0; stage < 8; stage++) {
    heights.push(await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; for (let i = 0; i < 8; i++) t.game.tick(.05); t.refresh(); return t.game.cats[0].elevation; }));
    if ([0, 2, 4, 7].includes(stage)) await capture(page, `climb-${stage}`);
  }
  expect(Math.max(...heights)).toBeGreaterThan(.4); expect(heights.at(-1)).toBe(0);
  await page.evaluate(() => window.__CATSLAVE_TEST__.game.tick(.1));
  expect(await page.evaluate(() => !!window.__CATSLAVE_TEST__.game.cats[0].visit)).toBe(false);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.hp)).toBe(100);
  await page.evaluate(() => { const t = window.__CATSLAVE_TEST__; t.game.festiveDecorations = false; t.refresh(); });
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.world.roomRoot.getObjectByName('Christmas tree')!.visible)).toBe(false);
  expect(await page.evaluate(() => { const g = window.__CATSLAVE_TEST__.game; return g.visitFurniture(g.cats[0].id, 'christmas-tree'); })).toBe(false);
  expect(errors).toEqual([]);
  await writeFile('artifacts/tree/browser-diagnostics.json', JSON.stringify(await page.evaluate(() => window.__CATSLAVE_TEST__.stats()), null, 2));
});
