import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { FURNITURE } from '../src/furniture';
import { clearFloor, clearFloorSegment, floorRoute } from '../src/room-navigation';

function sandbox() {
  const game = new Game(12); game.reset(); game.phase = 'tutorial';
  game.cats[0].nextNeedAt = Infinity;
  return game;
}
function until(game: Game, predicate: () => boolean, seconds = 40) {
  for (let i = 0; i < seconds * 20 && !predicate(); i++) game.tick(0.05);
  expect(predicate()).toBe(true);
}

describe('furniture interactions', () => {
  for (const spot of FURNITURE) it(`approaches, uses and leaves ${spot.id} continuously`, () => {
    const game = sandbox(), cat = game.cats[0];
    // The window perch belongs to the sunroom, which only Free Play can visit.
    if (spot.id === 'window') game.phase = 'free-play';
    expect(game.visitFurniture(cat.id, spot.id)).toBe(true);
    let previous = { ...cat.position, height: cat.elevation };
    until(game, () => {
      const step = Math.hypot(cat.position.x - previous.x, cat.position.z - previous.z, cat.elevation - previous.height);
      expect(step).toBeLessThan(0.3);
      previous = { ...cat.position, height: cat.elevation };
      return cat.visit?.phase === 'use';
    });
    expect(cat.activity).toBe(spot.activity);
    expect(cat.elevation).toBeCloseTo(spot.route.at(-1)!.height);
    until(game, () => !cat.visit);
    expect(cat.elevation).toBe(0);
    expect(cat.lastFurniture).toBe(spot.id);
  });

  it('reserves an object for one cat and releases it after leaving', () => {
    const game = sandbox(), first = game.cats[0];
    const second = { ...first, id: 100, position: { x: 2, z: 0 }, destination: { x: 2, z: 0 }, decisionAt: Infinity };
    game.cats.push(second);
    expect(game.visitFurniture(first.id, 'box')).toBe(true);
    expect(game.visitFurniture(second.id, 'box')).toBe(false);
    until(game, () => !first.visit);
    expect(game.visitFurniture(second.id, 'box')).toBe(true);
  });

  it('freezes mid-jump, then returns to the floor before an explicit care need', () => {
    const game = sandbox(), cat = game.cats[0];
    game.visitFurniture(cat.id, 'tree');
    until(game, () => cat.activity === 'jumping' && cat.elevation > 0.2);
    game.pause(); const snapshot = JSON.stringify(cat); game.tick(8);
    expect(JSON.stringify(cat)).toBe(snapshot); game.resume();
    game.spawn(cat, 'hunger'); expect(game.events).toHaveLength(0);
    until(game, () => game.events.length === 1);
    expect(cat.elevation).toBe(0); expect(cat.visit).toBeUndefined();
    expect(game.events[0].kind).toBe('hunger');
    expect(game.events[0].position).toEqual(cat.position);
    const position = { ...cat.position }; game.tick(3); expect(cat.position).toEqual(position);
  });

  it('walks around a resting cat on the way to furniture', () => {
    const game = sandbox(), cat = game.cats[0];
    const resting = { ...cat, id: 101, position: { x: 0, z: -3.2 }, destination: { x: 0, z: -3.2 }, decisionAt: Infinity };
    game.cats.push(resting); game.visitFurniture(cat.id, 'tree');
    until(game, () => {
      if (cat.elevation < 0.3) expect(Math.hypot(cat.position.x - resting.position.x, cat.position.z - resting.position.z)).toBeGreaterThanOrEqual(0.54);
      return cat.visit?.phase === 'use';
    });
  });

  it('clears visits on restart and leaves existing cleaning messes in place', () => {
    const game = sandbox(), cat = game.cats[0];
    game.spawn(cat, 'fur'); const origin = { ...game.events[0].position };
    expect(game.visitFurniture(cat.id, 'tree')).toBe(false);
    game.tick(4); expect(game.events[0].position).toEqual(origin);
    game.select('brush'); game.work(game.events[0].id, 100);
    game.visitFurniture(cat.id, 'box'); game.reset();
    expect(game.cats[0].visit).toBeUndefined(); expect(game.cats[0].elevation).toBe(0);
  });

  it('routes to every furniture approach without crossing another solid object', () => {
    for (const spot of FURNITURE) {
      let previous = { x: 0, z: -1.2 };
      const route = floorRoute(previous, spot.route[0]);
      expect(route.length, spot.id).toBeGreaterThan(0);
      for (const point of route) {
        expect(clearFloor(point), spot.id).toBe(true);
        expect(clearFloorSegment(previous, point), spot.id).toBe(true);
        previous = point;
      }
    }
  });
});
