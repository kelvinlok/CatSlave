import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Game } from '../src/simulation';
import { WHEEL, WHEEL_RUN_SPEED, advanceWheelRun, wheelTreadRise } from '../src/cat-wheel';
import { clearFloor } from '../src/room-navigation';
import { createCat, disposeCat } from '../src/cat-model';
import { animateCat } from '../src/cat-animation';
import { PALETTE, ROOM } from '../src/config';

function fixture() {
  const game = new Game(82); game.reset(); game.phase = 'tutorial';
  const cat = game.cats[0]; cat.nextNeedAt = Infinity; cat.decisionAt = Infinity;
  return { game, cat };
}
function until(game: Game, predicate: () => boolean, seconds = 50) {
  for (let i = 0; i < seconds * 20 && !predicate(); i++) game.tick(.05);
  expect(predicate()).toBe(true);
}

describe('cat exercise wheel', () => {
  it('accepts a direct free-play invitation during an optional routine and confirms it', () => {
    const { game, cat } = fixture(); game.phase = 'free-play'; game.selectedFreeCatId = cat.id;
    game.freeRoam.reset(game.cats, 0); cat.activity = 'idle'; cat.decisionAt = 0; game.clock = 20;
    game.freeRoam.update(game.cats, game.clock, 0, { between: a => a });
    expect(game.freeRoam.busy(cat.id)).toBe(true);
    expect(game.inviteFreeCatToWheel()).toBe(true);
    expect(game.freeRoam.busy(cat.id)).toBe(false); expect(cat.visit?.id).toBe('wheel');
    expect(game.feedback).toBe(`${cat.name} is heading to the wheel!`);
    const visit = cat.visit;
    game.inviteFreeCatToWheel(); expect(cat.visit).toBe(visit);
    expect(game.feedback).toBe(`${cat.name} already has the wheel.`);
  });
  it('explains occupied wheels and cats on furniture without interrupting either visit', () => {
    const { game, cat } = fixture(); game.phase = 'free-play'; game.selectedFreeCatId = cat.id;
    const other = { ...cat, id: 100, position: { x: 0, z: 0 }, destination: { x: 0, z: 0 } };
    game.cats.push(other); expect(game.visitFurniture(other.id, 'wheel')).toBe(true);
    expect(game.inviteFreeCatToWheel()).toBe(false);
    expect(game.feedback).toBe('The wheel is busy. Try when it is free.');
    expect(cat.visit).toBeUndefined(); expect(other.visit?.id).toBe('wheel');
    other.visit = undefined; expect(game.visitFurniture(cat.id, 'tree')).toBe(true);
    const visit = cat.visit;
    expect(game.inviteFreeCatToWheel()).toBe(false); expect(cat.visit).toBe(visit);
    expect(game.feedback).toBe(`${cat.name} is busy. Try after they step down.`);
  });
  it('approaches, runs in place, brakes to a stop, and returns to clear floor', () => {
    const { game, cat } = fixture();
    expect(game.visitFurniture(cat.id, 'wheel')).toBe(true);
    let previous = { ...cat.position, y: cat.elevation };
    until(game, () => {
      expect(Math.hypot(cat.position.x - previous.x, cat.position.z - previous.z, cat.elevation - previous.y)).toBeLessThan(.3);
      previous = { ...cat.position, y: cat.elevation };
      return game.wheelSpeed === WHEEL_RUN_SPEED;
    });
    expect(cat.activity).toBe('running');
    const placedWheel = game.roomLayout.layout.placed.wheel;
    expect(cat.position).toEqual({ x: placedWheel.x, z: placedWheel.z });
    expect(cat.elevation).toBeCloseTo(WHEEL.height);
    expect(cat.yaw).toBeCloseTo(Math.PI / 2, 2);
    const stride = cat.stride, angle = game.wheelAngle, position = { ...cat.position };
    game.tick(.6);
    expect(cat.position).toEqual(position);
    expect(cat.stride - stride).toBeCloseTo(WHEEL_RUN_SPEED * .6 * 10, 8);
    expect(game.wheelAngle - angle).toBeCloseTo(-(cat.stride - stride) / (10 * WHEEL.innerRadius), 8);
    until(game, () => cat.visit?.phase === 'leave');
    expect(game.wheelSpeed).toBe(0);
    const stoppedAngle = game.wheelAngle;
    until(game, () => !cat.visit);
    expect(cat.elevation).toBe(0); expect(clearFloor(cat.position, 'whole-room', game.roomLayout.navigation)).toBe(true);
    expect(cat.lastFurniture).toBe('wheel'); expect(game.wheelAngle).toBe(stoppedAngle);
  });

  it('reserves the wheel through braking and exit, then permits the next cat', () => {
    const { game, cat } = fixture();
    const other = { ...cat, id: 100, position: { x: 0, z: 0 }, destination: { x: 0, z: 0 } };
    game.cats.push(other);
    expect(game.visitFurniture(cat.id, 'wheel')).toBe(true);
    expect(game.visitFurniture(other.id, 'wheel')).toBe(false);
    until(game, () => game.wheelSpeed === WHEEL_RUN_SPEED);
    game.spawn(cat, 'hunger');
    expect(game.events).toHaveLength(0); expect(cat.pendingNeed).toBe('hunger');
    game.tick(.1);
    expect(game.wheelSpeed).toBeGreaterThan(0); expect(game.wheelSpeed).toBeLessThan(WHEEL_RUN_SPEED);
    expect(game.visitFurniture(other.id, 'wheel')).toBe(false);
    until(game, () => cat.visit?.phase === 'leave');
    expect(game.wheelSpeed).toBe(0); expect(game.visitFurniture(other.id, 'wheel')).toBe(false);
    until(game, () => game.events.length > 0);
    expect(cat.visit).toBeUndefined(); expect(cat.elevation).toBe(0);
    expect(clearFloor(game.events[0].position, 'whole-room', game.roomLayout.navigation)).toBe(true);
    expect(game.visitFurniture(other.id, 'wheel')).toBe(true);
  });

  it('freezes tread and running pose during pause and resets both on restart', () => {
    const { game, cat } = fixture(); game.visitFurniture(cat.id, 'wheel');
    until(game, () => game.wheelSpeed === WHEEL_RUN_SPEED);
    game.pause();
    const before = JSON.stringify({ cat, angle: game.wheelAngle, speed: game.wheelSpeed });
    game.tick(30);
    expect(JSON.stringify({ cat, angle: game.wheelAngle, speed: game.wheelSpeed })).toBe(before);
    game.resume(); const angle = game.wheelAngle; game.tick(.1);
    expect(game.wheelAngle).toBeLessThan(angle);
    game.startStage();
    expect(game.wheelAngle).toBe(0); expect(game.wheelSpeed).toBe(0);
    expect(game.cats[0].visit).toBeUndefined(); expect(game.cats[0].wheelRunSpeed).toBe(0);
    game.wheelAngle = -2; game.wheelSpeed = 1; game.reset(true);
    expect(game.wheelAngle).toBe(0); expect(game.wheelSpeed).toBe(0);
  });

  it('integrates acceleration consistently even when a step reaches target speed', () => {
    const a = fixture().cat, b = fixture().cat;
    const single = advanceWheelRun(a, 1.2, false);
    let split = 0;
    for (let i = 0; i < 24; i++) split += advanceWheelRun(b, .05, false);
    expect(single).toBeCloseTo(split, 10); expect(a.stride).toBeCloseTo(b.stride, 10);
    expect(a.wheelRunSpeed).toBe(WHEEL_RUN_SPEED);
    const braking = advanceWheelRun(a, 2, true);
    expect(braking).toBeCloseTo(WHEEL_RUN_SPEED ** 2 / 4, 10);
    expect(a.wheelRunSpeed).toBe(0);
  });

  it('uses the longer free-play visit and freezes it while the menu is paused', () => {
    const { game, cat } = fixture(); game.phase = 'free-play';
    expect(game.visitFurniture(cat.id, 'wheel')).toBe(true);
    until(game, () => cat.visit?.phase === 'use');
    expect(cat.visit!.until - game.clock).toBeCloseTo(24);
    game.tick(2); expect(game.wheelSpeed).toBe(WHEEL_RUN_SPEED);
    game.pause(); const angle = game.wheelAngle, stride = cat.stride;
    game.tick(10); expect(game.wheelAngle).toBe(angle); expect(cat.stride).toBe(stride);
    game.resume(); game.tick(.1); expect(game.wheelAngle).toBeLessThan(angle);
    expect(game.interactFreeCat('wand', cat.id)).toBe(true);
    until(game, () => !cat.visit);
    expect(game.wheelSpeed).toBe(0); expect(cat.elevation).toBe(0); expect(clearFloor(cat.position, 'whole-room', game.roomLayout.navigation)).toBe(true);
  });

  it('keeps paws on or above the curved inner tread and preserves a paused pose', () => {
    const { cat } = fixture(); cat.activity = 'running'; cat.wheelRunSpeed = WHEEL_RUN_SPEED;
    const model = createCat(PALETTE[0]); model.root.scale.setScalar(ROOM.catScale);
    model.root.position.set(WHEEL.x, WHEEL.height, WHEEL.z); model.root.rotation.y = Math.PI / 2;
    let grounded = 0, lifted = 0;
    for (let frame = 0; frame <= 120; frame++) {
      cat.stride = frame / 120 * Math.PI * 2 / 1.4;
      animateCat(model, cat, frame / 120); model.root.updateMatrixWorld(true);
      for (const paw of model.paws) {
        const point = paw.getWorldPosition(new THREE.Vector3());
        const tread = WHEEL.height + wheelTreadRise(point.x - WHEEL.x) + .07 * ROOM.catScale;
        expect(point.y).toBeGreaterThanOrEqual(tread - 1e-6);
        if (Math.abs(point.y - tread) < .001) grounded++; else lifted++;
        const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(paw.getWorldQuaternion(new THREE.Quaternion()));
        expect(normal.x).toBeCloseTo(-(point.x - WHEEL.x) / WHEEL.innerRadius, 2);
      }
    }
    const snapshot = () => model.paws.map(paw => [...paw.position.toArray(), ...paw.quaternion.toArray()]);
    const before = snapshot();
    for (let i = 0; i < 10; i++) animateCat(model, cat, 1);
    expect(snapshot()).toEqual(before); expect(grounded).toBeGreaterThan(200); expect(lifted).toBeGreaterThan(100);
    disposeCat(model);
  });
});
