import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { World } from '../src/world';
import { winBonus } from './support/bonus';

function victory() {
  const game = new Game(5);
  game.reset();
  for (const tool of ['sweeper', 'mop', 'brush', 'food'] as const) {
    game.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); game.tick(game.timeLeft); winBonus(game);
    game.adopt(game.candidates[0].id); game.upgrade(tool); game.upgrade(tool);
  }
  game.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); game.tick(game.timeLeft);
  return game;
}
function previews(world: World) {
  return world.scene.getObjectsByProperty('type', 'Group').filter(object => object.name.startsWith('preview-cat-'));
}

describe('victory celebration', () => {
  it('brings every adopted cat closer, facing the player with happy eyes, without changing the saved cats', () => {
    const game = victory(), world = new World(), savedCats = JSON.stringify(game.cats);
    expect(game.phase).toBe('victory');
    world.resize(390, 844, { x: 6, y: 108, w: 378, h: 578 }); world.update(game, 0, 100);
    const cats = previews(world), starts = cats.map(cat => cat.position.distanceTo(world.camera.position));
    expect(cats.map(cat => cat.userData.catId)).toEqual(game.cats.map(cat => cat.id));
    for (let frame = 1; frame <= 120; frame++) world.update(game, 0.05, 100 + frame * 0.05);
    cats.forEach((cat, i) => {
      expect(cat.position.distanceTo(world.camera.position)).toBeLessThan(starts[i] - 1);
      expect(Math.sign(cat.rotation.y)).toBe(-Math.sign(cat.position.x));
      expect(cat.getObjectByName('closedEye0')!.visible).toBe(true);
      expect(cat.getObjectByName('closedEye1')!.visible).toBe(true);
    });
    expect(cats[0].position.x).toBeLessThan(-1);
    expect(cats[4].position.x).toBeGreaterThan(1);
    expect(cats[0].position.z).toBeGreaterThan(cats[2].position.z + 1.5);
    expect(world.victoryHearts()).toHaveLength(5);
    expect(world.victoryHearts().every(point => point.visible && point.x > 25 && point.x < 365 && point.y > 108 && point.y < 660)).toBe(true);
    expect(JSON.stringify(game.cats)).toBe(savedCats);
  });

  it('restores gameplay camera, clears the crowd, and restarts the entrance on the next win', () => {
    const game = victory(), world = new World(); world.resize(390, 844);
    const originalPosition = world.camera.position.clone(), originalRotation = world.camera.quaternion.clone();
    game.damageSerial++; game.lastAttackCatId = game.cats[0].id;
    world.update(game, 0, 0); world.update(game, 0.1, 6);
    expect(world.attackAge).toBeGreaterThan(1.15);
    const crowd = previews(world), finalZ = crowd[0].position.z;
    game.reset(); world.resetView(); world.update(game, 0, 10);
    expect(world.camera.position.equals(originalPosition)).toBe(true);
    expect(world.camera.quaternion.angleTo(originalRotation)).toBeLessThan(0.000001);
    expect(world.camera.zoom).toBe(1.65);
    expect(world.victoryHearts()).toEqual([]);
    expect(previews(world)).toHaveLength(0);
    expect(crowd.every(cat => cat.parent === null)).toBe(true);
    game.phase = 'victory'; world.update(game, 0, 20);
    expect(previews(world)).toHaveLength(1);
    expect(previews(world)[0].position.z).toBeLessThan(finalZ - 2);
  });
});
