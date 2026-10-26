import { expect, test } from '@playwright/test';
import type * as THREE from 'three';

const customCats = [
  { name: 'Choco', asset: 'choco' }, { name: 'Latte', asset: 'latte' },
  { name: '的的', asset: 'didi' }, { name: '小塞', asset: 'xiaosai' },
  { name: 'Yelo', asset: 'yelo' },
  { name: 'Miller', asset: 'miller' },
];

for (const { name, asset } of customCats) {
test(`${name} loads an authored skeleton and continuously deforms its exported skin`, async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1200, height: 700 });
  await page.goto('/tests/browser/cat-studio.html');
  await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  const report = await page.evaluate(async asset => {
    const configPath = '/src/config.ts';
    const { PALETTE } = await import(configPath) as typeof import('../../src/config');
    const variant = PALETTE.findIndex(cat => cat.appearance === asset);
    const s = window.__CAT_STUDIO__;
    s.pose('idle', 1, variant);
    const skins: THREE.SkinnedMesh[] = [], bones: THREE.Bone[] = [];
    s.model.root.traverse(object => {
      if ((object as THREE.SkinnedMesh).isSkinnedMesh) skins.push(object as THREE.SkinnedMesh);
      if ((object as THREE.Bone).isBone && object.name.startsWith('DEF_')) bones.push(object as THREE.Bone);
    });
    const skin = skins.find(mesh => mesh.name.endsWith('_ContinuousSkin'));
    if (!skin) return { rig: s.model.root.userData.modelRig, skins: 0, bones: bones.length, errors: ['No exported skin'] };
    const weights = skin.geometry.getAttribute('skinWeight'), indices = skin.geometry.getAttribute('skinIndex');
    const sampleIndices = Array.from({ length: 48 }, (_, i) => Math.floor(i * (weights.count - 1) / 47));
    const weightSnapshot = sampleIndices.map(i => [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)]);
    const points = () => sampleIndices.map(i => skin.getVertexPosition(i, skin.position.clone()).applyMatrix4(skin.matrixWorld).toArray());
    const idle = points();
    s.pose('stretching', 2, variant, 2, 0.5); s.pose('stretching', 2.4, variant, 2, 0.5);
    const stretch = points();
    s.pose('stretching', 2.4, variant, 2, 0.5);
    const frozen = points();
    s.pose('walking', 3, variant, 2); s.pose('walking', 3.4, variant, 4);
    const walk = points();
    return {
      rig: s.model.root.userData.modelRig, skins: skins.length, bones: bones.length,
      asset: s.model.root.userData.modelAsset,
      continuous: skin.userData.surfaceComponents === 1 && skin.userData.nonManifoldEdges === 0,
      neckBones: ['DEF_neckBase', 'DEF_neckTop'].every(name => bones.some(bone => bone.name === name)),
      palettes: new Set(skins.map(mesh => mesh.skeleton)).size,
      allNative: skins.every(mesh => mesh.skeleton.bones.every(bone => bone.name.startsWith('DEF_'))),
      finite: [idle, stretch, frozen, walk].every(pose => pose.flat().every(Number.isFinite)),
      changed: stretch.filter((p, i) => p.some((x, c) => Math.abs(x - idle[i][c]) > 0.01)).length,
      frozenDelta: Math.max(...frozen.flatMap((p, i) => p.map((x, c) => Math.abs(x - stretch[i][c])))),
      unchangedWeights: JSON.stringify(weightSnapshot) === JSON.stringify(sampleIndices.map(i => [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)])),
      weightCount: weights.count, indexCount: indices.count,
      errors: [],
    };
  }, asset);
  expect(report.errors).toEqual([]);
  expect(report.rig).toBe('blender-armature');
  expect(report.skins).toBeGreaterThan(0);
  expect(report.asset).toBe(`models/${asset}.glb`);
  expect(report.bones).toBe(28);
  expect(report.neckBones).toBe(true);
  expect(report.continuous).toBe(true);
  expect(report.palettes).toBe(1);
  expect(report.allNative).toBe(true);
  expect(report.finite).toBe(true);
  expect(report.changed).toBeGreaterThan(12);
  expect(report.frozenDelta).toBeLessThan(1e-6);
  expect(report.unchangedWeights).toBe(true);
  expect(report.weightCount).toBe(report.indexCount);
  expect(errors).toEqual([]);
});
}

test('all custom cats and a repeated instance keep independent animated poses', async ({ page }) => {
  await page.goto('/tests/browser/cat-studio.html');
  await page.waitForFunction(() => !!window.__CAT_STUDIO__);
  const report = await page.evaluate(async () => {
    const modelPath = '/src/cat-model.ts', configPath = '/src/config.ts';
    const animationPath = '/src/cat-animation.ts', simulationPath = '/src/simulation.ts';
    const { createCat, disposeCat } = await import(modelPath) as typeof import('../../src/cat-model');
    const { PALETTE } = await import(configPath) as typeof import('../../src/config');
    const { animateCat } = await import(animationPath) as typeof import('../../src/cat-animation');
    const { Game } = await import(simulationPath) as typeof import('../../src/simulation');
    const customs = PALETTE.filter(cat => cat.appearance && cat.appearance !== 'primitive');
    const models = [...customs, PALETTE.find(cat => cat.appearance === 'miller')!].map(createCat);
    const snapshots = () => models.map(model => model.root.getObjectByName('DEF_head')!.matrixWorld.elements.slice());
    const cat = new Game(5).cats[0]; cat.activity = 'stretching'; cat.pose = 0.5;
    const movements = models.map((model, index) => {
      const initial = snapshots();
      animateCat(model, cat, 1);
      const posed = snapshots();
      return {
        changedSelf: JSON.stringify(posed[index]) !== JSON.stringify(initial[index]),
        unchangedOthers: posed.every((pose, i) => i === index || JSON.stringify(pose) === JSON.stringify(initial[i])),
      };
    });
    const palettes = models.map(model => {
      const skins: THREE.SkinnedMesh[] = [];
      model.root.traverse(object => { if ((object as THREE.SkinnedMesh).isSkinnedMesh) skins.push(object as THREE.SkinnedMesh); });
      return skins[0].skeleton;
    });
    const result = {
      rigs: models.map(model => model.root.userData.modelRig),
      distinctPalettes: new Set(palettes).size,
      distinctHeads: new Set(models.map(model => model.root.getObjectByName('DEF_head'))).size,
      movements,
    };
    models.forEach(disposeCat);
    return result;
  });
  expect(report.rigs).toEqual(Array(customCats.length + 1).fill('blender-armature'));
  expect(report.distinctPalettes).toBe(customCats.length + 1);
  expect(report.distinctHeads).toBe(customCats.length + 1);
  expect(report.movements).toEqual(Array(customCats.length + 1).fill({ changedSelf: true, unchangedOthers: true }));
});
