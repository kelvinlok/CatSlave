import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCat } from '../src/cat-model';
import { Game } from '../src/simulation';
import { World } from '../src/world';
import { ROOM } from '../src/config';

describe('cat presentation', () => {
  it('can look toward every floor corner on portrait screens without moving the eye', () => {
    const world = new World();
    for (const [w, h] of [[390, 844], [320, 568], [390, 664]]) {
      world.resize(w, h);
      for (const x of [ROOM.minX, ROOM.maxX]) for (const z of [ROOM.minZ, ROOM.maxZ]) {
        world.focusOn(new THREE.Vector3(x, 0.07, z));
        const p = world.project(new THREE.Vector3(x, 0.07, z));
        expect(p.visible).toBe(true); expect(p.x).toBeGreaterThan(24); expect(p.x).toBeLessThan(w - 24);
        expect(p.y).toBeGreaterThan(90); expect(p.y).toBeLessThan(h - 90);
      }
    }
  });
  it('uses a low eye position, turns in the swipe direction, and keeps picking aligned', () => {
    const world = new World(); world.resize(390, 844);
    const position = new THREE.Vector3(0, 0.5, 0);
    const size = () => world.project(position).x - world.project(position.clone().add(new THREE.Vector3(-1, 0, 0))).x;
    const close = size(); world.zoomView(-10); expect(close / size()).toBeCloseTo(1.65);
    world.resetView(); const rotation = world.camera.quaternion.clone(), eye = world.camera.position.clone();
    const direction = new THREE.Vector3(); world.camera.getWorldDirection(direction);
    expect(THREE.MathUtils.radToDeg(Math.asin(-direction.y))).toBeLessThan(15);
    world.lookView(100, -100); world.camera.getWorldDirection(direction);
    expect(direction.x).toBeGreaterThan(0); expect(direction.y).toBeGreaterThan(0);
    expect(world.camera.quaternion.equals(rotation)).toBe(false);
    expect(world.camera.position.equals(eye)).toBe(true);
    world.lookView(1e6, 1e6);
    expect(world.camera.rotation.z).toBe(0);
    expect(world.camera.rotation.x).toBeCloseTo(-THREE.MathUtils.degToRad(65));
    expect(world.camera.rotation.y).toBeCloseTo(-THREE.MathUtils.degToRad(75));
    expect(world.camera.position.equals(eye)).toBe(true);
    for (const x of [ROOM.minX, ROOM.maxX]) for (const z of [ROOM.minZ, ROOM.maxZ]) {
      position.set(x, 0.1, z); world.focusOn(position);
      const p = world.project(position), v = world.viewport;
      expect(p.x).toBeGreaterThan(v.x + 32); expect(p.x).toBeLessThan(v.x + v.w - 32);
      expect(p.y).toBeGreaterThan(v.y + 32); expect(p.y).toBeLessThan(v.y + v.h - 32);
    }
    const game = new Game(1); game.reset(); world.update(game, 0, 0); world.scene.updateMatrixWorld(true);
    position.set(game.cats[0].position.x, 0.4, game.cats[0].position.z); world.focusOn(position);
    const p = world.project(position); expect(world.pickCat(p.x, p.y)).toBe(game.cats[0].id);
    world.resize(320, 568); expect(world.viewZoom).toBe(1.65);
    world.resetView(); expect(world.camera.position.toArray()).toEqual([0, 1.65, 5.8]);
    expect(world.camera.quaternion.equals(rotation)).toBe(true);
  });
  it('has four separately animated legs with grounded paws and independently cloned poses', () => {
    const coat = { color: '#e4b16d', accent: '#a76e3b' };
    const a = createCat(coat), b = createCat(coat);
    expect(a.legs).toHaveLength(4);
    for (const leg of a.legs) {
      const bounds = new THREE.Box3().setFromObject(leg);
      expect(bounds.min.y).toBeCloseTo(0, 3);
    }
    a.legs[0].rotation.x = 1;
    expect(b.legs[0].rotation.x).toBeCloseTo(0);
    expect(new Set(a.legs.map(l => `${l.position.x}:${l.position.z}`)).size).toBe(4);
  });
  it('renders a cleaning mess at its captured floor position as its owner walks away', () => {
    const game = new Game(8), world = new World(); game.reset(); game.spawn(game.cats[0], 'vomit');
    const event = game.events[0]; world.update(game, 0, 0);
    const origin = world.eventPosition(event).clone();
    game.tick(8); world.update(game, 0, 8);
    expect(world.eventPosition(event).equals(origin)).toBe(true);
    expect(world.catPosition(event.catId)!.distanceTo(origin)).toBeGreaterThan(0.1);
  });
  it('plays full-screen and fatal attacks, freezes on pause, and clears on restart', () => {
    const game = new Game(8), world = new World(); game.reset(); game.spawn(game.cats[0], 'poop');
    game.tick(23); world.update(game, 0.3, 23);
    expect(world.attackAge).toBeCloseTo(0.3); expect(world.camera.position.toArray()).toEqual([0, 1.65, 5.8]);
    expect(world.attackScene.children.some(c => c instanceof THREE.Group && c.visible)).toBe(true);
    game.pause(); world.update(game, 1, 24); expect(world.attackAge).toBeCloseTo(0.3);
    game.resume(); game.hp = 10; game.tick(4); world.update(game, 0.2, 27);
    expect(game.phase).toBe('game-over'); expect(world.attackAge).toBeCloseTo(0.2);
    world.update(game, 1.2, 28); expect(world.attackAge).toBeGreaterThan(1.15);
    game.reset(); world.update(game, 0, 29);
    expect(world.attackScene.children.some(c => c instanceof THREE.Group && c.visible)).toBe(false);
  });
});
