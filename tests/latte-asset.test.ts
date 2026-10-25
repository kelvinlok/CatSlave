import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { hasBlenderCatAsset, registerBlenderCatAsset } from '../src/blender-cat-asset';
import { createCat, disposeCat } from '../src/cat-model';
import { PALETTE } from '../src/config';
import { animateCat } from '../src/cat-animation';
import { Game } from '../src/simulation';

describe('Blender cat identity and animation isolation', () => {
  it('keeps the Latte fallback intact when an incomplete asset is rejected', () => {
    const fallback = createCat(PALETTE[1]);
    const incomplete = fallback.root.clone(true);
    incomplete.getObjectByName('paw3')!.removeFromParent();
    expect(() => registerBlenderCatAsset('latte', incomplete)).toThrow('paw3');
    expect(hasBlenderCatAsset('latte')).toBe(false);
    expect(createCat(PALETTE[1]).root.userData.modelSource).toBeUndefined();
    disposeCat(fallback);
  });

  it('replaces cached fallback visuals per identity while keeping independent poses and tail bones', () => {
    const builtins = [createCat(PALETTE[0]), createCat(PALETTE[1])];
    for (const [i, kind] of (['choco', 'latte'] as const).entries()) {
      const source = builtins[i].root.clone(true);
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshStandardMaterial());
      marker.name = `${kind}Signature`; source.getObjectByName('body')!.add(marker);
      registerBlenderCatAsset(kind, source);
    }
    const choco = createCat(PALETTE[0]), latte = createCat(PALETTE[1]), twin = createCat(PALETTE[1]), other = createCat(PALETTE[2]);
    expect(latte.root.userData.modelAsset).toBe('models/latte.glb');
    expect(choco.root.userData.modelAsset).toBe('models/choco.glb');
    expect(latte.root.getObjectByName('latte_latteSignature')).toBeDefined();
    expect(latte.root.getObjectByName('choco_chocoSignature')).toBeUndefined();
    expect(choco.root.getObjectByName('latte_latteSignature')).toBeUndefined();
    expect(other.root.userData.modelSource).toBeUndefined();
    expect(builtins[1].root.userData.modelSource).toBeUndefined();
    expect(latte.lowerLegs[0].parent).toBe(latte.legs[0]);
    expect(latte.paws[0].parent).toBe(latte.lowerLegs[0]);
    expect(latte.tailJoints[0]).not.toBe(twin.tailJoints[0]);
    const tail = latte.root.getObjectByName('tailSkin') as THREE.SkinnedMesh;
    expect(tail.isSkinnedMesh).toBe(true);
    expect(tail.geometry.getAttribute('skinWeight').count).toBe(tail.geometry.getAttribute('position').count);
    expect(tail.skeleton.bones[0]).toBe(latte.tailJoints[0]);
    const cat = new Game(1).cats[0]; cat.activity = 'stretching'; cat.pose = 0.5;
    animateCat(latte, cat, 1);
    expect(latte.head.position.y).toBeLessThan(twin.head.position.y);
    expect(twin.head.position.y).toBeCloseTo(0.99);
    [...builtins, choco, latte, twin, other].forEach(disposeCat);
  });
});
