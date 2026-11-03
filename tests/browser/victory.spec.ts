import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test('victory welcomes the full household and keeps both exits usable on every layout', async ({ browser, baseURL }, info) => {
  test.setTimeout(240_000);
  await mkdir('artifacts/victory', { recursive: true });
  for (const [name, width, height, safeTop, safeBottom] of [
    ['short', 320, 480, 0, 0], ['safe', 390, 844, 47, 34], ['desktop', 1280, 800, 0, 0],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height }, baseURL, hasTouch: width < 700, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/'); await page.waitForFunction(() => window.__CATSLAVE_TEST__?.world.scene.getObjectByName('video-lounge')?.userData.loaded);
    await page.evaluate(({ safeTop, safeBottom }) => {
      const t = window.__CATSLAVE_TEST__, g = t.game; t.setManualClock(true); g.reset();
      t.hud.resize(t.hud.width, t.hud.height, safeTop, safeBottom);
      for (const tool of ['sweeper', 'mop', 'brush', 'food'] as const) {
        g.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); g.tick(g.timeLeft); t.finishBonus();
        g.adopt(g.candidates[0].id); g.upgrade(tool); g.upgrade(tool);
      }
      g.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); g.tick(g.timeLeft); t.refresh();
    }, { safeTop, safeBottom });
    const layout = await page.evaluate(async () => {
      const path = '/node_modules/three/build/three.module.js';
      const THREE = await import(/* @vite-ignore */ path);
      const t = window.__CATSLAVE_TEST__, v = t.world.viewport;
      // Inspect a deterministic settled frame even when shader uploads stall RAF.
      t.world.update(t.game,0,performance.now()/1000+6);t.hud.draw(t.game,t.world,0,true);
      const room = t.world.scene.getObjectByName('video-lounge')!; room.updateMatrixWorld(true);
      return { phase: t.game.phase, hearts: t.world.victoryHearts(), v, hits: t.hud.hits,
        frame:t.captureFrame(),
        size: { w: t.hud.width, h: t.hud.height },
        cats: t.game.cats.map(cat => {
          const model = t.world.scene.getObjectByName(`preview-cat-${cat.id}`)!;
          const head = model.getObjectByName('head')!;
          const edges = [-0.4, 0.4].map(x => t.world.project(head.localToWorld(head.position.clone().set(x, 0.2, 0.3))).x);
          const occluded = ['head','body','paw0','paw1'].filter(name => {
            const point = model.getObjectByName(name)!.localToWorld(new THREE.Vector3(0,.05,.1));
            const ray = point.clone().sub(t.world.camera.position);
            return new THREE.Raycaster(t.world.camera.position,ray.clone().normalize(),0,ray.length()-.03).intersectObject(room,true).length>0;
          });
          return { happy: model.getObjectByName('closedEye0')!.visible && model.getObjectByName('closedEye1')!.visible, edges, occluded, z:model.position.z };
        }) };
    });
    expect(layout.phase).toBe('victory'); expect(layout.cats).toHaveLength(5);
    expect(layout.cats.at(-1)!.z).toBeCloseTo(3.6,4);
    expect(layout.cats.every(cat => cat.happy)).toBe(true);
    expect(layout.cats.map(cat=>cat.occluded), 'faces, bodies and front paws clear the room furnishings').toEqual([[],[],[],[],[]]);
    for (const cat of layout.cats) for (const x of cat.edges) {
      expect(x).toBeGreaterThan(layout.v.x + 2);
      expect(x).toBeLessThan(layout.v.x + layout.v.w - 2);
    }
    for (const point of layout.hearts) {
      expect(point.visible).toBe(true);
      expect(point.x).toBeGreaterThan(layout.v.x + 15);
      expect(point.x).toBeLessThan(layout.v.x + layout.v.w - 15);
      expect(point.y).toBeGreaterThan(layout.v.y + 10);
      expect(point.y).toBeLessThan(layout.v.y + layout.v.h - 30);
    }
    for (const hit of layout.hits) {
      expect(hit.y).toBeGreaterThanOrEqual(safeTop);
      expect(hit.y + hit.h).toBeLessThanOrEqual(layout.size.h - safeBottom);
      expect(hit.w).toBeGreaterThanOrEqual(44); expect(hit.h).toBeGreaterThanOrEqual(44);
    }
    await writeFile(`artifacts/victory/${name}-${info.project.name}.png`,Buffer.from(layout.frame.split(',')[1],'base64'));
    const exit = name === 'safe' ? 'home' : 'restart';
    const point = await page.evaluate(exit => {
      const hit = window.__CATSLAVE_TEST__.hud.hits.find(hit => hit.id === exit)!;
      const bounds = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: bounds.left + hit.x + hit.w / 2, y: bounds.top + hit.y + hit.h / 2 };
    }, exit);
    if (width < 700) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await expect.poll(() => page.evaluate(() => window.__CATSLAVE_TEST__.game.phase)).toBe(exit === 'home' ? 'title' : 'playing');
    expect(await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__;
      return { camera: t.world.camera.position.toArray(), zoom: t.world.camera.zoom, hearts: t.world.victoryHearts().length };
    })).toEqual({ camera: [-2.6, 1.65, 5.4], zoom: 1, hearts: 0 });
    expect(errors).toEqual([]); await context.close();
  }
});
