import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Hong_Kong' });

test('clear exterior window has real depth and indoor lights stay on through paused day/night changes', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-03T04:00:00Z'));
  await page.goto('/');
  await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.scene.getObjectByName('video-lounge')?.userData.loaded);
  const day = await page.evaluate(async () => {
    const t = window.__CATSLAVE_TEST__; t.setManualClock(true);
    t.game.reset(); t.game.phase = 'playing'; t.game.pause('Lighting check'); t.refresh();
    const path = '/node_modules/three/build/three.module.js';
    const THREE = await import(/* @vite-ignore */ path);
    const room = t.world.scene.getObjectByName('video-lounge')!; room.updateMatrixWorld(true);
    const hits = new THREE.Raycaster(new THREE.Vector3(8.8, 2.4, 2), new THREE.Vector3(1, 0, 0)).intersectObject(room, true);
    const material = (hit: any) => Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
    return { localHour: t.world.lighting.state.localHour, sun: t.world.lighting.daylight.intensity,
      indoor: t.world.lighting.indoorLights.map(light => light.intensity), clock: t.game.clock,
      glass: { x: hits[0].point.x, transmission: material(hits[0]).transmission },
      exteriorX: [-1, 1, 3.7, 6].flatMap(z => new THREE.Raycaster(new THREE.Vector3(8.8, 2.4, z), new THREE.Vector3(1, 0, 0)).intersectObject(room, true))
        .find((hit: any) => material(hit).name.startsWith('Exterior |'))?.point.x };
  });
  expect(day.localHour).toBe(12); expect(day.sun).toBeGreaterThan(1);
  expect(day.glass.x).toBeCloseTo(9.33, 2); expect(day.glass.transmission).toBeGreaterThan(.9);
  expect(day.exteriorX).toBeGreaterThan(12);
  await page.clock.setFixedTime(new Date('2026-11-03T15:00:00Z'));
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.world.lighting.state.localHour === 23);
  const night = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__;
    return { sun: t.world.lighting.daylight.intensity,
      indoor: t.world.lighting.indoorLights.map(light => light.intensity), clock: t.game.clock, phase: t.game.phase };
  });
  expect(night.sun).toBe(0); expect(night.indoor).toEqual(day.indoor);
  expect(night.clock).toBe(day.clock); expect(night.phase).toBe('paused');
  await page.clock.setFixedTime(new Date('2026-11-03T04:00:00Z'));
  await page.waitForFunction(() => window.__CATSLAVE_TEST__.world.lighting.state.localHour === 12);
});

test('the same UTC instant follows each browser device timezone', async ({ browser }) => {
  const states = [];
  for (const timezoneId of ['Asia/Hong_Kong', 'America/Los_Angeles']) {
    const context = await browser.newContext({ timezoneId, viewport: { width: 412, height: 915 } });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-03T04:00:00Z'));
    await page.goto('/');
    await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.scene.getObjectByName('video-lounge')?.userData.loaded);
    states.push(await page.evaluate(() => window.__CATSLAVE_TEST__.world.lighting.state));
    await context.close();
  }
  expect(states[0].localHour).toBe(12); expect(states[0].daylight).toBe(1);
  expect(states[1].localHour).toBe(20); expect(states[1].daylight).toBe(0);
});
