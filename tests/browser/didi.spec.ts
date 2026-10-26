import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type * as THREE from 'three';

test('的的 joins the household and keeps his signature tongue in animated poses', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const folder = `artifacts/didi/${info.project.name}`; await mkdir(folder, { recursive: true });
  await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
  const cats = await page.evaluate(() => {
    const t = window.__CATSLAVE_TEST__, game = t.game;
    t.setManualClock(true); game.reset();
    for (const appearance of ['latte', 'didi']) {
      game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); t.finishBonus();
      game.adopt(game.candidates.find(cat => cat.appearance === appearance)!.id); for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
    }
    t.refresh(); return game.cats.map(cat => cat.name);
  });
  expect(cats).toEqual(['Choco', 'Latte', '的的']);
  await page.screenshot({ path: `${folder}/in-game.png` });
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  for (const [i, activity] of (['idle', 'walking', 'grooming', 'sleeping'] as const).entries()) {
    const signature = await page.evaluate(({ i, activity }) => {
      const s = window.__CAT_STUDIO__;
      s.pose(activity, 1 + i, 2); s.pose(activity, 1.4 + i, 2);
      const tongues: THREE.SkinnedMesh[] = [];
      s.model.root.traverse(object => {
        if (object.userData.signature === 'tongue' && (object as THREE.SkinnedMesh).isSkinnedMesh) tongues.push(object as THREE.SkinnedMesh);
      });
      const tongue = tongues[0];
      if (!tongue) return { count: 0 };
      const indices = tongue.geometry.getAttribute('skinIndex'), weights = tongue.geometry.getAttribute('skinWeight');
      let headWeighted = true, finite = true;
      for (let vertex = 0; vertex < indices.count; vertex++) {
        for (let component = 0; component < 4; component++) {
          if (weights.getComponent(vertex, component) > 0) {
            headWeighted &&= tongue.skeleton.bones[indices.getComponent(vertex, component)].name === 'DEF_head';
          }
        }
        finite &&= tongue.getVertexPosition(vertex, tongue.position.clone()).applyMatrix4(tongue.matrixWorld).toArray().every(Number.isFinite);
      }
      return { count: tongues.length, vertices: indices.count, headWeighted, finite, visible: tongue.visible,
        rig: s.model.root.userData.modelRig };
    }, { i, activity });
    expect(signature.count).toBe(1);
    expect(signature.vertices).toBeGreaterThan(100);
    expect(signature.headWeighted).toBe(true);
    expect(signature.finite).toBe(true);
    expect(signature.visible).toBe(true);
    expect(signature.rig).toBe('blender-armature');
    await page.screenshot({ path: `${folder}/${activity}.png` });
  }
  for (const variant of [0, 1, 3]) {
    expect(await page.evaluate(variant => {
      const s = window.__CAT_STUDIO__; s.pose('idle', 1, variant);
      let signature = false;
      s.model.root.traverse(object => { signature ||= object.userData.signature === 'tongue'; });
      return signature;
    }, variant)).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('Didi keeps a visible head-attached signature tongue when his download fails', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/models/didi.glb', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/tests/browser/cat-studio.html');
  await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  const reports = await page.evaluate(() => {
    const studio = window.__CAT_STUDIO__;
    return (['idle', 'walking', 'grooming', 'sleeping'] as const).map((activity, index) => {
      studio.pose(activity, index + 1, 2);
      const tongue = studio.model.head.getObjectByName('tongue');
      let vertices = 0, finite = true;
      tongue?.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (mesh.isMesh && mesh.visible) vertices += mesh.geometry.getAttribute('position').count;
        finite &&= object.matrixWorld.elements.every(Number.isFinite);
      });
      return { attached: tongue?.parent === studio.model.head, vertices, finite,
        source: studio.model.root.userData.modelSource ?? 'builtin' };
    });
  });
  for (const report of reports) {
    expect(report.source).toBe('builtin');
    expect(report.attached).toBe(true);
    expect(report.vertices).toBeGreaterThan(100);
    expect(report.finite).toBe(true);
  }
  expect(errors).toEqual([]);
});
