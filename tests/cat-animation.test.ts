import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { animateCat } from '../src/cat-animation';
import { createCat } from '../src/cat-model';
import { PALETTE } from '../src/config';
import { Game } from '../src/simulation';
import { tickVisit } from '../src/cat-behavior';
import { FURNITURE } from '../src/furniture';
import type { CatActivity } from '../src/types';

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
