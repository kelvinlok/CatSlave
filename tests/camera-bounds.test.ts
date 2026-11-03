import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { World } from '../src/world';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';
import { roomFloorContains } from '../src/room-boundaries';
import { createRoom } from '../src/room-asset';
import layout from '../assets/lounge/layout.json';

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
    expect(roomFloorContains(point)).toBe(true);
    expect(point.y).toBeGreaterThan(0.07); expect(point.y).toBeLessThan(5.25);
    if (point.x > 4.9 && point.x < 5.1) {
      expect(point.z).toBeGreaterThan(layout.opening.minZ); expect(point.z).toBeLessThan(layout.opening.maxZ);
      expect(point.y).toBeLessThan(4.1);
    }
  }
}

describe('free camera room boundaries', () => {
  it('moves through the right opening but cannot tunnel through the solid wall or header', () => {
    const world = freeWorld();
    world.camera.quaternion.identity(); world.camera.position.set(0, 1.65, 0);
    world.translateView(7, 0, 0);
    expect(world.camera.position.x).toBeCloseTo(7); expectNearPlaneInsideRoom(world);
    world.translateView(-7, 0, 0); expect(world.camera.position.x).toBeCloseTo(0);
    for (const [y, z] of [[1.65, -6], [1.65, 6], [1.65, 1.5], [4.7, 0]]) {
      world.camera.position.set(0, y, z); world.translateView(100, 0, 0);
      expect(world.camera.position.x).toBeLessThan(5); expectNearPlaneInsideRoom(world);
    }
    world.camera.position.set(layout.blockedFloor.minX - .9, 1.65, -4); world.translateView(5.5, 0, 7);
    expect(world.camera.position.x).toBeLessThan(5); expectNearPlaneInsideRoom(world);
  });
  it('reaches the expanded left room and stops at the projecting wall without cutting its corner', () => {
    const world = freeWorld(); world.camera.quaternion.identity();
    world.camera.position.set(0, 1.65, -4); world.translateView(-100, 0, 0);
    expect(world.camera.position.x).toBeLessThan(-7);
    expect(world.camera.position.x).toBeGreaterThan(layout.mainRoom.minX);
    expectNearPlaneInsideRoom(world);
    for (const [dx, dz] of [[100, 0], [5.5, 4]]) {
      world.camera.position.set(layout.blockedFloor.minX - .9, 1.65, -4); world.translateView(dx, 0, dz);
      expect(world.camera.position.x).toBeLessThan(layout.blockedFloor.minX);
      expect(world.camera.position.z).toBeLessThan(layout.blockedFloor.maxZ);
      expectNearPlaneInsideRoom(world);
    }
  });
  it('stops against the broad shelf wall while retaining the aisle to the sunroom', () => {
    const world = freeWorld(); world.camera.quaternion.identity();
    world.camera.position.set(3.2, 1.65, 0); world.translateView(0, 0, -100);
    expect(world.camera.position.z).toBeGreaterThan(-1.1);
    expect(world.camera.position.z).toBeLessThan(0);
    expectNearPlaneInsideRoom(world);
    world.camera.position.set(3.2, 1.65, 0); world.translateView(3.8, 0, 0);
    expect(world.camera.position.x).toBeCloseTo(7); expectNearPlaneInsideRoom(world);
  });
  it('places the loading-shell projecting wall and front face on the same room boundary', () => {
    const room = createRoom(); room.updateMatrixWorld(true);
    const cast = (origin: THREE.Vector3, direction: THREE.Vector3) => new THREE.Raycaster(origin, direction).intersectObject(room, true)[0];
    expect(cast(new THREE.Vector3(0, 2, -3), new THREE.Vector3(1, 0, 0)).point.x).toBeCloseTo(1.3);
    expect(cast(new THREE.Vector3(3.2, 2, 0), new THREE.Vector3(0, 0, -1)).point.z).toBeCloseTo(-1.1);
  });
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
    expect(world.camera.position.toArray()).toEqual([0, 1.65, 4.8]);
    expectNearPlaneInsideRoom(world);
  });
});
