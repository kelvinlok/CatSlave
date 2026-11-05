import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Game } from '../src/simulation';
import { PALETTE, STRETCH_DURATION, TOOLS, ROOM } from '../src/config';
import { createCat } from '../src/cat-model';
import { animateCat } from '../src/cat-animation';

function restingGame() {
  const game = new Game(42); game.reset(); const cat = game.cats[0];
  cat.position = { x: 0, z: 0 }; cat.destination = { ...cat.position }; cat.yaw = 0;
  cat.decisionAt = Infinity; cat.nextNeedAt = Infinity; cat.nextStretchAt = 0;
  return { game, cat };
}

describe('occasional stretch', () => {
  it('runs one stretch in place, freezes on pause, then recovers with a cooldown', () => {
    const { game, cat } = restingGame(); game.tick(0.02);
    expect(cat.activity).toBe('stretching');
    const start = cat.stretchStartedAt!;
    game.tick(STRETCH_DURATION / 2); expect(cat.pose).toBeCloseTo(0.5, 4);
    const progress = cat.pose; game.pause(); game.tick(20);
    expect(cat.pose).toBe(progress); expect(cat.position).toEqual({ x: 0, z: 0 });
    game.resume(); game.tick(STRETCH_DURATION / 2 + 0.1);
    expect(cat.activity).toBe('idle'); expect(cat.stretchStartedAt).toBeUndefined();
    expect(cat.nextStretchAt! - start).toBeGreaterThanOrEqual(28);
    expect(cat.nextStretchAt! - start).toBeLessThanOrEqual(44);
  });

  it('defers near walls, occupied paw space and active needs, and cancels when care arrives', () => {
    const { game, cat } = restingGame();
    cat.position.z = ROOM.maxZ - 0.1; game.tick(0.05); expect(cat.activity).not.toBe('stretching');
    cat.position.z = 0;
    const other = { ...cat, id: 999, position: { x: 0, z: 0.65 }, destination: { x: 0, z: 0.65 }, nextStretchAt: Infinity };
    game.cats.push(other); game.tick(0.05); expect(cat.activity).not.toBe('stretching');
    game.cats.pop(); game.tick(0.05); expect(cat.activity).toBe('stretching');
    game.spawn(cat, 'hunger'); game.tick(0.05);
    expect(cat.activity).toBe('sniffing'); expect(cat.stretchStartedAt).toBeUndefined();
    cat.nextStretchAt = 0; game.tick(5); expect(cat.activity).not.toBe('stretching');
  });

  it('occurs naturally between care and furniture visits without forcing the activity', () => {
    const game = new Game(42); game.reset(); game.stageElapsed = -1000;
    let stretches = 0, previous = '';
    for (let i = 0; i < 900; i++) {
      for (const event of [...game.events]) { game.select(TOOLS.find(tool => tool.need === event.kind)!.id); game.work(event.id, 100); }
      game.tick(0.2);
      const activity = game.cats[0].activity;
      if (activity === 'stretching' && previous !== activity) stretches++;
      previous = activity;
    }
    expect(stretches).toBeGreaterThanOrEqual(2);
    expect(stretches).toBeLessThanOrEqual(7);
  });

  it('bows the chest, reaches forward, plants the paws and restores every reference rig', () => {
    for (const definition of PALETTE.slice(0, 4)) {
      const model = createCat(definition), cat = new Game(42).cats[0];
      cat.activity = 'stretching'; model.root.scale.setScalar(ROOM.catScale);
      cat.pose = 0; animateCat(model, cat, 0);
      const standingHead = model.head.position.y;
      const standingFront = model.paws[0].getWorldPosition(new THREE.Vector3()).z;
      for (let frame = 0; frame <= 30; frame++) {
        cat.pose = frame / 30; animateCat(model, cat, frame / 30 * STRETCH_DURATION);
        model.root.updateMatrixWorld(true);
        for (const paw of model.paws) {
          expect(paw.getWorldPosition(new THREE.Vector3()).y).toBeGreaterThanOrEqual(0.07 * ROOM.catScale - 0.00001);
          expect(new THREE.Vector3(0, 1, 0).applyQuaternion(paw.getWorldQuaternion(new THREE.Quaternion())).y).toBeCloseTo(1, 6);
        }
        if (frame === 15) {
          expect(model.head.position.y).toBeLessThan(standingHead - 0.35);
          expect(model.legs[2].position.y - model.legs[0].position.y).toBeGreaterThan(0.20);
          expect(model.paws[0].getWorldPosition(new THREE.Vector3()).z - standingFront).toBeGreaterThan(0.19);
          const vertex = new THREE.Vector3(); let lowest = Infinity;
          for (const part of [model.body, model.head, ...model.legs]) part.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const positions = object.geometry.getAttribute('position');
            for (let i = 0; i < positions.count; i++) lowest = Math.min(lowest, vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).y);
          });
          expect(lowest, definition.name).toBeGreaterThanOrEqual(-0.005);
          const pose = model.head.position.clone(); animateCat(model, cat, frame / 30 * STRETCH_DURATION);
          expect(model.head.position.equals(pose)).toBe(true);
        }
      }
      expect(model.body.position.z).toBeCloseTo(0); expect(model.body.rotation.x).toBeCloseTo(0);
      expect(model.legs[0].position.y).toBeCloseTo(model.legs[2].position.y);
    }
  });

  it('bends boot cuffs with the shins through a stretch without deforming the soles or another cat', () => {
    for (const definition of PALETTE) {
      const model = createCat(definition), twin = createCat(definition), cat = new Game(42).cats[0];
      cat.activity = 'stretching';
      const point = new THREE.Vector3(), expected = new THREE.Vector3(), axis = new THREE.Vector3(1, 0, 0);
      const ankle = new THREE.Vector3(0, 0, -.067);
      let cuffSamples = 0, rigidError = 0, cuffError = 0;
      for (const progress of [0, .15, .3, .5, .7, .85, 1]) {
        cat.pose = progress; animateCat(model, cat, progress * STRETCH_DURATION);
        for (let foot = 0; foot < 4; foot++) {
          const shoe = model.root.getObjectByName(`christmas-shoe${foot}`)!;
          shoe.traverse(object => {
            if (!(object instanceof THREE.Mesh)) return;
            const positions = object.geometry.getAttribute('position'), flex = object.geometry.getAttribute('ankleFlex');
            if (!flex) return;
            const sibling = twin.root.getObjectByName(object.name) as THREE.Mesh;
            expect(object.geometry).toBe(sibling.geometry);
            expect(sibling.morphTargetInfluences?.every(weight => weight === 0)).toBe(true);
            for (let vertex = 0; vertex < positions.count; vertex++) {
              object.getVertexPosition(vertex, point);
              expected.fromBufferAttribute(positions, vertex);
              if (flex.getX(vertex) === 0) {
                // Any changing toe or sole can rock the contact or expose fur.
                rigidError = Math.max(rigidError, point.distanceTo(expected));
              } else if (positions.getY(vertex) > .07) {
                expected.sub(ankle).applyAxisAngle(axis, -model.paws[foot].rotation.x).add(ankle);
                // Adjacent rotation samples preserve a round, shin-aligned
                // opening within 4 mm through reach, hold and recovery.
                cuffError = Math.max(cuffError, point.distanceTo(expected));
                cuffSamples++;
              }
            }
          });
        }
      }
      expect(cuffSamples, definition.name).toBeGreaterThan(0);
      expect(rigidError, definition.name).toBeLessThan(.000001);
      expect(cuffError, definition.name).toBeLessThan(.004);
    }
  });
});
