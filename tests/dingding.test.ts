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

it('offers 丁丁 randomly without replacing featured cats, retains discovery and restores a winning roster', () => {
  let found = false;
  for (let seed = 1; seed <= 100 && !found; seed++) {
    const game = new Game(seed); game.reset(); nextAdoption(game);
    expect(game.candidates[0].appearance).toBe('latte');
    if (!game.candidates.some(cat => cat.appearance === 'dingding')) continue;
    found = true; adopt(game, 'dingding');
    expect(game.adoptedCats).toContain('丁丁');
    for (const appearance of ['didi', 'xiaosai', 'yelo']) {
      nextAdoption(game);
      expect(game.candidates[0].appearance).toBe(appearance);
      expect(game.candidates.some(cat => cat.appearance === 'dingding')).toBe(false);
      adopt(game, appearance);
    }
    game.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); game.tick(game.timeLeft);
    expect(game.phase).toBe('victory');
    const restored = new Game(seed); restored.restoreFreePlay(game.freePlayRoster);
    expect(restored.startFreePlay()).toBe(true);
    expect(restored.cats).toHaveLength(5);
    expect(restored.cats.filter(cat => cat.appearance === 'dingding')).toHaveLength(1);
    expect(restored.adoptedCats).toContain('丁丁');
    restored.reset(); expect(restored.adoptedCats).toContain('丁丁');
  }
  expect(found).toBe(true);
});

it('registers 丁丁 once for authored models, practice and saved discoveries', () => {
  expect(isBlenderCat('dingding')).toBe(true);
  expect(PALETTE.filter(cat => cat.appearance === 'dingding')).toHaveLength(1);
  const game = new Game(); game.restoreAdoptedCats(['丁丁', '丁丁']);
  expect(game.adoptedCats).toEqual(['Choco', '丁丁']);
  expect(game.startPawdicurePractice()).toBe(true);
  expect(game.cats.filter(cat => cat.name === '丁丁')).toHaveLength(1);
  expect(game.cats).toHaveLength(PALETTE.length);
});

it('keeps the tabby identity, white toes and short kinked tail when the authored model is unavailable', () => {
  const model = createCat(PALETTE.find(cat => cat.appearance === 'dingding')!);
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
  for (const hex of ['7b776c', '302f29', 'faf6ef']) expect(textures).toContain(hex);
  for (const hex of ['c4c575', 'a5aa59', 'a57969']) expect(vertices).toContain(hex);
  for (const leg of model.legs) {
    const upperLeg = leg.children.find(object => object instanceof THREE.Mesh) as THREE.Mesh;
    const map = (upperLeg.material as THREE.MeshStandardMaterial).map as THREE.DataTexture;
    const data = map.image.data!, coat = new Set<string>();
    for (let i = 0; i < data.length; i += 4) coat.add([data[i], data[i + 1], data[i + 2]].map(v => Number(v).toString(16).padStart(2, '0')).join(''));
    expect(coat).toContain('7b776c'); expect(coat).toContain('302f29');
    expect(coat).not.toContain('faf6ef');
  }
  const tail = model.tail.getObjectByName('tailSkin') as THREE.SkinnedMesh;
  tail.geometry.computeBoundingBox();
  const bounds = tail.geometry.boundingBox!;
  expect(bounds.max.y).toBeLessThan(0.58);
  const points = tail.geometry.getAttribute('position');
  const tip = Array.from({ length: points.count }, (_, i) => i).filter(i => points.getY(i) > 0.53);
  expect(tip.length).toBeGreaterThan(0);
  expect(tip.reduce((sum, i) => sum + points.getZ(i), 0) / tip.length).toBeGreaterThan(0.10);
  disposeCat(model);
});

