import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { animateCat } from '../src/cat-animation';
import { createCat } from '../src/cat-model';
import { PALETTE, ROOM } from '../src/config';
import { Game } from '../src/simulation';

function fixture() {
  const cat = new Game(5).cats[0];
  cat.activity = 'playing'; cat.position = { x: 0, z: 0 }; cat.yaw = 0; cat.elevation = 0;
  const model = createCat(PALETTE[0]); model.root.scale.setScalar(ROOM.catScale);
  return { cat, model };
}
function snapshot(root: THREE.Object3D) {
  const values: number[] = [];
  root.traverse(part => values.push(...part.position.toArray(), ...part.quaternion.toArray(), ...part.scale.toArray()));
  return values;
}
const footY = (paw: THREE.Group) => paw.getWorldPosition(new THREE.Vector3()).y;

describe('cat attention to the wand', () => {
  it('looks left and right at the world-space lure with anatomically bounded turns', () => {
    const left = fixture(), right = fixture();
    animateCat(left.model, left.cat, 1, { focus: { x: -0.6, y: 0.6, z: 1 } });
    animateCat(right.model, right.cat, 1, { focus: { x: 0.6, y: 0.6, z: 1 } });
    expect(left.model.head.rotation.y).toBeLessThan(-0.3);
    expect(right.model.head.rotation.y).toBeGreaterThan(0.3);
    expect(left.model.head.rotation.y).toBeCloseTo(-right.model.head.rotation.y);
    const behind = fixture();
    animateCat(behind.model, behind.cat, 1, { focus: { x: 1, y: 5, z: -10 } });
    expect(Math.abs(behind.model.head.rotation.y)).toBeLessThanOrEqual(0.85);
    expect(Math.abs(behind.model.head.rotation.x)).toBeLessThanOrEqual(0.65);
  });

  it('uses cat yaw, position and elevation when tracking height and direction', () => {
    const a = fixture(), b = fixture();
    const focus = { x: 0.4, y: 0.9, z: 1.2 };
    animateCat(a.model, a.cat, 1, { focus });
    b.cat.position = { x: 2, z: -3 }; b.cat.elevation = 0.8; b.cat.yaw = Math.PI / 2;
    animateCat(b.model, b.cat, 1, { focus: { x: 2 + focus.z, y: 0.8 + focus.y, z: -3 - focus.x } });
    expect(b.model.head.rotation.x).toBeCloseTo(a.model.head.rotation.x, 9);
    expect(b.model.head.rotation.y).toBeCloseTo(a.model.head.rotation.y, 9);
    const down = fixture(), up = fixture();
    animateCat(down.model, down.cat, 1, { focus: { x: 0, y: 0.05, z: 1 } });
    animateCat(up.model, up.cat, 1, { focus: { x: 0, y: 1.5, z: 1 } });
    expect(down.model.head.rotation.x).toBeGreaterThan(0);
    expect(up.model.head.rotation.x).toBeLessThan(0);
  });

  it('damps a moving focus and keeps repeated paused evaluations identical', () => {
    const { model, cat } = fixture();
    animateCat(model, cat, 1, { focus: { x: -0.5, y: 0.5, z: 0.7 }, engagement: 1 });
    const before = model.head.rotation.y;
    const options = { focus: { x: 0.5, y: 0.8, z: 0.7 }, engagement: 1 };
    animateCat(model, cat, 1.02, options);
    expect(model.head.rotation.y).toBeGreaterThan(before);
    expect(model.head.rotation.y).toBeLessThan(0);
    const paused = snapshot(model.root);
    for (let i = 0; i < 100; i++) animateCat(model, cat, 1.02, options);
    expect(snapshot(model.root)).toEqual(paused);
    animateCat(model, cat, 1.5, options);
    expect(model.head.rotation.y).toBeGreaterThan(0.3);
  });

  it('reaches with the nearer front paw while the other three paws stay planted', () => {
    for (const side of [-1, 1]) {
      const { model, cat } = fixture();
      const before = JSON.stringify(cat);
      model.root.position.set(2, 0, -1); model.root.rotation.y = 0.4;
      animateCat(model, cat, 1, { focus: { x: side * 0.15, y: 0.25, z: 0.55 }, engagement: 1 });
      const reaching = side < 0 ? 0 : 1;
      model.paws.forEach((paw, i) => {
        if (i === reaching) expect(footY(paw)).toBeGreaterThan(0.1);
        else expect(footY(paw)).toBeCloseTo(0.07 * ROOM.catScale, 7);
      });
      expect(model.eyes.every(eye => eye.visible)).toBe(true);
      expect(model.ears.every(ear => ear.rotation.x > 0)).toBe(true);
      expect(model.root.position.toArray()).toEqual([2, 0, -1]);
      expect(model.root.rotation.y).toBe(0.4);
      expect(JSON.stringify(cat)).toBe(before);
    }
  });

  it('repeatedly tries to catch a stationary elevated held lure, with planted hind paws and bounded poses', () => {
    for (const focus of [{ x: -0.3, y: 0.5, z: 0.5 }, { x: 0.6, y: 1.1, z: 0.5 },
      // A distant cat's minimum-size screen arch unprojects beyond paw range.
      { x: 1.5, y: 0.6, z: 0.35 }]) {
      const { model, cat } = fixture();
      const catBefore = JSON.stringify(cat);
      const reaching = focus.x < 0 ? 0 : 1;
      const heights: number[] = [], bodyHeights: number[] = [];
      for (let frame = 0; frame <= 240; frame++) {
        animateCat(model, cat, frame / 80, { focus, engagement: 1 });
        heights.push(footY(model.paws[reaching]));
        bodyHeights.push(model.body.position.y);
        expect(snapshot(model.root).every(Number.isFinite)).toBe(true);
        expect(Math.abs(model.head.rotation.y)).toBeLessThanOrEqual(0.85 + 0.000001);
        expect(Math.abs(model.head.rotation.x)).toBeLessThanOrEqual(0.65 + 0.000001);
        expect(Math.abs(model.body.rotation.x)).toBeLessThanOrEqual(0.10 + 0.000001);
        model.paws.forEach((paw, i) => {
          expect(footY(paw)).toBeGreaterThanOrEqual(0.07 * ROOM.catScale - 0.00001);
          expect(footY(paw)).toBeLessThan(0.4);
          if (i !== reaching) expect(footY(paw)).toBeCloseTo(0.07 * ROOM.catScale, 7);
        });
        if (frame === 90) {
          const paused = snapshot(model.root);
          for (let i = 0; i < 20; i++) animateCat(model, cat, frame / 80, { focus, engagement: 1 });
          expect(snapshot(model.root)).toEqual(paused);
        }
      }
      const peaks = heights.filter((height, i) => i > 0 && i < heights.length - 1
        && height > heights[i - 1] && height > heights[i + 1] && height > 0.16);
      expect(peaks.length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.12);
      expect(Math.min(...bodyHeights)).toBeLessThan(-0.06);
      expect(Math.max(...bodyHeights)).toBeGreaterThan(-0.04);
      expect(model.root.position.toArray()).toEqual([0, 0, 0]);
      expect(JSON.stringify(cat)).toBe(catBefore);
    }
  });

  it('settles the paw without another swat after the hold ends, while still looking at the lure', () => {
    const { model, cat } = fixture();
    const focus = { x: 0.3, y: 0.9, z: 0.5 };
    animateCat(model, cat, 0.2, { focus, engagement: 1 });
    let previous = footY(model.paws[1]);
    expect(previous).toBeGreaterThan(0.2);
    for (let frame = 1; frame <= 160; frame++) {
      animateCat(model, cat, 0.2 + frame / 80, { focus, engagement: 0 });
      const height = footY(model.paws[1]);
      expect(height).toBeLessThanOrEqual(previous + 0.000001);
      previous = height;
    }
    model.paws.forEach(paw => expect(footY(paw)).toBeCloseTo(0.07 * ROOM.catScale, 7));
    expect(model.body.position.y).toBe(-0.04);
    expect(model.body.rotation.x).toBe(0);
    expect(model.head.rotation.x).toBeLessThan(0);
    expect(model.head.rotation.y).toBeGreaterThan(0);
  });

  it('rears onto planted hind paws and reaches with both front paws during excited play', () => {
    const { model, cat } = fixture();
    const heights: number[] = [];
    for (let frame = 0; frame < 240; frame++) {
      animateCat(model, cat, frame / 60, { focus: { x: 0.1, y: 1.1, z: 0.6 }, engagement: 1, excited: true });
      heights.push(Math.min(footY(model.paws[0]), footY(model.paws[1])));
      for (const paw of model.paws.slice(2)) expect(footY(paw)).toBeCloseTo(0.07 * ROOM.catScale, 7);
      expect(snapshot(model.root).every(Number.isFinite)).toBe(true);
      if (frame === 60) {
        const before = snapshot(model.root);
        animateCat(model, cat, frame / 60, { focus: { x: 0.1, y: 1.1, z: 0.6 }, engagement: 1, excited: true });
        expect(snapshot(model.root)).toEqual(before);
      }
    }
    expect(heights.filter(height => height > 0.35).length).toBeGreaterThan(60);
    animateCat(model, cat, 8, { excited: true });
    model.paws.forEach(paw => expect(footY(paw)).toBeCloseTo(0.07 * ROOM.catScale, 7));
    expect(model.legs[0].position.z).toBe(0.4);
    expect(model.body.rotation.x).toBeCloseTo(0);
  });

  it('does not wave without an engaged lure and completely restores the normal pose when focus clears', () => {
    for (const options of [{}, { engagement: 1 }, { focus: { x: 0, y: 0.4, z: 0.6 } }]) {
      const { model, cat } = fixture();
      for (const time of [1, 1.3, 2, 3]) {
        animateCat(model, cat, time, options);
        model.paws.forEach(paw => expect(footY(paw)).toBeCloseTo(0.07 * ROOM.catScale, 7));
      }
    }
    const focused = fixture(), normal = fixture();
    animateCat(focused.model, focused.cat, 1, { focus: { x: 0.15, y: 0.25, z: 0.55 }, engagement: 1 });
    animateCat(focused.model, focused.cat, 3);
    animateCat(normal.model, normal.cat, 3);
    expect(snapshot(focused.model.root)).toEqual(snapshot(normal.model.root));
  });
});
