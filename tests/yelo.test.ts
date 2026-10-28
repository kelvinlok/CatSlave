import { expect, it } from 'vitest';
import * as THREE from 'three';
import { PALETTE, TOOLS } from '../src/config';
import { createCat, disposeCat } from '../src/cat-model';
import { Game } from '../src/simulation';
import { winBonus } from './support/bonus';

it('features Yelo at the fourth adoption and preserves her identity in saved free play', () => {
  for (const seed of [1, 7, 42, 1234]) {
    const game = new Game(seed); game.reset();
    for (const appearance of ['latte', 'didi', 'xiaosai', 'yelo']) {
      game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
      game.tick(game.timeLeft); winBonus(game);
      expect(game.candidates[0].appearance).toBe(appearance);
      game.adopt(game.candidates[0].id);
      while (game.phase === 'upgrade') game.upgrade(TOOLS.find(tool => game.levels[tool.id] < 3)!.id);
    }
    expect(game.cats.map(cat => cat.name)).toEqual(['Choco', 'Latte', '的的', '小塞', 'Yelo']);
    game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
    game.tick(game.timeLeft);
    expect(game.phase).toBe('victory');
    const saved = game.freePlayRoster;
    const restored = new Game(seed); restored.restoreFreePlay(saved);
    expect(restored.startFreePlay()).toBe(true);
    expect(restored.cats[4]).toMatchObject({ name: 'Yelo', appearance: 'yelo' });
    expect(new Set(restored.cats.map(cat => cat.name)).size).toBe(5);
  }
});

it('keeps Yelo recognizable in the procedural fallback without changing the generic palette', () => {
  const definition = PALETTE.find(cat => cat.appearance === 'yelo')!;
  const model = createCat(definition);
  const colors = (object: THREE.Object3D) => {
    const result = new Set<string>();
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      const attribute = child.geometry.getAttribute('color');
      if (attribute) for (let i = 0; i < attribute.count; i++) result.add(new THREE.Color().fromBufferAttribute(attribute, i).getHexString());
      const material = child.material as THREE.MeshStandardMaterial;
      if (material.map instanceof THREE.DataTexture) {
        const data = material.map.image.data!;
        for (let i = 0; i < data.length; i += 4) {
          result.add([data[i], data[i + 1], data[i + 2]].map(value => Number(value).toString(16).padStart(2, '0')).join(''));
        }
      }
    });
    return result;
  };
  expect(model.root.userData.modelSource).toBeUndefined();
  expect(colors(model.body)).toContain('faf6ef');
  expect(colors(model.body)).toContain(definition.color.slice(1));
  expect(colors(model.body)).toContain(definition.accent.slice(1));
  for (const leg of model.legs.slice(0, 2)) {
    expect(colors(leg)).toContain('faf6ef');
    expect(colors(leg)).not.toContain(definition.color.slice(1));
  }
  model.root.updateMatrixWorld(true);
  const earHeights = model.ears.map(ear => new THREE.Box3().setFromObject(ear).getSize(new THREE.Vector3()).y);
  expect(Math.abs(earHeights[0] - earHeights[1])).toBeGreaterThan(0.025);
  disposeCat(model);
});
