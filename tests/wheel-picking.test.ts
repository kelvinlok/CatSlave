import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { World } from '../src/world';
import { WHEEL } from '../src/cat-wheel';
import { isWheelMesh } from '../src/room-asset';

function fixture() {
  const world = new World();
  world.resize(600, 800, { x: 0, y: 0, w: 600, h: 800 });
  world.camera.position.set(WHEEL.x, WHEEL.centerY, WHEEL.z + 8);
  world.camera.lookAt(WHEEL.x, WHEEL.centerY, WHEEL.z);
  world.camera.zoom = 1; world.camera.updateProjectionMatrix();
  const room = world.scene.getObjectByName('video-lounge') as THREE.Group;
  room.clear(); room.userData.loaded = true;
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(WHEEL.outerRadius - .05, .05, 6, 24), new THREE.MeshBasicMaterial());
  wheel.userData.catWheel = true;
  wheel.position.set(WHEEL.x, WHEEL.centerY, WHEEL.z);
  room.add(wheel);
  const background = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial());
  background.position.set(WHEEL.x, WHEEL.centerY, WHEEL.z - 1); room.add(background);
  const target = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL.outerRadius, WHEEL.outerRadius, WHEEL.depth + .12, 48),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  target.rotation.x = Math.PI / 2; target.position.copy(wheel.position); target.updateMatrixWorld(true);
  const reference = (x: number, y: number) => {
    world.camera.updateMatrixWorld(); room.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(x / 600 * 2 - 1, 1 - y / 800 * 2), world.camera);
    const hit = ray.intersectObject(room, true)[0];
    if (hit && isWheelMesh(hit.object)) return true;
    const volume = ray.intersectObject(target)[0];
    return !!volume && (!hit || volume.distance < hit.distance);
  };
  return { world, room, wheel, background, reference };
}

describe('wheel pointer broad phase', () => {
  it('matches full-room picking across the viewport, including open-center taps', () => {
    const { world, reference } = fixture();
    for (let y = 20; y < 800; y += 40) for (let x = 20; x < 600; x += 40) {
      expect(world.wheelHit({ x, y }), `${x},${y}`).toBe(reference(x, y));
    }
    expect(world.wheelHit({ x: 300, y: 400 })).toBe(true);
  });

  it('still rejects a wheel behind furniture and sees moving wheel surfaces outside the tap volume', () => {
    const { world, room, wheel, reference } = fixture();
    const occluder = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial());
    occluder.position.set(WHEEL.x, WHEEL.centerY, WHEEL.z + 1); room.add(occluder);
    expect(world.wheelHit({ x: 300, y: 400 })).toBe(false);
    occluder.removeFromParent();
    // Change the actual cached surface's transform after the first pointer test.
    wheel.position.x += 2;
    const point = world.project(new THREE.Vector3(wheel.position.x + WHEEL.outerRadius - .05, wheel.position.y, wheel.position.z));
    expect(world.wheelHit(point)).toBe(true);
    expect(reference(point.x, point.y)).toBe(true);
    for (const x of [120, 300, 480]) expect(world.wheelHit({ x, y: 400 })).toBe(reference(x, 400));
  });

  it('does not raycast room furniture for pointer moves that miss all wheel targets', () => {
    const { world, background, reference } = fixture();
    const raycast = vi.spyOn(background, 'raycast');
    for (let i = 0; i < 100; i++) reference(10, 10);
    expect(raycast).toHaveBeenCalledTimes(100);
    raycast.mockClear();
    for (let i = 0; i < 100; i++) expect(world.wheelHit({ x: 10, y: 10 })).toBe(false);
    expect(raycast).not.toHaveBeenCalled();
  });
});
