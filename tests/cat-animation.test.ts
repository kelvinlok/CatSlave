import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { animateCat } from '../src/cat-animation';
import { createCat } from '../src/cat-model';
import { PALETTE } from '../src/config';
import { Game } from '../src/simulation';
import { tickVisit } from '../src/cat-behavior';
import { FURNITURE } from '../src/furniture';
import type { CatActivity } from '../src/types';
import { JUMP_DURATION, JUMP_TAKEOFF, JUMP_TOUCHDOWN } from '../src/cat-jump';

function fixture(activity: CatActivity = 'idle') {
  const cat = new Game(5).cats[0]; cat.activity = activity;
  const model = createCat(PALETTE[0]); model.root.scale.setScalar(0.52);
  return { cat, model };
}
function snapshot(root: THREE.Object3D) {
  const values: number[] = [];
  root.traverse(part => values.push(...part.position.toArray(), ...part.quaternion.toArray(), ...part.scale.toArray()));
  return values;
}
const footPosition = (paw: THREE.Group) => paw.getWorldPosition(new THREE.Vector3());

describe('articulated cat animation', () => {
  it('looks back over the rump and lifts on a pat without floating the paws', () => {
    const { model, cat } = fixture(); model.root.rotation.y = Math.PI;
    animateCat(model, cat, 1, { buttPat: { lift: 0, side: 1 } });
    const feet = model.paws.map(footPosition), rest = model.body.position.y;
    expect(model.head.getWorldDirection(new THREE.Vector3()).z).toBeGreaterThan(0.7);
    animateCat(model, cat, 2, { buttPat: { lift: 1, side: 1 } });
    expect(model.body.position.y).toBeGreaterThan(rest);
    model.paws.forEach((paw, i) => expect(footPosition(paw).distanceTo(feet[i])).toBeLessThan(0.00001));
    animateCat(model, cat, 3, { buttPat: { lift: 0, side: 1 } });
    expect(model.body.position.y).toBeCloseTo(rest);
  });
  it('gives butt pats priority over lingering wand attention', () => {
    const { model, cat } = fixture('playing');
    const focus = { x: 0.4, y: 0.8, z: 0.8 };
    animateCat(model, cat, 0, { focus, engagement: 1 });
    for (let i = 1; i <= 30; i++) animateCat(model, cat, i / 60, {
      focus, engagement: 1, buttPat: { lift: 0.5, side: -1 },
    });
    expect(model.head.rotation.y).toBeCloseTo(-2.55);
  });
  it('keeps the head facing forward during free-play pats while lifting the rump', () => {
    const { model, cat } = fixture();
    animateCat(model, cat, 0, { buttPat: { lift: 0, side: 1, lookBack: false } });
    const rest = model.body.position.y;
    for (let frame = 1; frame <= 60; frame++) {
      animateCat(model, cat, frame / 60, {
        buttPat: { lift: Math.sin(frame / 60 * Math.PI / 2), side: 1, lookBack: false },
      });
      expect(model.head.rotation.y).toBeCloseTo(0);
      expect(model.head.position.x).toBe(0);
    }
    expect(model.body.position.y).toBeGreaterThan(rest);
  });
  it('keeps planted paws level and stationary in world space throughout a full walking cycle', () => {
    const { model, cat } = fixture('walking');
    const offsets = [0, 0.5, 0.75, 0.25];
    let previous: THREE.Vector3[] = [], previousContacts: boolean[] = [];
    let contactSamples = 0, swingSamples = 0;
    for (let frame = 0; frame <= 160; frame++) {
      cat.stride = frame / 160 * Math.PI;
      model.root.position.z = cat.stride / 10;
      animateCat(model, cat, frame / 120);
      const feet = model.paws.map(footPosition);
      const contacts = offsets.map(offset => (cat.stride * 2 / (Math.PI * 2) + offset) % 1 < 0.62);
      feet.forEach((foot, i) => {
        expect(foot.y).toBeGreaterThanOrEqual(0.07 * 0.52 - 0.00001);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(model.paws[i].getWorldQuaternion(new THREE.Quaternion()));
        expect(up.y).toBeCloseTo(1, 7);
        if (contacts[i]) {
          contactSamples++;
          expect(foot.y).toBeCloseTo(0.07 * 0.52, 6);
          if (previousContacts[i]) expect(foot.distanceTo(previous[i])).toBeLessThan(0.00001);
        } else if (foot.y > 0.05) swingSamples++;
      });
      previous = feet; previousContacts = contacts;
    }
    expect(contactSamples).toBeGreaterThan(350); expect(swingSamples).toBeGreaterThan(60);
  });

  it('never changes a paused pose or accumulates offsets on repeated renders', () => {
    const { model, cat } = fixture('sleeping');
    model.root.position.set(2, 0.6, -1); model.root.rotation.y = 0.4;
    animateCat(model, cat, 2);
    cat.activity = 'walking'; animateCat(model, cat, 3); animateCat(model, cat, 3.1);
    const before = snapshot(model.root);
    for (let i = 0; i < 100; i++) animateCat(model, cat, 3.1);
    expect(snapshot(model.root)).toEqual(before);
    expect(model.root.position.toArray()).toEqual([2, 0.6, -1]); expect(model.root.rotation.y).toBe(0.4);
  });

  it('plants paws while backing out of the box without turning or changing the route', () => {
    const { model, cat } = fixture('crawling');
    const box = FURNITURE.find(spot => spot.id === 'box')!;
    const inside = box.route[box.route.length - 1];
    cat.position = { x: inside.x, z: inside.z }; cat.yaw = Math.PI;
    cat.visit = { id: 'box', phase: 'leave', route: [...box.route].reverse().slice(1).map(point => ({ ...point })),
      index: 0, progress: 0, from: { ...inside }, until: 0, leaveRequested: true };
    const routeBefore = JSON.stringify(cat.visit.route);
    const offsets = [0, 0.5, 0.75, 0.25];
    let previous: THREE.Vector3[] = [], previousContacts: boolean[] = [], checkedContacts = 0, lastTime = 0;
    for (let frame = 0; frame <= 320; frame++) {
      const time = frame / 120;
      if (frame) tickVisit(cat, time, 1 / 120, [cat]);
      model.root.position.set(cat.position.x, 0, cat.position.z); model.root.rotation.y = cat.yaw;
      animateCat(model, cat, time);
      const feet = model.paws.map(footPosition);
      const contacts = offsets.map(offset => (cat.stride * 3 / (Math.PI * 2) + offset) % 1 < 0.62);
      feet.forEach((foot, i) => {
        if (contacts[i] && previousContacts[i]) {
          expect(foot.distanceTo(previous[i])).toBeLessThan(0.00001); checkedContacts++;
        }
      });
      previous = feet; previousContacts = contacts;
      lastTime = time;
      if (cat.visit!.index === 2) break;
    }
    expect(checkedContacts).toBeGreaterThan(350);
    expect(cat.visit!.index).toBe(2);
    expect(cat.position.z).toBeGreaterThan(inside.z + 1.1);
    expect(cat.yaw).toBe(Math.PI); expect(cat.activity).toBe('crawling');
    expect(JSON.stringify(cat.visit!.route)).toBe(routeBefore);
    const beforePause = snapshot(model.root);
    animateCat(model, cat, lastTime); expect(snapshot(model.root)).toEqual(beforePause);
  });

  it('smoothly leaves sleep and completely restores the standing rig', () => {
    const { model, cat } = fixture('sleeping');
    animateCat(model, cat, 1);
    expect(model.eyes.every(eye => !eye.visible)).toBe(true);
    expect(model.closedEyes.every(eye => eye.visible)).toBe(true);
    const sleepingHeight = model.body.position.y;
    cat.activity = 'idle'; animateCat(model, cat, 2);
    expect(model.body.position.y).toBe(sleepingHeight);
    animateCat(model, cat, 2.1);
    expect(model.body.position.y).toBeGreaterThan(sleepingHeight);
    expect(model.body.position.y).toBeLessThan(-0.04);
    animateCat(model, cat, 2.21);
    expect(model.eyes.every(eye => eye.visible)).toBe(true);
    expect(model.closedEyes.every(eye => !eye.visible)).toBe(true);
    const fresh = fixture('idle'); animateCat(fresh.model, fresh.cat, 2.21);
    expect(snapshot(model.root)).toEqual(snapshot(fresh.model.root));
  });

  it('keeps cloned models and their blend histories independent', () => {
    const a = fixture('sleeping'), b = fixture('idle');
    animateCat(a.model, a.cat, 1); animateCat(b.model, b.cat, 1);
    const before = snapshot(b.model.root);
    a.cat.activity = 'grooming'; animateCat(a.model, a.cat, 2); animateCat(a.model, a.cat, 2.3);
    expect(snapshot(b.model.root)).toEqual(before);
    expect(a.model.paws[0]).not.toBe(b.model.paws[0]);
  });

  it('keeps the folded leg geometry above the floor in sleeping and crouching poses', () => {
    for (const activity of ['sleeping', 'hiding', 'crawling'] as CatActivity[]) {
      const { model, cat } = fixture(activity); animateCat(model, cat, 1);
      model.root.updateMatrixWorld(true);
      const vertex = new THREE.Vector3();
      let lowest = Infinity;
      model.legs.forEach(leg => leg.traverse(part => {
        if (!(part instanceof THREE.Mesh)) return;
        const positions = part.geometry.getAttribute('position');
        for (let i = 0; i < positions.count; i++) {
          vertex.fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
          lowest = Math.min(lowest, vertex.y);
        }
      }));
      expect(lowest, activity).toBeGreaterThanOrEqual(-0.005);
    }
  });

  it('tucks paws in flight and extends them at both jump endpoints without moving the gameplay root', () => {
    const { model, cat } = fixture('jumping');
    model.root.position.y = 0.8;
    cat.pose = 0; animateCat(model, cat, 1);
    const takeoff = model.paws.map(footPosition);
    cat.pose = 0.5; animateCat(model, cat, 1.2);
    model.paws.forEach((paw, i) => expect(footPosition(paw).y).toBeGreaterThan(takeoff[i].y + 0.1));
    cat.pose = 1; animateCat(model, cat, 1.4);
    model.paws.forEach((paw, i) => expect(footPosition(paw).distanceTo(takeoff[i])).toBeLessThan(0.000001));
    expect(model.root.position.y).toBe(0.8);
  });

  it('closes and opens a blink progressively without leaving the eyes squashed', () => {
    const { model, cat } = fixture();
    const closeAt = 4.7 - (cat.id * 1.371 + 1.1) % 4.7;
    const samples = [0, 0.035, 0.09, 0.18, 0.26].map(offset => {
      animateCat(model, cat, closeAt + offset);
      const shut = offset === 0.09;
      expect(model.eyes.every(eye => eye.visible === !shut)).toBe(true);
      expect(model.closedEyes.every(eye => eye.visible === shut)).toBe(true);
      return model.eyes[0].scale.y;
    });
    expect(samples[0]).toBeCloseTo(model.eyeHeight);
    expect(samples[1]).toBeLessThan(samples[0]); expect(samples[1]).toBeGreaterThan(samples[2]);
    expect(samples[3]).toBeGreaterThan(samples[2]); expect(samples[3]).toBeLessThan(samples[4]);
    expect(samples[4]).toBeCloseTo(model.eyeHeight);
  });

  it('compresses deeply, springs up with straight hind legs, then gathers them in flight', () => {
    const { model, cat } = fixture('jumping');
    const sample = (progress: number) => {
      cat.pose = progress; animateCat(model, cat, 1 + progress * JUMP_DURATION);
    };
    sample(0); const rest = model.body.position.y;
    sample(0.09); const compressed = model.body.position.y;
    expect(rest - compressed).toBeGreaterThan(0.16);
    for (const paw of model.paws.slice(2)) expect(footPosition(paw).y).toBeCloseTo(0.07 * 0.52, 6);
    sample(0.26);
    expect(model.body.position.y - compressed).toBeGreaterThan(0.27);
    // The knee must actually straighten; moving bent legs farther back is insufficient.
    for (const lower of model.lowerLegs.slice(2)) expect(Math.abs(lower.rotation.x)).toBeLessThan(0.15);
    sample(0.54);
    for (const lower of model.lowerLegs.slice(2)) expect(Math.abs(lower.rotation.x)).toBeGreaterThan(1);
    sample(0.88); expect(model.body.position.y).toBeLessThan(rest - 0.12);
    sample(1); expect(model.body.position.y).toBeCloseTo(rest);
  });

  it('leads with different front paws and lands the forelegs before gathering the hind legs', () => {
    for (const id of [0, 1]) {
      const { model, cat } = fixture('jumping'); cat.id = id;
      const sample = (progress: number) => {
        cat.pose = progress; animateCat(model, cat, 1 + progress * JUMP_DURATION);
        return model.paws.map(footPosition);
      };
      const ground = 0.07 * 0.52;
      const launch = sample(0.13);
      expect(launch[id].y).toBeGreaterThan(launch[1 - id].y);
      expect(launch[2].y).toBeCloseTo(ground, 6); expect(launch[3].y).toBeCloseTo(ground, 6);
      const tuck = sample(0.5);
      expect(Math.abs(tuck[0].y - tuck[1].y)).toBeGreaterThan(0.015);
      expect(Math.abs(tuck[2].z - tuck[3].z)).toBeGreaterThan(0.015);
      const contact = sample(JUMP_TOUCHDOWN);
      expect(contact[id].y).toBeCloseTo(ground, 6);
      expect(contact[1 - id].y).toBeGreaterThan(ground);
      expect(contact[2].y).toBeGreaterThan(ground + 0.02);
      expect(contact[3].y).toBeGreaterThan(ground + 0.02);
      const landed = sample(0.95);
      landed.forEach(foot => expect(foot.y).toBeCloseTo(ground, 6));
      const frozen = snapshot(model.root); animateCat(model, cat, 1 + 0.95 * JUMP_DURATION);
      expect(snapshot(model.root)).toEqual(frozen);
      sample(1); expect(model.body.position.y).toBeCloseTo(-0.04);
    }
  });

  it('holds the takeoff and landing surfaces for the paw contact phases on jumps up and down', () => {
    for (const [fromHeight, toHeight] of [[0, 0.65], [0.65, 0]]) {
      const { cat, model } = fixture('jumping'); cat.yaw = 0;
      cat.position = { x: 0, z: 0 }; cat.elevation = fromHeight;
      cat.visit = { id: 'tree', phase: 'approach', index: 0, progress: 0, until: 0, leaveRequested: false,
        from: { x: 0, z: 0, height: fromHeight }, route: [{ x: 0, z: 0.6, height: toHeight }] };
      for (let frame = 1; frame <= 121; frame++) {
        const time = frame * JUMP_DURATION / 120;
        tickVisit(cat, time, JUMP_DURATION / 120, [cat]);
        model.root.position.set(cat.position.x, cat.elevation, cat.position.z);
        animateCat(model, cat, time);
        if (cat.pose < JUMP_TAKEOFF) {
          expect(cat.position.z).toBe(0); expect(cat.elevation).toBe(fromHeight);
          expect(footPosition(model.paws[2]).y).toBeCloseTo(fromHeight + 0.07 * 0.52, 6);
        }
        if (cat.pose >= JUMP_TOUCHDOWN) {
          expect(cat.position.z).toBeCloseTo(0.6); expect(cat.elevation).toBe(toHeight);
          expect(footPosition(model.paws[cat.id % 2]).y).toBeCloseTo(toHeight + 0.07 * 0.52, 6);
        }
      }
      expect(cat.visit.index).toBe(1);
    }
  });

  it('uses visible curved lids for happy squints and restores open eyes afterwards', () => {
    const { model, cat } = fixture();
    animateCat(model, cat, 1, { happy: true });
    expect(model.closedEyes.every(eye => eye.visible)).toBe(true);
    expect(model.eyes.every(eye => !eye.visible)).toBe(true);
    animateCat(model, cat, 1.1); animateCat(model, cat, 1.4);
    expect(model.closedEyes.every(eye => !eye.visible)).toBe(true);
    expect(model.eyes.every(eye => eye.visible)).toBe(true);
    expect(model.eyes[0].scale.y).toBeCloseTo(model.eyeHeight);
  });

  it('produces finite transforms and above-floor paws through every interaction', () => {
    const activities: CatActivity[] = ['idle', 'walking', 'sniffing', 'jumping', 'crawling', 'perching', 'hiding', 'watching', 'sleeping', 'grooming', 'scratching', 'eating', 'playing', 'stretching'];
    for (const activity of activities) {
      const { model, cat } = fixture(activity);
      for (let frame = 0; frame < 40; frame++) {
        cat.stride = frame * 0.17; cat.pose = frame / 39;
        animateCat(model, cat, frame / 10, { angry: frame > 20 });
        expect(snapshot(model.root).every(Number.isFinite), activity).toBe(true);
        model.paws.forEach(paw => expect(footPosition(paw).y, activity).toBeGreaterThanOrEqual(0.07 * 0.52 - 0.00001));
      }
    }
  });
});
