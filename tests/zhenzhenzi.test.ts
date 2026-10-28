import { expect, it } from 'vitest';
import * as THREE from 'three';
import { PALETTE, TOOLS } from '../src/config';
import { createCat, disposeCat } from '../src/cat-model';
import { isBlenderCat } from '../src/blender-cat-asset';
import { Game } from '../src/simulation';
import { winBonus } from './support/bonus';

function nextAdoption(game: Game) {
  game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
  game.tick(game.timeLeft); winBonus(game);
}
function adopt(game: Game, appearance: string) {
  const candidate = game.candidates.find(cat => cat.appearance === appearance)!;
  expect(candidate).toBeDefined(); game.adopt(candidate.id);
  while (game.phase === 'upgrade') game.upgrade(TOOLS.find(tool => game.levels[tool.id] < 3)!.id);
}

it('offers 震震子 randomly without replacing featured cats, retains discovery and restores a winning roster', () => {
  let found = false;
  for (let seed = 1; seed <= 100 && !found; seed++) {
    const game = new Game(seed); game.reset(); nextAdoption(game);
    expect(game.candidates[0].appearance).toBe('latte');
    if (!game.candidates.some(cat => cat.appearance === 'zhenzhenzi')) continue;
    found = true; adopt(game, 'zhenzhenzi');
    expect(game.adoptedCats).toContain('震震子');
    for (const appearance of ['didi', 'xiaosai', 'yelo']) {
      nextAdoption(game);
      expect(game.candidates[0].appearance).toBe(appearance);
      expect(game.candidates.some(cat => cat.appearance === 'zhenzhenzi')).toBe(false);
      adopt(game, appearance);
    }
    game.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); game.tick(game.timeLeft);
    expect(game.phase).toBe('victory');
    const restored = new Game(seed); restored.restoreFreePlay(game.freePlayRoster);
    expect(restored.startFreePlay()).toBe(true);
    expect(restored.cats).toHaveLength(5);
    expect(restored.cats.filter(cat => cat.appearance === 'zhenzhenzi')).toHaveLength(1);
    expect(restored.adoptedCats).toContain('震震子');
    restored.reset(); expect(restored.adoptedCats).toContain('震震子');
  }
  expect(found).toBe(true);
});

it('registers 震震子 once for authored models, practice and saved discoveries', () => {
  expect(isBlenderCat('zhenzhenzi')).toBe(true);
  expect(PALETTE.filter(cat => cat.appearance === 'zhenzhenzi')).toHaveLength(1);
  const game = new Game(); game.restoreAdoptedCats(['震震子', '震震子']);
  expect(game.adoptedCats).toEqual(['Choco', '震震子']);
  expect(game.startPawdicurePractice()).toBe(true);
  expect(game.cats.filter(cat => cat.name === '震震子')).toHaveLength(1);
  expect(game.cats).toHaveLength(PALETTE.length);
});

it('keeps a white-and-tabby fallback with white legs, golden eyes, a pink nose and ringed tail', () => {
  const model = createCat(PALETTE.find(cat => cat.appearance === 'zhenzhenzi')!);
  expect(model.root.userData.modelSource).toBeUndefined();
  const textures = new Set<string>(), vertices = new Set<string>();
  model.root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const map = (object.material as THREE.MeshStandardMaterial).map;
    if (map instanceof THREE.DataTexture) {
      const data = map.image.data!;
      for (let i = 0; i < data.length; i += 4) textures.add([data[i], data[i + 1], data[i + 2]].map(v => Number(v).toString(16).padStart(2, '0')).join(''));
    }
    const colors = object.geometry.getAttribute('color');
    if (colors) for (let i = 0; i < colors.count; i++) vertices.add(new THREE.Color().fromBufferAttribute(colors, i).getHexString());
  });
  for (const hex of ['706f63', '373936', 'faf6ef']) expect(textures).toContain(hex);
  for (const hex of ['d2b55d', 'b89745', 'cf9390']) expect(vertices).toContain(hex);
  for (const leg of model.legs) {
    const upperLeg = leg.children.find(object => object instanceof THREE.Mesh) as THREE.Mesh;
    const colors = upperLeg.geometry.getAttribute('color');
    for (let i = 0; i < colors.count; i++) expect(new THREE.Color().fromBufferAttribute(colors, i).getHexString()).toBe('faf6ef');
  }
  const tailColors = new Set<string>();
  model.tail.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const colors = object.geometry.getAttribute('color');
    if (colors) for (let i = 0; i < colors.count; i++) tailColors.add(new THREE.Color().fromBufferAttribute(colors, i).getHexString());
  });
  expect(tailColors).toEqual(new Set(['706f63', '373936']));
  disposeCat(model);
});
