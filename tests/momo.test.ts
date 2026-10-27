import { expect, it } from 'vitest';
import * as THREE from 'three';
import { PALETTE, STAGES, TOOLS } from '../src/config';
import { createCat, disposeCat } from '../src/cat-model';
import { Game } from '../src/simulation';
import { winBonus } from './support/bonus';

function offer(game: Game) {
  game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
  game.tick(game.timeLeft); winBonus(game);
}
function choose(game: Game, appearance: string) {
  const candidate = game.candidates.find(cat => cat.appearance === appearance)!;
  expect(candidate).toBeDefined(); game.adopt(candidate.id);
  while (game.phase === 'upgrade') game.upgrade(TOOLS.find(tool => game.levels[tool.id] < 3)!.id);
}

it('offers Momo alongside Xiaosai, keeps the fourth choice and restores the five-cat free-play roster', () => {
  expect(STAGES).toHaveLength(5);
  for (const seed of [1, 7, 42, 1234]) {
    const game = new Game(seed); game.reset();
    for (const appearance of ['latte', 'didi']) { offer(game); choose(game, appearance); }
    offer(game); expect(game.candidates.map(cat => cat.appearance)).toEqual(['xiaosai', 'momo']);
    choose(game, 'momo'); offer(game);
    expect(game.candidates.map(cat => cat.appearance)).toEqual(['yelo', 'miller']);
    choose(game, 'yelo');
    game.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); game.tick(game.timeLeft);
    expect(game.phase).toBe('victory');
    const restored = new Game(seed); restored.restoreFreePlay(game.freePlayRoster);
    expect(restored.startFreePlay()).toBe(true);
    expect(restored.cats.map(cat => cat.name)).toEqual(['Choco', 'Latte', '的的', 'Momo', 'Yelo']);
  }
});

it('allows early random Momo adoption without offering a duplicate later', () => {
  let found = false;
  for (let seed = 1; seed <= 80 && !found; seed++) {
    const game = new Game(seed); game.reset(); offer(game);
    if (!game.candidates.some(cat => cat.appearance === 'momo')) continue;
    found = true; choose(game, 'momo'); offer(game); choose(game, 'didi'); offer(game);
    expect(game.candidates[0].appearance).toBe('xiaosai');
    expect(game.candidates.some(cat => cat.appearance === 'momo')).toBe(false);
  }
  expect(found).toBe(true);
});

it('gives fallback Momo a wider ruff and plume silhouette with dark feet and only white toe tips', () => {
  const definition = PALETTE.find(cat => cat.appearance === 'momo')!;
  const model = createCat(definition), generic = createCat(PALETTE[4]);
  model.root.updateMatrixWorld(true); generic.root.updateMatrixWorld(true);
  expect(model.root.userData.modelSource).toBeUndefined();
  const size = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
  expect(size(model.body).x).toBeGreaterThan(size(generic.body).x * 1.20);
  expect(size(model.body.getObjectByName('momoRuff')!).x).toBeGreaterThan(0.80);
  const tail = model.root.getObjectByName('tailSkin') as THREE.Mesh;
  const otherTail = generic.root.getObjectByName('tailSkin') as THREE.Mesh;
  tail.geometry.computeBoundingBox(); otherTail.geometry.computeBoundingBox();
  expect(tail.geometry.boundingBox!.getSize(new THREE.Vector3()).x).toBeGreaterThan(otherTail.geometry.boundingBox!.getSize(new THREE.Vector3()).x * 2);
  for (const paw of model.paws) {
    const coat = new Set<string>();
    paw.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const colors = object.geometry.getAttribute('color');
      if (colors) for (let i = 0; i < colors.count; i++) coat.add(new THREE.Color().fromBufferAttribute(colors, i).getHexString());
    });
    expect(coat).toContain('faf6ef'); expect(coat).toContain(definition.accent.slice(1));
  }
  expect(PALETTE[4].name).toBe('Miso'); expect(PALETTE[4].appearance).toBeUndefined();
  disposeCat(model); disposeCat(generic);
});
