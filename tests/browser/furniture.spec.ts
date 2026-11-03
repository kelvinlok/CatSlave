import { expect, test } from '@playwright/test';
import { FURNITURE } from '../../src/furniture';
import { writeFile } from 'node:fs/promises';

test('sunroom seats face the window with clear glass behind them and an open side passage', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.scene.getObjectByName('video-lounge')?.userData.loaded === true);
  const result = await page.evaluate(async () => {
    const path = '/node_modules/three/build/three.module.js';
    const THREE = await import(/* @vite-ignore */ path);
    const room = window.__CATSLAVE_TEST__.world.scene.getObjectByName('video-lounge')!;
    room.updateMatrixWorld(true);
    const cast = (p: number[], d: number[]) => new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d)).intersectObject(room, true);
    const divider = cast([4, 2.9, 1.5], [1, 0, 0])[0];
    const material = Array.isArray(divider.object.material) ? divider.object.material[divider.face!.materialIndex] : divider.object.material;
    return {
      glassX: divider.point.x,
      transmission: material.transmission,
      doorwayFirstX: cast([4, 1, -.275], [1, 0, 0])[0].point.x,
      seats: [3.25, 4.8].map(z => [5.5, 6.2, 7.05].map(x => cast([x, 3, z], [0, -1, 0])[0].point.y)),
    };
  });
  expect(result.glassX).toBeCloseTo(5.041, 2);
  expect(result.transmission).toBeGreaterThan(.9);
  expect(result.doorwayFirstX).toBeGreaterThan(8);
  for (const [back, seat, footstool] of result.seats) {
    expect(back).toBeGreaterThan(2);
    expect(seat).toBeCloseTo(.8, 1);
    expect(footstool).toBeCloseTo(.675, 1);
  }
});

test('shifted pod keeps its cavity and glass lid, with a clear aisle beside the bed', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.scene.getObjectByName('video-lounge')?.userData.loaded === true);
  const result = await page.evaluate(async () => {
    const path = '/node_modules/three/build/three.module.js';
    const THREE = await import(/* @vite-ignore */ path);
    const room = window.__CATSLAVE_TEST__.world.scene.getObjectByName('video-lounge')!;
    room.updateMatrixWorld(true);
    const cast = (p: number[], d: number[]) => new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d)).intersectObject(room, true);
    const material = (hit: any) => Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
    const door = cast([0, .79, -6.1], [0, 0, -1])[0];
    const top = cast([0, 1.5, -7.05], [0, -1, 0]);
    return {
      doorwayFirstZ: door.point.z,
      lidHeight: top[0].point.y,
      lidTransmission: material(top[0]).transmission,
      opaqueSurfaceBelowLid: top.find((hit: any) => !(material(hit).transmission > .9))?.point.y,
      // The relocated flower bed now occupies part of the former chair footprint.
      clearedFloor: [[-.9, -4.75], [.9, -2.3]].map(([x,z]) => cast([x, 2, z], [0, -1, 0])[0].point.y),
    };
  });
  expect(result.doorwayFirstZ).toBeLessThan(-7.3);
  expect(result.lidHeight).toBeCloseTo(1.171, 2);
  expect(result.lidTransmission).toBeGreaterThan(.9);
  expect(result.opaqueSurfaceBelowLid).toBeLessThan(.6);
  for (const height of result.clearedFloor) expect(height).toBeLessThan(.05);
});

test('Blender lounge supports each authored furniture landing', async ({ page }) => {
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.world.scene.getObjectByName('video-lounge')?.userData.loaded === true);
  const landings = FURNITURE.map(spot => ({ id: spot.id, ...spot.route.at(-1)! }));
  const contacts = await page.evaluate(async landings => {
    const path = '/node_modules/three/build/three.module.js';
    const THREE = await import(/* @vite-ignore */ path);
    const room = window.__CATSLAVE_TEST__.world.scene.getObjectByName('video-lounge')!;
    room.updateMatrixWorld(true);
    return landings.map(point => {
      const ray = new THREE.Raycaster(new THREE.Vector3(point.x, point.height + 0.18, point.z), new THREE.Vector3(0, -1, 0), 0, 0.4);
      const hit = ray.intersectObject(room, true)[0];
      return { id: point.id, expected: point.height, actual: hit?.point.y };
    });
  }, landings);
  for (const contact of contacts) {
    expect(contact.actual, `${contact.id} has a solid surface beneath its paws`).toBeDefined();
    expect(Math.abs(contact.actual! - contact.expected), contact.id).toBeLessThan(0.12);
  }
});

test('cats use the Blender lounge furnishings in the rendered room', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.world.scene.getObjectByName('video-lounge')?.userData.loaded === true);
  for (const id of ['tree', 'box', 'window', 'cabinet', 'sun', 'rug', 'bench', 'bed', 'post']) {
    const result = await page.evaluate(id => {
      const t = window.__CATSLAVE_TEST__; t.setManualClock(true); t.game.reset();
      t.game.phase = 'tutorial'; t.game.events = []; t.game.tutorialDone = false;
      if (id === 'window') {
        // The sunroom window is a Free Play destination; keep one resident for this landing inspection.
        t.game.restoreFreePlay(['Choco', 'Latte', 'Yelo', 'Miller', 'Momo']);
        t.game.phase = 'title'; t.game.startFreePlay(); t.game.cats = t.game.cats.slice(0, 1);
      }
      const cat = t.game.cats[0]; cat.nextNeedAt = Infinity;
      t.game.visitFurniture(cat.id, id);
      for (let i = 0; i < 800 && cat.visit?.phase !== 'use'; i++) t.game.tick(0.05);
      // Let the cat settle into its facing without starting the departure.
      t.game.tick(0.6); if (id !== 'window') t.game.phase = 'playing'; t.refresh();
      t.world.focusOn(t.world.catPosition(cat.id)!); t.refresh();
      return { phase: cat.visit?.phase, gamePhase: t.game.phase, activity: cat.activity, elevation: cat.elevation,
        screen: t.world.project(t.world.catPosition(cat.id)!) };
    }, id);
    expect(result.phase).toBe('use');
    expect(result.gamePhase).toBe(id === 'window' ? 'free-play' : 'playing');
    expect(result.screen.visible).toBe(true);
    expect(result.screen.x).toBeGreaterThan(0); expect(result.screen.x).toBeLessThan(page.viewportSize()!.width);
    expect(result.screen.y).toBeGreaterThan(0); expect(result.screen.y).toBeLessThan(page.viewportSize()!.height);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    if (['tree', 'box', 'window', 'bench', 'post'].includes(id)) await writeFile(
      `artifacts/furniture-${id}-${info.project.name}.png`,
      Buffer.from((await page.evaluate(() => window.__CATSLAVE_TEST__.captureFrame())).split(',')[1], 'base64'));
  }
  expect(errors).toEqual([]);
});
