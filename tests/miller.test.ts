import { expect, it } from 'vitest';
import * as THREE from 'three';
import { PALETTE, STAGES, TOOLS } from '../src/config';
import { createCat, disposeCat } from '../src/cat-model';
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

it('offers Miller alongside Yelo at the final adoption and restores the chosen five-cat roster', () => {
  expect(STAGES).toHaveLength(5);
  for (const seed of [1, 7, 42, 1234]) {
    const game = new Game(seed); game.reset();
    for (const appearance of ['latte', 'didi', 'xiaosai']) { nextAdoption(game); adopt(game, appearance); }
    nextAdoption(game);
    expect(game.candidates.map(cat => cat.appearance)).toEqual(['yelo', 'miller']);
    adopt(game, 'miller');
    expect(game.stage).toBe(4);
    expect(game.cats.map(cat => cat.name)).toEqual(['Choco', 'Latte', '的的', '小塞', 'Miller']);
    game.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); game.tick(game.timeLeft);
    expect(game.phase).toBe('victory');
    const restored = new Game(seed); restored.restoreFreePlay(game.freePlayRoster);
    expect(restored.startFreePlay()).toBe(true);
    expect(restored.cats[4]).toMatchObject({ name: 'Miller', appearance: 'miller' });
  }
});

it('allows Miller in the early random pool and never offers an already adopted Miller again', () => {
  let foundEarly = false;
  for (let seed = 1; seed <= 64 && !foundEarly; seed++) {
    const game = new Game(seed); game.reset(); nextAdoption(game);
    if (!game.candidates.some(cat => cat.appearance === 'miller')) continue;
    foundEarly = true; adopt(game, 'miller');
    for (const appearance of ['didi', 'xiaosai']) { nextAdoption(game); adopt(game, appearance); }
    nextAdoption(game);
    expect(game.candidates[0].appearance).toBe('yelo');
    expect(game.candidates.some(cat => cat.appearance === 'miller')).toBe(false);
    expect(new Set(game.candidates.map(cat => cat.name)).size).toBe(2);
  }
  expect(foundEarly).toBe(true);
});

it('retains the tabby fallback, toe socks and pointed ears without a white forehead blaze', () => {
  const definition = PALETTE.find(cat => cat.appearance === 'miller')!;
  const model = createCat(definition);
  expect(model.root.userData.modelSource).toBeUndefined();
  const palette = new Set<string>();
  model.body.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const map = (object.material as THREE.MeshStandardMaterial).map;
    if (!(map instanceof THREE.DataTexture)) return;
    const data = map.image.data!;
    for (let i = 0; i < data.length; i += 4) palette.add([data[i], data[i + 1], data[i + 2]].map(v => Number(v).toString(16).padStart(2, '0')).join(''));
  });
  for (const color of ['756653', '272521', 'faf6ef', 'd7c7aa']) expect(palette).toContain(color);
  for (const paw of model.paws) {
    let whiteToes = 0;
    paw.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const colors = object.geometry.getAttribute('color');
      if (colors) for (let i = 0; i < colors.count; i++) {
        if (new THREE.Color().fromBufferAttribute(colors, i).getHexString() === 'faf6ef') whiteToes++;
      }
    });
    expect(whiteToes).toBeGreaterThan(100);
  }
  model.root.updateMatrixWorld(true);
  const heights = model.ears.map(ear => new THREE.Box3().setFromObject(ear).getSize(new THREE.Vector3()).y);
  expect(heights[0]).toBeCloseTo(heights[1], 5); expect(heights[0]).toBeGreaterThan(0.30);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 1.12, 2), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(model.root, true)[0];
  const map = ((hit.object as THREE.Mesh).material as THREE.MeshStandardMaterial).map as THREE.DataTexture;
  expect(map.isDataTexture).toBe(true);
  const { data, width, height } = map.image;
  const pixel = (Math.min(height - 1, Math.floor(hit.uv!.y * height)) * width + Math.min(width - 1, Math.floor(hit.uv!.x * width))) * 4;
  expect([data![pixel], data![pixel + 1], data![pixel + 2]]).not.toEqual([250, 246, 239]);
  expect(PALETTE[4].name).toBe('Miso'); expect(PALETTE[4].appearance).toBeUndefined();
  disposeCat(model);
});
