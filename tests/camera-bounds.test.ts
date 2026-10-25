import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../src/world';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';

function freeWorld() {
  const game = new Game(5), world = new World();
  game.restoreFreePlay(PALETTE.slice(0, 5).map(cat => cat.name)); game.startFreePlay();
  world.resize(390, 844); world.update(game, 0, 0);
  return world;
}
function expectNearPlaneInsideRoom(world: World) {
  world.camera.updateMatrixWorld();
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const point = new THREE.Vector3(x, y, -1).unproject(world.camera);
    expect(point.x).toBeGreaterThan(-4.8); expect(point.x).toBeLessThan(4.8);
    expect(point.y).toBeGreaterThan(0.07); expect(point.y).toBeLessThan(5.25);
    expect(point.z).toBeGreaterThan(-7.75); expect(point.z).toBeLessThan(7.7);
  }
}

describe('free camera room boundaries', () => {
  it('keeps movement and looking inside the room at both zoom extremes', () => {
    const world = freeWorld();
    for (const zoom of [-100, 100]) {
      world.zoomView(zoom);
      for (const direction of [-1, 1]) {
        world.translateView(direction * 100, direction * 100, direction * 100);
        world.lookView(direction * 2000, direction * 2000);
        expectNearPlaneInsideRoom(world);
      }
    }
  });
  it('raises the camera enough to keep wide-angle near-plane corners above the floor', () => {
    const world = freeWorld();
    world.translateView(0, -100, 0); world.zoomView(-100);
    world.lookView(0, 1000); expectNearPlaneInsideRoom(world);
    world.resize(1600, 400, { x: 0, y: 0, w: 1600, h: 400 });
    expectNearPlaneInsideRoom(world);
    world.resize(1600, 100, { x: 0, y: 0, w: 1600, h: 100 });
    expectNearPlaneInsideRoom(world);
  });
  it('retains full yaw and the default reset view', () => {
    const world = freeWorld();
    world.lookView(5000, 0);
    expect(Math.abs(world.camera.rotation.y)).toBeGreaterThan(Math.PI);
    world.resetView();
    expect(world.camera.position.toArray()).toEqual([0, 1.65, 5.8]);
    expectNearPlaneInsideRoom(world);
  });
});
