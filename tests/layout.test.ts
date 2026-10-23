import { expect, it } from 'vitest';
import { gameLayout, portraitViewport } from '../src/layout';
import { World } from '../src/world';
import { Game } from '../src/simulation';
import * as THREE from 'three';

it('keeps thumb targets outside the portrait room and clear of phone safe areas', () => {
  const safe = { left: 0, right: 0, top: 47, bottom: 34 };
  const l = gameLayout(390, 664, safe);
  expect(l.room.h).toBeGreaterThan(390);
  for (const r of [...l.tools, ...l.viewControls, l.pause]) {
    expect(r.w).toBeGreaterThanOrEqual(48); expect(r.h).toBeGreaterThanOrEqual(48);
    expect(r.y + r.h <= l.room.y || r.y >= l.room.y + l.room.h).toBe(true);
    expect(r.x + r.w).toBeLessThanOrEqual(390 - safe.right);
    expect(r.y).toBeGreaterThanOrEqual(safe.top); expect(r.y + r.h).toBeLessThanOrEqual(664 - safe.bottom);
  }
});

it('blocks sideways phones and centers a portrait frame for desktop', () => {
  expect(portraitViewport({ x: 0, y: 0, w: 844, h: 270 }, true).rotateRequired).toBe(true);
  expect(portraitViewport({ x: 0, y: 0, w: 390, h: 664 }, true).rotateRequired).toBe(false);
  const desktop = portraitViewport({ x: 0, y: 0, w: 1280, h: 800 }, false);
  expect(desktop.rotateRequired).toBe(false); expect(desktop.w).toBeLessThan(desktop.h);
  expect(desktop.x * 2 + desktop.w).toBe(1280);
});

it('uses portrait height for the room and keeps camera projection and picking aligned', () => {
  const w = new World(), l = gameLayout(390, 664);
  w.resize(390, 664, l.room);
  const nearFloor = new THREE.Vector3(0, 0, 4); w.focusOn(nearFloor);
  const front = w.project(nearFloor);
  expect(front.y).toBeCloseTo(l.room.y + l.room.h / 2);
  expect(front.y).toBeLessThan(l.tools[0].y); w.resetView();
  const game = new Game(1); game.reset(); w.update(game, 0, 0); w.scene.updateMatrixWorld(true);
  const cat = game.cats[0], p = w.project(new THREE.Vector3(cat.position.x, 0.4, cat.position.z));
  expect(w.pickCat(p.x, p.y)).toBe(cat.id);
  expect(w.pickCat(385, 10)).toBeUndefined();
});
