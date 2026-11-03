import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('reference shelf faces the room with speaker and photos, and free-play bowls stay underneath', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.scene.getObjectByName('video-lounge')?.userData.loaded);
  const geometry = await page.evaluate(async () => {
    const path = '/node_modules/three/build/three.module.js';
    const THREE = await import(/* @vite-ignore */ path);
    const room = window.__CATSLAVE_TEST__.world.scene.getObjectByName('video-lounge')!;
    room.updateMatrixWorld(true);
    const cast = (p: number[], d: number[]) => new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d)).intersectObject(room, true);
    const photos: string[] = [];
    room.traverse((object: any) => {
      const material = object.material;
      if (material?.name?.startsWith('Cat photo |') && material.map?.image?.width > 0) photos.push(material.name);
    });
    return {
      front: [1.5, 3.2, 4.7].map(x => cast([x, 2.2, 1], [0, 0, -1])[0]?.point.z),
      top: cast([3.2, 2, -.83], [0, -1, 0])[0]?.point.y,
      speaker: cast([2.12, 1.57, 0], [0, 0, -1])[0]?.point.z,
      floor: [1.88, 2.54, 3.2, 3.86, 4.52].map(x => cast([x, .3, -.58], [0, -1, 0])[0]?.point.y),
      photos,
    };
  });
  geometry.front.forEach(z => expect(z).toBeCloseTo(-1.1, 2));
  expect(geometry.top).toBeCloseTo(1.3, 2);
  expect(geometry.speaker).toBeGreaterThan(-.66); expect(geometry.speaker).toBeLessThan(-.61);
  geometry.floor.forEach(y => { expect(y).toBeGreaterThan(-.03); expect(y).toBeLessThan(.02); });
  expect(new Set(geometry.photos).size).toBe(9);
  await page.evaluate(() => {
    const t=window.__CATSLAVE_TEST__;t.setManualClock(true);
    t.game.restoreFreePlay(['Choco','Latte','Yelo','Miller','Momo']);t.game.startFreePlay();
    t.game.cats.forEach((cat,i)=>{
      cat.position={x:-1.5+i*.7,z:2.5};cat.destination={...cat.position};cat.nextNeedAt=Infinity;cat.decisionAt=Infinity;
    });t.refresh();
    t.world.zoomView(.8-t.world.viewZoom);
    t.world.camera.position.set(2.5,2.2,3.8);t.world.camera.lookAt(3.2,1,-.8);
    t.world.setViewOrientation(t.world.camera.quaternion.clone());t.refresh();
  });
  const bowls = await page.evaluate(() => window.__CATSLAVE_TEST__.world.scene.children
    .filter(object=>object.name.startsWith('free-food-')).map(object=>object.position.toArray()));
  expect(bowls).toHaveLength(5);
  bowls.forEach(([x,y,z])=>{expect(x).toBeGreaterThanOrEqual(1.88-1e-6);expect(x).toBeLessThanOrEqual(4.52+1e-6);expect(z).toBe(-.58);expect(y).toBeLessThan(.03);});
  await writeFile(`artifacts/lounge/feeding-shelf-${info.project.name}.png`,Buffer.from(
    (await page.evaluate(()=>window.__CATSLAVE_TEST__.captureFrame())).split(',')[1],'base64'));
  const eating = await page.evaluate(()=>{
    const t=window.__CATSLAVE_TEST__,cat=t.game.cats[0];
    t.game.cats=t.game.cats.slice(0,1);cat.position={x:3.2,z:1.02};cat.destination={...cat.position};cat.decisionAt=0;cat.activity='idle';
    t.game.freeRoam.reset([cat],0);
    const random={between:(min:number,max:number)=>(min+max)/2};
    for(let time=18;time<24;time+=.05)t.game.freeRoam.update([cat],time,.05,random);
    t.refresh();return {activity:cat.activity,x:cat.position.x,z:cat.position.z,yaw:cat.yaw,
      bowls:t.world.scene.children.filter(object=>object.name.startsWith('free-food-')).map(object=>object.position.toArray())};
  });
  expect(eating.activity).toBe('eating');expect(eating.x).toBeCloseTo(3.2);expect(eating.z).toBeCloseTo(-.03,1);
  expect(Math.cos(eating.yaw)).toBeLessThan(-.99);expect(eating.bowls).toHaveLength(1);
  expect(eating.bowls[0][0]).toBeCloseTo(3.2);expect(errors).toEqual([]);
});
