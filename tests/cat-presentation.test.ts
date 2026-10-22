import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCat } from '../src/cat-model';
import { Game } from '../src/simulation';
import { World } from '../src/world';
import { ROOM } from '../src/config';

describe('cat presentation', () => {
  it('keeps the shared floor in view in portrait and landscape without turning', () => {
    const world = new World();
    for (const [w, h] of [[390, 844], [320, 568], [844, 390]]) {
      world.resize(w, h);
      for (const x of [ROOM.minX, ROOM.maxX]) for (const z of [ROOM.minZ, ROOM.maxZ]) {
        const p = world.project(new THREE.Vector3(x, 0.07, z));
        expect(p.visible).toBe(true); expect(p.x).toBeGreaterThan(24); expect(p.x).toBeLessThan(w - 24);
        expect(p.y).toBeGreaterThan(90); expect(p.y).toBeLessThan(h - 90);
      }
    }
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
    expect(world.attackAge).toBeCloseTo(0.3); expect(world.camera.position.toArray()).toEqual([0, 5, 9]);
    expect(world.attackScene.children.some(c => c instanceof THREE.Group && c.visible)).toBe(true);
    game.pause(); world.update(game, 1, 24); expect(world.attackAge).toBeCloseTo(0.3);
    game.resume(); game.hp = 10; game.tick(4); world.update(game, 0.2, 27);
    expect(game.phase).toBe('game-over'); expect(world.attackAge).toBeCloseTo(0.2);
    world.update(game, 1.2, 28); expect(world.attackAge).toBeGreaterThan(1.15);
    game.reset(); world.update(game, 0, 29);
    expect(world.attackScene.children.some(c => c instanceof THREE.Group && c.visible)).toBe(false);
  });
});
