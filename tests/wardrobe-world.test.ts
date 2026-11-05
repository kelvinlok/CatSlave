import { expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { World } from '../src/world';
import { PALETTE } from '../src/config';

it('keeps a wide-angle room camera at the wall while a separate closet viewport is resized', () => {
  const game = new Game(42), world = new World();
  game.restoreFreePlay(PALETTE.slice(0, 5).map(cat => cat.name)); game.startFreePlay();
  const room = { x: 6, y: 122, w: 308, h: 246 };
  world.resize(320, 480, room); world.update(game, 0, 0);
  world.zoomView(-100); world.translateView(-100, 0, 0);
  const snapshot = () => ({ position: world.camera.position.toArray(), rotation: world.camera.quaternion.toArray(),
    zoom: world.camera.zoom, aspect: world.camera.aspect, viewZoom: world.viewZoom });
  const before = snapshot(); expect(before.zoom).toBe(.2);
  game.openWardrobe();
  for (const w of [294, 500, 900]) {
    world.resize(w + 26, 480, { x: 13, y: 108, w, h: 146 }, true); world.update(game, 0, 1);
    expect(world.isPresentationViewport).toBe(true); expect(snapshot()).toEqual(before);
  }
  game.closeWardrobe(); world.resize(320, 480, room); world.update(game, 0, 2);
  expect(world.isPresentationViewport).toBe(false); expect(snapshot()).toEqual(before);
});
