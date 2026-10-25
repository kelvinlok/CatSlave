import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';
import { createCat, disposeCat } from '../src/cat-model';
import { PALETTE } from '../src/config';
import { animateCat } from '../src/cat-animation';
import { Game } from '../src/simulation';
import { attachNativeBlenderRig, blenderRigControls, updateBlenderCatRig, validateNativeBlenderRig } from '../src/blender-cat-rig';

/** Small continuous skin with a blended neck vertex and non-game bone axes. */
function fixture(neckHelpers = false) {
  const model = createCat(PALETTE[1]);
  model.root.updateMatrixWorld(true);
  const source = new THREE.Group();
  source.rotation.x = -Math.PI / 2;
  const bones = new Map<string, THREE.Bone>();
  for (const name of blenderRigControls) {
    const bone = new THREE.Bone(); bone.name = `DEF_${name}`;
    bones.set(name, bone);
    const parent = name === 'head' ? bones.get('body')! : source;
    parent.add(bone); source.updateMatrixWorld(true);
    const control = model.root.getObjectByName(name)!;
    const rest = control.matrixWorld.clone().multiply(new THREE.Matrix4().makeRotationZ(0.4));
    const local = parent.matrixWorld.clone().invert().multiply(rest);
    local.decompose(bone.position, bone.quaternion, bone.scale);
  }
  if (neckHelpers) {
    let parent = bones.get('body')!;
    for (const [name, position] of [['neckBase', [0, 0.78, 0.38]], ['neckTop', [0, 0.89, 0.48]]] as const) {
      const bone = new THREE.Bone(); bone.name = `DEF_${name}`;
      parent.add(bone); source.updateMatrixWorld(true);
      const world = new THREE.Matrix4().makeRotationZ(0.4).setPosition(position[0], position[1], position[2]);
      parent.matrixWorld.clone().invert().multiply(world).decompose(bone.position, bone.quaternion, bone.scale);
      bones.set(name, bone); parent = bone;
    }
    source.updateMatrixWorld(true);
    parent.attach(bones.get('head')!);
  }
  source.updateMatrixWorld(true);
  const ordered = [...bones.values()];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.7, 0.4, 0.1, 0.75, 0.45, -0.1, 0.75, 0.45], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([0.5, 0.5, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const skin = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial()); skin.name = 'ContinuousSkin';
  // Mesh vertices are authored in game coordinates despite the rotated scene.
  skin.rotation.x = Math.PI / 2; source.add(skin); source.updateMatrixWorld(true);
  skin.bind(new THREE.Skeleton(ordered));
  const fur = new THREE.SkinnedMesh(geometry, skin.material); fur.name = 'CoatFur';
  fur.rotation.copy(skin.rotation); source.add(fur); source.updateMatrixWorld(true);
  fur.bind(skin.skeleton, skin.bindMatrix);
  const eyes = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial());
  eyes.name = 'OpenEye'; eyes.userData.visibilitySlot = 'eye0'; source.add(eyes);
  const lid = eyes.clone(); lid.name = 'ClosedEye'; lid.userData.visibilitySlot = 'closedEye0'; source.add(lid);
  return { model, source, skin };
}

function point(root: THREE.Group, index: number) {
  const mesh = root.getObjectByName('latte_ContinuousSkin') as THREE.SkinnedMesh;
  return mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
}

