import { test, expect } from '@playwright/test';
import { WHEEL } from '../../src/furniture';
import { writeFile } from 'node:fs/promises';

test('expanded room has the projecting wall, clear wheel entry and a separate drum', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.scene.getObjectByName('video-lounge')?.userData.loaded);
  const result = await page.evaluate(async w => {
    const path = '/node_modules/three/build/three.module.js';
    const THREE = await import(/* @vite-ignore */ path);
    const room = window.__CATSLAVE_TEST__.world.scene.getObjectByName('video-lounge')!;
    room.updateMatrixWorld(true);
    const cast = (p: number[], d: number[]) => new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d)).intersectObject(room, true);
    const rotor = room.getObjectByProperty('name', 'CatWheelRotor')!;
    return {
      rotor: !!rotor?.userData.catWheelRotor,
      center: rotor?.getWorldPosition(new THREE.Vector3()).toArray(),
      // Sample a board face; Z=4 is an intentional gap between staggered planks.
      expandedFloor: cast([-6, 1, 4.25], [0, -1, 0])[0]?.point.y,
      projectingWall: cast([0, 2, -3], [1, 0, 0])[0]?.point.x,
      shelfWallFront: cast([3.2, 2, 0], [0, 0, -1])[0]?.point.z,
      shelfTop: cast([3.2, 2, -.83], [0, -1, 0])[0]?.point.y,
      wheelLanding: cast([w.x, .6, w.z], [0, -1, 0])[0]?.point.y,
      openCenter: cast([w.x, w.centerY, 5], [0, 0, 1])[0]?.point.z,
    };
  }, WHEEL);
  expect(result.rotor).toBe(true);
  expect(result.center![0]).toBeCloseTo(WHEEL.x);
  expect(result.center![1]).toBeCloseTo(WHEEL.centerY);
  expect(result.center![2]).toBeCloseTo(WHEEL.z);
  expect(result.expandedFloor).toBeCloseTo(0);
  expect(result.projectingWall).toBeCloseTo(1.3, 2);
  expect(result.shelfWallFront).toBeCloseTo(-1.1, 2);
  expect(result.shelfTop).toBeCloseTo(1.3, 2);
  expect(result.wheelLanding).toBeCloseTo(WHEEL.height, 2);
  expect(result.openCenter).toBeGreaterThan(7.9);
});

test('tap invites the selected cat to run, pauses freeze the drum, and care returns it to the floor', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.scene.getObjectByName('video-lounge')?.userData.loaded);
  await page.evaluate(w => {
    const t = window.__CATSLAVE_TEST__;
    t.setManualClock(true); t.game.reset(); t.game.phase = 'free-play'; t.game.events = [];
    const cat = t.game.cats[0]; cat.nextNeedAt = Infinity; cat.decisionAt = Infinity;
    cat.position = { x: w.x, z: 4.3 }; cat.destination = { ...cat.position };
    t.game.selectedFreeCatId = cat.id; t.game.freeInteraction = 'pet'; t.refresh();
    t.world.zoomView(.85 - t.world.viewZoom);
    t.world.camera.position.set(w.x, 1.6, 2.6);
    t.world.camera.lookAt(w.x, 1.35, w.z);
    t.world.setViewOrientation(t.world.camera.quaternion.clone());
  }, WHEEL);
  await page.waitForTimeout(300);
  const hits = await page.evaluate(async w => {
    const path = '/node_modules/three/build/three.module.js';
    const THREE = await import(/* @vite-ignore */ path);
    const { world } = window.__CATSLAVE_TEST__;
    const at = (x: number, y: number) => world.project(new THREE.Vector3(x, y, w.z - .496));
    const center = at(w.x, w.centerY);
    const result = { center: world.wheelHit(center), rim: world.wheelHit(at(w.x + 1.25, w.centerY)),
      outside: world.wheelHit(at(w.x + 1.29, w.centerY + 1.29)), occluded: true };
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, .2), new THREE.MeshBasicMaterial());
    blocker.position.set(w.x, w.centerY, 4.5);
    const room = world.scene.getObjectByName('video-lounge')!; room.add(blocker);
    result.occluded = world.wheelHit(center);
    blocker.removeFromParent(); blocker.geometry.dispose(); blocker.material.dispose();
    return result;
  }, WHEEL);
  expect(hits).toEqual({ center: true, rim: true, outside: false, occluded: false });
  const center = await page.evaluate(async w => {
    const path = '/node_modules/three/build/three.module.js';
    const THREE = await import(/* @vite-ignore */ path);
    return window.__CATSLAVE_TEST__.world.project(new THREE.Vector3(w.x,w.centerY,w.z-.496));
  }, WHEEL);
  await page.touchscreen.tap(center.x, center.y);
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].visit?.id)).toBe('wheel');
  expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.feedback)).toContain('is heading to the wheel!');
  const run = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    for (let i=0;i<800 && t.game.wheelSpeed < 1.2;i++) t.game.tick(.05);
    t.refresh();
    const rotor = t.world.scene.getObjectByName('CatWheelRotor')!;
    return { activity: t.game.cats[0].activity, angle: t.game.wheelAngle,
      speed: t.game.wheelSpeed, rotation: rotor.quaternion.toArray(), stride: t.game.cats[0].stride };
  });
  expect(run.activity).toBe('running'); expect(run.speed).toBeGreaterThan(1.1);
  await writeFile(`artifacts/lounge/wheel-running-${info.project.name}.png`, Buffer.from(
    (await page.evaluate(() => window.__CATSLAVE_TEST__.captureFrame())).split(',')[1], 'base64'));
  const paused = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.pause(); const before = t.game.wheelAngle;
    t.game.tick(3); t.refresh();
    return { before, after: t.game.wheelAngle, rotation: t.world.scene.getObjectByName('CatWheelRotor')!.quaternion.toArray() };
  });
  expect(paused.after).toBe(paused.before); expect(paused.rotation).toEqual(run.rotation);
  const moving = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__; t.game.resume(); t.game.tick(.18); t.refresh();
    return { angle: t.game.wheelAngle, stride: t.game.cats[0].stride,
      rotation: t.world.scene.getObjectByName('CatWheelRotor')!.quaternion.toArray() };
  });
  expect(moving.angle).toBeLessThan(run.angle); expect(moving.stride).toBeGreaterThan(run.stride);
  expect(moving.rotation).not.toEqual(run.rotation);
  await writeFile(`artifacts/lounge/wheel-stride-${info.project.name}.png`, Buffer.from(
    (await page.evaluate(() => window.__CATSLAVE_TEST__.captureFrame())).split(',')[1], 'base64'));
  const exit = await page.evaluate(() => {
    const t=window.__CATSLAVE_TEST__, cat=t.game.cats[0];
    t.game.interactFreeCat('wand',cat.id);
    for(let i=0;i<800 && cat.visit;i++) t.game.tick(.05);
    t.refresh(); return { visit: cat.visit, elevation: cat.elevation, speed: t.game.wheelSpeed, x: cat.position.x, z: cat.position.z };
  });
  expect(exit.visit).toBeUndefined(); expect(exit.elevation).toBe(0); expect(exit.speed).toBe(0);
  expect(exit.z).toBeLessThan(WHEEL.z-.8); expect(errors).toEqual([]);
});
