import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('cats stretch autonomously, pause midway and recover; inspect all reference coats in motion', async ({ browser, baseURL }, info) => {
  const folder = `artifacts/stretch/${info.project.name}`; await mkdir(folder, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, baseURL,
    recordVideo: { dir: `${folder}/video`, size: { width: 1200, height: 700 } } });
  const page = await context.newPage(), video = page.video()!, errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto('/'); await page.waitForFunction(() => !!window.__CATSLAVE_TEST__);
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__, game = t.game; t.setManualClock(true); game.reset();
      const cat = game.cats[0]; cat.nextNeedAt = Infinity; cat.nextStretchAt = game.clock + 0.2;
      cat.position = { x: 0, z: -0.8 }; cat.destination = { ...cat.position }; cat.yaw = Math.PI / 2;
      cat.decisionAt = Infinity; t.world.zoomView(-10);
      // Advance the production scheduler deterministically. Software WebGL's
      // long-frame interruption pause must not decide when this fixture stretches.
      game.tick(.25); t.refresh();
    });
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].activity)).toBe('stretching');
    const frozen = await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__, game = t.game;
      game.tick(1.5); t.refresh(); game.pause(); return game.cats[0].pose;
    });
    await page.evaluate(() => window.__CATSLAVE_TEST__.game.tick(.3));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].pose)).toBe(frozen);
    await page.screenshot({ path: `${folder}/in-game-hold.png` });
    await page.evaluate(() => {
      const t = window.__CATSLAVE_TEST__; t.game.resume(); t.game.tick(3); t.refresh();
    });
    expect(await page.evaluate(() => window.__CATSLAVE_TEST__.game.cats[0].activity)).not.toBe('stretching');
    await page.setViewportSize({ width: 1200, height: 700 });
    await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
    for (const variant of [0, 1, 2, 3]) {
      await page.evaluate(variant => {
        const studio = window.__CAT_STUDIO__; studio.pose('stretching', 1, variant, 0, 0.5); studio.pose('stretching', 1.3, variant, 0, 0.5);
      }, variant);
      await page.screenshot({ path: `${folder}/cat-${variant}-hold.png` });
    }
    // A full, real-time close-up cycle, not just endpoints.
    await page.evaluate(async () => {
      const studio = window.__CAT_STUDIO__; studio.pose('idle', 0, 0);
      const began = performance.now();
      await new Promise<void>(resolve => {
        const frame = () => {
          const elapsed = (performance.now() - began) / 1000;
          studio.pose('stretching', elapsed, 0, 0, Math.min(1, elapsed / 4.2));
          if (elapsed < 4.2) requestAnimationFrame(frame); else resolve();
        };
        requestAnimationFrame(frame);
      });
    });
    await page.screenshot({ path: `${folder}/recovered.png` });
    for (const [i, progress] of [0, 0.15, 0.30, 0.5, 0.7, 0.85, 1].entries()) {
      await page.evaluate(progress => window.__CAT_STUDIO__.pose('stretching', 10 + progress * 4.2, 0, 0, progress), progress);
      await page.screenshot({ path: `${folder}/sequence-${i}.png` });
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); await video.saveAs(`${folder}/stretch-motion.webm`); }
});


test('native boot cuffs follow every cat shin while toes and soles stay fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('/tests/browser/cat-studio.html'); await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  const bootFit = await page.evaluate(() => {
    const studio = window.__CAT_STUDIO__;
    return Array.from({ length: studio.variantCount }, (_, variant) => {
      studio.pose('stretching', 1, variant, 0, .5); studio.pose('stretching', 1.3, variant, 0, .5);
      const model = studio.model;
      return model.paws.map((paw, i) => {
        const shoe = model.root.getObjectByName(`christmas-shoe${i}`)!;
        const meshes: { active: boolean; minY: number; cuffError: number; rigidError: number; cuffSamples: number }[] = [];
        shoe.traverse(object => {
          if (!('geometry' in object) || !('getVertexPosition' in object)) return;
          const mesh = object as import('three').Mesh;
          const positions = mesh.geometry.getAttribute('position'), flex = mesh.geometry.getAttribute('ankleFlex');
          const point = paw.position.clone(), expected = point.clone(), ankle = point.clone().set(0, 0, -.067);
          const shinRotation = paw.quaternion.clone().invert();
          let minY = Infinity, cuffError = 0, rigidError = 0, cuffSamples = 0;
          for (let j = 0; j < positions.count; j++) {
            mesh.getVertexPosition(j, point); expected.fromBufferAttribute(positions, j);
            if (flex?.getX(j) === 0) rigidError = Math.max(rigidError, point.distanceTo(expected));
            else if (flex?.getX(j) === 1 && positions.getY(j) > .07) {
              expected.sub(ankle).applyQuaternion(shinRotation).add(ankle);
              cuffError = Math.max(cuffError, point.distanceTo(expected)); cuffSamples++;
            }
            point.applyMatrix4(mesh.matrixWorld); minY = Math.min(minY, point.y);
          }
          meshes.push({ active: !!mesh.morphTargetInfluences?.some(weight => weight > 0), minY, cuffError, rigidError, cuffSamples });
        });
        return { native: model.root.userData.modelRig === 'blender-armature', meshes };
      });
    });
  });
  for (const cat of bootFit) for (const shoe of cat) {
    expect(shoe.native).toBe(true);
    expect(shoe.meshes.some(mesh => mesh.active)).toBe(true);
    expect(shoe.meshes.reduce((sum, mesh) => sum + mesh.cuffSamples, 0)).toBeGreaterThan(0);
    for (const mesh of shoe.meshes) {
      expect(mesh.minY).toBeGreaterThanOrEqual(-.002);
      expect(mesh.cuffError).toBeLessThan(.004); expect(mesh.rigidError).toBeLessThan(.000001);
    }
  }
});