describe('native Blender skinning', () => {
  it('preserves exported skin data and blends connected vertices across the neck', () => {
    const { model, source, skin } = fixture();
    validateNativeBlenderRig(source);
    attachNativeBlenderRig(model.root, source, 'latte');
    const actual = model.root.getObjectByName('latte_ContinuousSkin') as THREE.SkinnedMesh;
    expect(actual.geometry).toBe(skin.geometry);
    expect(actual.skeleton.boneInverses.map(matrix => matrix.toArray())).toEqual(skin.skeleton.boneInverses.map(matrix => matrix.toArray()));
    expect(model.root.getObjectByName('tailSkin')).toBeUndefined();
    expect(model.eyes[0].geometry.getAttribute('position').count).toBe(0);
    const before = [0, 1, 2].map(i => point(model.root, i));
    model.head.position.x += 0.2;
    updateBlenderCatRig(model.root);
    expect(point(model.root, 0).x - before[0].x).toBeCloseTo(0.1, 6);
    expect(point(model.root, 1).x - before[1].x).toBeCloseTo(0.2, 6);
    expect(point(model.root, 2).x - before[2].x).toBeCloseTo(0, 6);
  });

  it('keeps cloned poses independent, handles moved/scaled roots, and follows blinking', () => {
    const { model, source } = fixture();
    attachNativeBlenderRig(model.root, source, 'latte');
    const twin = cloneRig(model.root) as THREE.Group;
    const baseline = point(twin, 0);
    model.root.position.set(3, 0.4, -2); model.root.scale.setScalar(0.5);
    model.head.position.x += 0.2;
    model.eyes[0].visible = false; model.closedEyes[0].visible = true;
    updateBlenderCatRig(model.root);
    updateBlenderCatRig(twin);
    expect(point(twin, 0).distanceTo(baseline)).toBeLessThan(1e-6);
    const expected = baseline.clone().add(new THREE.Vector3(0.1, 0, 0)).multiplyScalar(0.5).add(model.root.position);
    expect(point(model.root, 0).distanceTo(expected)).toBeLessThan(1e-6);
    expect(model.root.getObjectByName('latte_OpenEye')!.visible).toBe(false);
    expect(model.root.getObjectByName('latte_ClosedEye')!.visible).toBe(true);
    expect(twin.getObjectByName('DEF_head')).not.toBe(model.root.getObjectByName('DEF_head'));
  });

  it('updates skin from the production animator and is stable while simulation time is frozen', () => {
    const { model, source } = fixture();
    attachNativeBlenderRig(model.root, source, 'latte');
    const before = point(model.root, 0);
    const cat = new Game(5).cats[0]; cat.activity = 'stretching'; cat.pose = 0.5;
    animateCat(model, cat, 1);
    const stretched = point(model.root, 0);
    expect(stretched.y).toBeLessThan(before.y - 0.1);
    animateCat(model, cat, 1);
    expect(point(model.root, 0).distanceTo(stretched)).toBeLessThan(1e-8);
  });

  it('shares the bone palette between skin and fur only within an instance and disposes it once', () => {
    const { model, source } = fixture();
    attachNativeBlenderRig(model.root, source, 'latte');
    const twin = cloneRig(model.root) as THREE.Group;
    updateBlenderCatRig(twin);
    const skin = model.root.getObjectByName('latte_ContinuousSkin') as THREE.SkinnedMesh;
    const fur = model.root.getObjectByName('latte_CoatFur') as THREE.SkinnedMesh;
    const twinSkin = twin.getObjectByName('latte_ContinuousSkin') as THREE.SkinnedMesh;
    const twinFur = twin.getObjectByName('latte_CoatFur') as THREE.SkinnedMesh;
    expect(skin.skeleton).toBe(fur.skeleton);
    expect(twinSkin.skeleton).toBe(twinFur.skeleton);
    expect(twinSkin.skeleton).not.toBe(skin.skeleton);
    const dispose = vi.spyOn(skin.skeleton, 'dispose');
    disposeCat(model);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the native look-back within neck reach while preserving planted feet', () => {
    const { model, source } = fixture(true);
    attachNativeBlenderRig(model.root, source, 'latte');
    const cat = new Game(5).cats[0]; cat.activity = 'idle';
    for (const side of [-1, 1]) {
      animateCat(model, cat, 0, { buttPat: { lift: 1, side } });
      expect(Math.abs(model.head.rotation.y)).toBeLessThan(Math.PI / 2);
      expect(Math.sign(model.head.rotation.y)).toBe(side);
      expect(Math.abs(model.head.position.x)).toBeLessThan(0.1);
      expect(model.head.position.y).toBeLessThan(1.12);
      model.root.updateMatrixWorld(true);
      for (const paw of model.paws) expect(paw.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(0.07, 3);
    }
  });

  it('rejects incomplete armatures before replacing the model', () => {
    const { source } = fixture();
    source.getObjectByName('DEF_paw3')!.removeFromParent();
    expect(() => validateNativeBlenderRig(source)).toThrow('DEF_paw3');
  });

  it('spreads extreme head turns through optional neck bones without collapsing their frames', () => {
    const { model, source } = fixture(true);
    attachNativeBlenderRig(model.root, source, 'latte');
    const twin = cloneRig(model.root) as THREE.Group;
    const rest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.4);
    model.head.rotation.y = 2.55;
    model.head.position.add(new THREE.Vector3(0.24, 0.29, -0.1));
    updateBlenderCatRig(model.root); updateBlenderCatRig(twin);
    for (const [name, fraction] of [['neckBase', 1 / 3], ['neckTop', 2 / 3]] as const) {
      const bone = model.root.getObjectByName(`DEF_${name}`)!;
      const position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
      bone.matrixWorld.decompose(position, rotation, scale);
      expect(rotation.angleTo(rest)).toBeCloseTo(2.55 * fraction, 6);
      scale.toArray().forEach(value => expect(value).toBeCloseTo(1, 6));
      expect(bone.matrixWorld.determinant()).toBeCloseTo(1, 6);
      const x = new THREE.Vector3().setFromMatrixColumn(bone.matrixWorld, 0);
      const y = new THREE.Vector3().setFromMatrixColumn(bone.matrixWorld, 1);
      expect(x.dot(y)).toBeCloseTo(0, 6);
      expect(twin.getObjectByName(`DEF_${name}`)!.getWorldQuaternion(new THREE.Quaternion()).angleTo(rest)).toBeLessThan(1e-6);
    }
    expect(model.root.getObjectByName('DEF_head')!.getWorldQuaternion(new THREE.Quaternion()).angleTo(rest)).toBeCloseTo(2.55, 6);
  });
});
