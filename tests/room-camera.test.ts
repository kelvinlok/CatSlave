import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ENTRANCE_DURATION, entrancePose, MAIN_VIEW, ROOM_EYE } from '../src/room-camera';
import { Game } from '../src/simulation';
import { World } from '../src/world';
import { ROOM_ENTRANCE } from '../src/room-boundaries';

describe('lounge entrance camera', () => {
  it('passes through the glass opening, avoids the wheel and lands exactly on the main view', () => {
    const camera = new THREE.PerspectiveCamera();
    entrancePose(camera, 0);
    expect(camera.position.z).toBeGreaterThan(8);
    let crossedDoor = false;
    for (let frame = 0; frame <= 380; frame++) {
      entrancePose(camera, frame / 380);
      const { x, y, z } = camera.position;
      expect(y).toBeGreaterThan(1.6);
      if (z >= 7.85) { expect(Math.abs(x - ROOM_ENTRANCE.x)).toBeLessThan(ROOM_ENTRANCE.width / 2 - 0.15); }
      if (z > 7.9 && z < 8.1) crossedDoor = true;
      // The wheel is centered at (-1.65, 1.5, 6.5), radius 1.3, depth .9.
      if (z > 5.9 && z < 7.1) expect(x).toBeLessThan(-3.1);
    }
    expect(crossedDoor).toBe(true);
    expect(camera.position.distanceTo(ROOM_EYE)).toBeLessThan(1e-9);
    expect(camera.zoom).toBe(MAIN_VIEW.zoom);
    expect(camera.rotation.x).toBeCloseTo(-MAIN_VIEW.pitch);
  });

  it('freezes on pause, survives resize, finishes smoothly and can be skipped', () => {
    const game = new Game(42), world = new World(); game.reset(); world.resize(390, 844);
    world.startEntrance(); world.update(game, 0, 0, 1);
    const progress = world.entranceProgress, position = world.camera.position.clone();
    game.pause(); world.update(game, 0, 0, 10);
    expect(world.entranceProgress).toBe(progress);
    expect(world.camera.position.equals(position)).toBe(true);
    world.resize(320, 568);
    expect(world.camera.position.equals(position)).toBe(true);
    game.resume(); world.update(game, 0, 0, ENTRANCE_DURATION);
    expect(world.enteringRoom).toBe(false);
    expect(world.camera.position.distanceTo(ROOM_EYE)).toBeLessThan(1e-9);
    const final = world.camera.quaternion.clone(); world.resetView();
    expect(world.camera.quaternion.angleTo(final)).toBeLessThan(1e-7);
    world.startEntrance(); world.finishEntrance();
    expect(world.enteringRoom).toBe(false);
    expect(world.camera.position.equals(ROOM_EYE)).toBe(true);
    world.startEntrance(); game.phase = 'title'; world.update(game, 0, 0);
    expect(world.enteringRoom).toBe(false);
  });

  it('widens the main view while preserving free-play defaults and full turning', () => {
    const game = new Game(42), world = new World(); world.resize(390, 844);
    expect(world.camera.zoom).toBe(MAIN_VIEW.zoom);
    world.lookView(-10000, 0); expect(world.camera.rotation.y).toBeCloseTo(MAIN_VIEW.yawLimit);
    world.lookView(20000, 0); expect(world.camera.rotation.y).toBeCloseTo(-MAIN_VIEW.yawLimit);
    game.phase = 'free-play'; world.update(game, 0, 0);
    expect(world.viewZoom).toBe(1.65);
    world.lookView(10000, 0); expect(Math.abs(world.camera.rotation.y)).toBeGreaterThan(Math.PI);
  });

  it('keeps the first cat visible when the main game begins on phone and desktop frames', () => {
    const game = new Game(42), world = new World(); game.reset();
    for (const [width, height] of [[390, 844], [320, 568], [520, 900]]) {
      world.resize(width, height); world.resetView(); world.update(game, 0, 0);
      const cat = game.cats[0];
      const point = world.project(new THREE.Vector3(cat.position.x, 0.6, cat.position.z));
      expect(point.visible).toBe(true);
      expect(point.x).toBeGreaterThan(world.viewport.x + 20);
      expect(point.x).toBeLessThan(world.viewport.x + world.viewport.w - 20);
    }
  });
});
