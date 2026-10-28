import { describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import { winBonus } from './support/bonus';

async function setup() {
  vi.resetModules();
  const { Game } = await import('../src/simulation');
  const { World } = await import('../src/world');
  const { createCat } = await import('../src/cat-model');
  const { isBlenderCat, registerBlenderCatAsset } = await import('../src/blender-cat-asset');
  const game = new Game(42), world = new World(); world.resize(393, 851);
  const register = (cat: typeof game.cats[number] | typeof game.candidates[number]) => {
    if (!isBlenderCat(cat.appearance)) throw new Error('Expected an authored cat');
    registerBlenderCatAsset(cat.appearance, createCat(cat).root.clone(true));
  };
  const resident = (id: number) => world.scene.children.find(root => root.userData.catId === id)!;
  const preview = (id: number) => world.scene.getObjectByName(`preview-cat-${id}`)!;
  return { game, world, register, resident, preview };
}

function pose(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  return ['body', 'head', 'tail', 'leg0', 'lowerLeg0', 'paw0', 'eye0'].map(name => {
    const part = root.getObjectByName(name)!;
    return [part.visible, ...part.position.toArray(), ...part.quaternion.toArray(), ...part.scale.toArray()];
  });
}

describe('late model availability in the world', () => {
  it('upgrades the title preview and hidden resident in place', async () => {
    const { game, world, register, resident, preview } = await setup();
    world.update(game, 0, 1);
    const root = resident(game.cats[0].id), title = preview(game.cats[0].id);
    register(game.cats[0]); world.update(game, 0, 1);
    expect(resident(game.cats[0].id)).toBe(root); expect(preview(game.cats[0].id)).toBe(title);
    expect(title.userData.modelSource).toBe('blender'); expect(root.userData.modelSource).toBe('blender');
  });

  it('upgrades a paused resident without changing simulation or picking', async () => {
    const { game, world, register, resident } = await setup();
    game.reset(); game.cats[0].activity = 'walking'; game.cats[0].stride = 3.7;
    game.pause(); world.update(game, 0, 2);
    const paused = resident(game.cats[0].id), before = pose(paused), state = JSON.stringify(game.cats);
    register(game.cats[0]);
    world.update(game, 0, 3);
    expect(resident(game.cats[0].id)).toBe(paused); expect(paused.userData.modelSource).toBe('blender');
    expect(pose(paused)).toEqual(before); expect(JSON.stringify(game.cats)).toBe(state);
    const position = world.catPosition(game.cats[0].id)!; position.y += 0.4;
    world.focusOn(position); world.scene.updateMatrixWorld(true);
    const p = world.project(position); expect(world.pickCat(p.x, p.y)).toBe(game.cats[0].id);
  });

  it('adopts immediately with fallback, then upgrades the resident without restoring stale previews', async () => {
    const { game, world, register, resident, preview } = await setup();
    game.reset(); game.cats[0].nextNeedAt = Infinity; game.tick(game.timeLeft); winBonus(game);
    expect(game.phase).toBe('adoption');
    const [chosen, unchosen] = game.candidates;
    world.update(game, 0, 10);
    const oldPreview = preview(chosen.id); expect(oldPreview.userData.modelSource).toBeUndefined();
    game.adopt(chosen.id); world.update(game, 0, 11);
    const root = resident(chosen.id), state = JSON.stringify(game.cats);
    expect(root.userData.modelSource).toBeUndefined();
    register(chosen); world.update(game, 0, 11);
    expect(game.phase).toBe('upgrade'); expect(game.candidates).toEqual([]);
    expect(JSON.stringify(game.cats)).toBe(state); expect(resident(chosen.id)).toBe(root);
    expect(root.userData.modelAsset).toBe(`models/${chosen.appearance}.glb`);
    expect(oldPreview.parent).toBeNull(); expect(preview(chosen.id)).toBeUndefined();
    game.reset(); world.update(game, 0, 12);
    if (unchosen.appearance !== 'primitive') register(unchosen);
    world.update(game, 0, 12);
    expect(world.scene.children.filter(root => root.userData.catId !== undefined)).toHaveLength(1);
    expect(preview(unchosen.id)).toBeUndefined(); expect(resident(chosen.id)).toBeUndefined();
  });

  it('refreshes adoption previews without changing choices or their roots', async () => {
    const { game, world, register, preview } = await setup();
    game.reset(); game.cats[0].nextNeedAt = Infinity; game.tick(game.timeLeft); winBonus(game);
    world.update(game, 0, 10);
    const candidate = game.candidates[0], root = preview(candidate.id), before = pose(root);
    const choices = game.candidates;
    register(candidate); world.update(game, 0, 10);
    expect(game.candidates).toBe(choices); expect(preview(candidate.id)).toBe(root);
    expect(root.userData.modelSource).toBe('blender'); expect(pose(root)).toEqual(before);
    game.adopt(candidate.id); world.update(game, 0, 10);
    expect(game.cats.at(-1)?.id).toBe(candidate.id);
  });

  it('preserves victory entrance timing and a running attack when models arrive', async () => {
    const { game, world, register, preview } = await setup();
    game.phase = 'victory'; world.update(game, 0, 10); world.update(game, 0, 11);
    const root = preview(game.cats[0].id), position = root.position.toArray(), before = pose(root);
    register(game.cats[0]); world.update(game, 0, 11);
    expect(preview(game.cats[0].id)).toBe(root); expect(root.position.toArray()).toEqual(position);
    expect(pose(root)).toEqual(before); expect(root.userData.modelSource).toBe('blender');

    const other = await setup(); other.game.reset(); other.game.spawn(other.game.cats[0], 'poop');
    other.game.tick(23); other.world.update(other.game, 0.3, 23);
    const attack = other.world.attackScene.children.find(root => root.type === 'Group' && root.visible)!;
    const attackPose = pose(attack), attackPosition = attack.position.toArray();
    other.register(other.game.cats[0]); other.world.update(other.game, 0, 23);
    expect(other.world.attackAge).toBeCloseTo(0.3); expect(attack.parent).toBe(other.world.attackScene);
    expect(attack.userData.modelSource).toBe('blender'); expect(attack.position.toArray()).toEqual(attackPosition);
    expect(pose(attack)).toEqual(attackPose);
  });
});
