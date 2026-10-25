import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyChocoAsset, registerChocoAsset } from '../src/choco-asset';
import { createCat, disposeCat } from '../src/cat-model';
import { PALETTE } from '../src/config';
import { animateCat } from '../src/cat-animation';
import { Game } from '../src/simulation';

describe('Blender Choco integration', () => {
  it('rejects an incomplete asset before replacing any visible cat', () => {
    expect(() => registerChocoAsset(new THREE.Group())).toThrow('body');
    const fallback = createCat(PALETTE[0]);
    expect(applyChocoAsset(fallback.root)).toBe(false);
    const missingLid = fallback.root.clone(true);
    missingLid.getObjectByName('closedEye0')!.removeFromParent();
    expect(() => registerChocoAsset(missingLid)).toThrow('closedEye0');
    expect(applyChocoAsset(fallback.root)).toBe(false);
  });

  it('normalizes authored eye transforms, preserves animation joints, and only replaces Choco', () => {
    const original = createCat(PALETTE[0]);
    const source = original.root.clone(true);
    // Blender authors actual-sized eye geometry below an unscaled empty.
    const sourceEye = source.getObjectByName('eye0') as THREE.Mesh;
    const eye = new THREE.Group(); eye.name = 'eye0'; eye.position.copy(sourceEye.position);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial());
    iris.name = 'authoredIris'; iris.scale.copy(sourceEye.scale); eye.add(iris);
    sourceEye.parent!.add(eye); sourceEye.removeFromParent();
    registerChocoAsset(source);
    const a = createCat(PALETTE[0]), b = createCat(PALETTE[0]), latte = createCat(PALETTE[1]);
    expect(a.root.userData.modelSource).toBe('blender');
    expect(latte.root.userData.modelSource).toBeUndefined();
    expect(a.eyes[0].scale.y).toBeCloseTo(0.08);
    const importedIris = a.eyes[0].getObjectByName('choco_authoredIris') as THREE.Mesh;
    expect(importedIris.geometry.boundingBox!.max.x).toBeCloseTo(1);
    expect(importedIris.geometry.boundingBox!.max.y).toBeCloseTo(1);
    expect(a.eyes[0].geometry.getAttribute('position').count).toBe(0);
    expect(a.body.children.every(child => child.name.startsWith('choco_'))).toBe(true);
    expect(a.lowerLegs[0].parent).toBe(a.legs[0]);
    expect(a.paws[0].parent).toBe(a.lowerLegs[0]);
    const count: string[] = []; a.root.traverse(object => { if (object.name === 'leg0') count.push(object.name); });
    expect(count).toHaveLength(1);
    const cat = new Game(1).cats[0]; cat.activity = 'stretching'; cat.pose = 0.5;
    animateCat(a, cat, 1);
    expect(a.head.position.y).toBeLessThan(b.head.position.y);
    expect(b.head.position.y).toBeCloseTo(0.99);
    expect(a.tailJoints[0]).not.toBe(b.tailJoints[0]);
    expect(importedIris.geometry).toBe((b.eyes[0].getObjectByName('choco_authoredIris') as THREE.Mesh).geometry);
    disposeCat(a); disposeCat(b); disposeCat(latte); disposeCat(original);
  });
});
