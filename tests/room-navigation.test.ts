import { describe, expect, it } from 'vitest';
import { clearFloor, clearFloorSegment, floorRoute, nextFloorWaypoint } from '../src/room-navigation';
import { FURNITURE, WHEEL } from '../src/furniture';
import { roomFloorContains, roomFloorSegment } from '../src/room-boundaries';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';
import { freeBowlPosition } from '../src/free-roam';

describe('video lounge navigation', () => {
  it('places every cleaning target beside the cat without burying it in furniture', () => {
    for (const origin of [{ x: -5.85, z: -5.7 }, { x: -5.8, z: -5.59 }, { x: 0, z: 0 }]) {
      for (const kind of ['poop', 'vomit', 'fur'] as const) {
        const game = new Game(32); game.reset(); game.phase = 'tutorial';
        const cat = game.cats[0]; cat.position = { ...origin }; cat.decisionAt = Infinity; cat.nextNeedAt = Infinity;
        expect(clearFloor(origin)).toBe(true);
        game.spawn(cat, kind);
        const target = game.events[0].position;
        expect(clearFloor(target), `${kind} at ${JSON.stringify(origin)}`).toBe(true);
        expect(clearFloorSegment(origin, target)).toBe(true);
        expect(Math.hypot(target.x - origin.x, target.z - origin.z)).toBeLessThan(0.65);
        if (origin.x === 0) expect(target).toEqual({ x: 0.58, z: 0.25 });
        const saved = { ...target };
        cat.position = { x: 1, z: 0 }; game.tick(0.1);
        expect(game.events[0].position).toEqual(saved);
      }
    }
  });

  it('uses the wider left floor and excludes the projecting wall recess from routes', () => {
    expect(clearFloor({ x: -4, z: -4 })).toBe(true);
    expect(floorRoute({ x: 0, z: 0 }, { x: -4, z: -4 }).length).toBeGreaterThan(0);
    for (const point of [{ x: 1.6, z: -7 }, { x: 2.2, z: -3 }, { x: 4.4, z: -3 }]) {
      expect(roomFloorContains(point)).toBe(false);
      expect(clearFloor(point)).toBe(false);
      expect(floorRoute({ x: 0, z: 0 }, point)).toEqual([]);
    }
    expect(roomFloorSegment({ x: .4, z: -4 }, { x: 7, z: 0 })).toBe(false);
    expect(clearFloor({ x: 2.2, z: -3.5 })).toBe(false);
  });

  it('leaves reachable feeding floor between the shelf feet and a continuous sunroom aisle', () => {
    for (const x of [2, 2.6, 3.2, 3.8, 4.4]) {
      const bowl = { x, z: -.58 }, approach = { x, z: -.03 };
      expect(clearFloor(bowl)).toBe(true);
      expect(clearFloor(approach)).toBe(true);
      expect(clearFloorSegment(approach, bowl)).toBe(true);
      expect(floorRoute({ x: 0, z: 0 }, approach).length).toBeGreaterThan(0);
    }
    expect(clearFloorSegment({ x: 1.3, z: -.275 }, { x: 6, z: -.275 })).toBe(true);
    expect(clearFloor({ x: 1.61, z: -.67 })).toBe(false);
    expect(clearFloor({ x: 4.79, z: -.67 })).toBe(false);
  });

  it('routes to clear floor in front of the wheel and lands on its inner running surface', () => {
    const wheel = FURNITURE.find(spot => spot.id === 'wheel')!;
    const approach = wheel.route[0], landing = wheel.route.at(-1)!;
    expect(clearFloor(approach)).toBe(true);
    expect(floorRoute({ x: 0, z: 0 }, approach).at(-1)).toMatchObject({ x: approach.x, z: approach.z });
    expect(clearFloor(landing)).toBe(false);
    expect(landing).toEqual({ x: WHEEL.x, z: WHEEL.z, height: WHEEL.height });
    expect(landing.height).toBeCloseTo(WHEEL.centerY - WHEEL.innerRadius);
    expect(wheel.activity).toBe('running');
  });

  it('starts all five residents on reachable floor in each stage and restored free play', () => {
    const game = new Game(32);
    game.restoreFreePlay(PALETTE.slice(0, 5).map(cat => cat.name));
    expect(game.startFreePlay()).toBe(true);
    const checkStarts = () => {
      for (const cat of game.cats) {
        expect(clearFloor(cat.position, 'whole-room', game.roomLayout.navigation), `cat ${cat.id} starts clear`).toBe(true);
        for (const spot of game.roomLayout.spots) expect(floorRoute(cat.position, spot.route[0], 'whole-room', game.roomLayout.navigation).length, `${cat.id} can reach ${spot.id}`).toBeGreaterThan(0);
      }
      game.cats.forEach((cat, i) => {
        const bowl = freeBowlPosition(i, game.cats.length);
        const eatingPosition = { x: bowl.x, z: bowl.z + 0.55 };
        expect(clearFloor(bowl, 'whole-room', game.roomLayout.navigation), `bowl ${i} clears furniture`).toBe(true);
        expect(clearFloor(eatingPosition, 'whole-room', game.roomLayout.navigation), `cat ${i} has floor space to eat`).toBe(true);
        expect(floorRoute(cat.position, eatingPosition, 'whole-room', game.roomLayout.navigation).length).toBeGreaterThan(0);
      });
    };
    checkStarts();
    for (let stage = 0; stage < 5; stage++) {
      game.stage = stage; game.startStage(); checkStarts();
    }
    game.phase = 'tutorial';
    const starts = game.cats.map(cat => ({ ...cat.position }));
    game.cats.forEach(cat => {
      cat.nextNeedAt = Infinity; cat.activity = 'walking'; cat.decisionAt = Infinity;
      cat.destination = { x: 0, z: 0 };
    });
    game.tick(2);
    game.cats.forEach((cat, i) => expect(Math.hypot(cat.position.x - starts[i].x, cat.position.z - starts[i].z)).toBeGreaterThan(0.1));
  });

  it('rejects furniture interiors and enters the window wing through the right-wall opening', () => {
    expect(clearFloor({ x: 0, z: 6.5 })).toBe(false);
    expect(clearFloor({ x: 4.8, z: 4 })).toBe(false);
    const from = { x: 0, z: 0 }, to = FURNITURE.find(spot => spot.id === 'window')!.route[0];
    expect(clearFloorSegment(from, to)).toBe(false);
    const route = floorRoute(from, to);
    expect(route.length).toBeGreaterThan(1);
    let previous = from;
    for (const point of route) {
      for (let i = 0; i <= 30; i++) expect(clearFloor({
        x: previous.x + (point.x - previous.x) * i / 30,
        z: previous.z + (point.z - previous.z) * i / 30,
      })).toBe(true);
      previous = point;
    }
    expect(route.at(-1)).toEqual(to);
    expect(clearFloorSegment({ x: 4, z: -6 }, { x: 6, z: -4 })).toBe(false);
    expect(clearFloorSegment({ x: 4, z: -4 }, { x: 7, z: 0 })).toBe(false);
    expect(clearFloor({ x: 7, z: 8 })).toBe(false);
    expect(clearFloorSegment({ x: 4, z: 1.5 }, { x: 6, z: 1.5 })).toBe(false);
    expect(clearFloorSegment({ x: 4, z: -.275 }, { x: 6, z: -.275 })).toBe(true);
  });

  it('keeps floor roaming outside solid furniture after visits and care interruptions', () => {
    const game = new Game(32); game.reset(); game.phase = 'tutorial';
    const cat = game.cats[0]; cat.nextNeedAt = Infinity;
    for (const spot of game.roomLayout.spots) {
      if (spot.id === 'window') continue; // Sunroom visits are Free Play only.
      // Return the fixture to the clear center before each visit.
      cat.position = { x: 0, z: 0 }; cat.elevation = 0; cat.visit = undefined;
      game.events = []; cat.nextNeedAt = Infinity;
      expect(game.visitFurniture(cat.id, spot.id)).toBe(true);
      for (let i = 0; i < 1200 && cat.visit; i++) {
        game.tick(0.05);
        if (game.cats[0].visit?.phase === 'use') game.spawn(cat, 'hunger');
        if (!cat.visit) expect(clearFloor(cat.position, 'whole-room', game.roomLayout.navigation)).toBe(true);
      }
      expect(cat.visit).toBeUndefined();
    }
  });

  it('closes the sunroom opening to main-game routes and invalidates a cached free-play route', () => {
    const from = { x: 4, z: -.275 }, to = { x: 6, z: -.275 };
    expect(clearFloorSegment(from, to)).toBe(true);
    expect(clearFloorSegment(from, to, 'main-room')).toBe(false);
    expect(clearFloor(to, 'main-room')).toBe(false);
    expect(floorRoute(from, to, 'main-room')).toEqual([]);
    const game = new Game(32), cat = game.cats[0]; cat.position = from;
    expect(nextFloorWaypoint(cat, to)).toEqual(to);
    expect(nextFloorWaypoint(cat, to, 'main-room')).toBeUndefined();
    expect(nextFloorWaypoint(cat, to)).toEqual(to);
  });

  it('keeps main-game and tutorial visits and wandering inside the main room', () => {
    for (const phase of ['playing', 'tutorial'] as const) {
      const game = new Game(32);
      game.restoreFreePlay(PALETTE.slice(0, 5).map(cat => cat.name)); game.startFreePlay(); game.startStage();
      game.phase = phase;
      game.cats.forEach(cat => { cat.nextNeedAt = Infinity; });
      expect(game.visitFurniture(game.cats[0].id, 'window')).toBe(false);
      for (let i = 0; i < 1200; i++) {
        game.tick(0.1);
        for (const cat of game.cats) {
          expect(roomFloorContains(cat.position, 0.22, 'main-room'), `${phase}: ${JSON.stringify(cat.position)}`).toBe(true);
          expect(cat.visit?.id).not.toBe('window');
          for (const point of cat.visit?.route ?? []) expect(roomFloorContains(point, 0.22, 'main-room')).toBe(true);
        }
      }
    }
  });

  it('rejects a walking destination in the sunroom during main play and allows its window visit in free play', () => {
    const game = new Game(32); game.reset();
    const cat = game.cats[0]; cat.nextNeedAt = Infinity;
    cat.position = { x: 4, z: -.275 }; cat.destination = { x: 6, z: -.275 }; cat.activity = 'walking';
    game.tick(0.05);
    expect(cat.position).toEqual({ x: 4, z: -.275 });
    expect(cat.activity).toBe('idle');
    game.phase = 'free-play';
    expect(game.visitFurniture(cat.id, 'window')).toBe(true);
    for (let i = 0; i < 1200 && cat.visit?.phase !== 'use'; i++) game.tick(0.05);
    expect(cat.visit?.phase).toBe('use');
    expect(cat.position.x).toBeGreaterThan(5);
    expect(cat.activity).toBe('watching');
  });
});
