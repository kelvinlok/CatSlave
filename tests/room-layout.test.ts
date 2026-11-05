import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT_ENVIRONMENT, FURNITURE_DEFINITIONS, RoomLayoutRuntime, cloneRoomLayout, defaultRoomLayout, reconcileRoomLayout, validateRoomLayout, furnitureFootprints, type FurnitureDefinition, type LayoutEnvironment, type RoomLayout } from '../src/room-layout';
import { clearFloor, floorRoute } from '../src/room-navigation';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';

function fixture(): LayoutEnvironment {
  const definitions: FurnitureDefinition[] = ['a', 'b'].map((id, index) => ({ id, label: id,
    defaultPose: { x: index * 2, z: 0, turn: 0 }, footprints: [{ minX: -.4, maxX: .4, minZ: -.4, maxZ: .4 }], obstacleIds: [] }));
  return { revision: 2, definitions, fixedObstacles: [], structuralWalls: [], anchors: [{ x: -3, z: -3 }], spots: [], residents: 2,
    bounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
    contains: (p, c = 0) => p.x >= -4 + c && p.x <= 4 - c && p.z >= -4 + c && p.z <= 4 - c,
    segment: (a, b, c = 0) => [a, b].every(p => p.x >= -4 + c && p.x <= 4 - c && p.z >= -4 + c && p.z <= 4 - c),
  };
}

describe('room layouts', () => {
  it('validates the authored default and keeps all 18 placements on reconciliation', () => {
    const layout = defaultRoomLayout();
    expect(Object.keys(layout.placed)).toHaveLength(18);
    expect(validateRoomLayout(layout)).toBeUndefined();
    const reconciled = reconcileRoomLayout(layout);
    expect(reconciled.unplaced).toEqual([]);
    expect(reconciled.placed).toEqual(layout.placed);
  });
  it('omits only furniture outside a changed floorplan and preserves its last pose', () => {
    const environment = fixture(), saved = defaultRoomLayout(environment);
    saved.roomRevision = 1; saved.placed.a.x = 7;
    const result = reconcileRoomLayout(saved, environment);
    expect(Object.keys(result.placed)).toEqual(['b']);
    expect(result.unplaced).toEqual([{ id: 'a', pose: saved.placed.a, reason: 'a: outside the room' }]);
    expect(saved.placed.a.x).toBe(7);
    expect(result.roomRevision).toBe(2);
  });
  it('keeps the furniture still inside when an update actually shrinks the floor', () => {
    const environment = fixture(), saved = defaultRoomLayout(environment);
    expect(validateRoomLayout(saved, environment)).toBeUndefined();
    const contains = environment.contains, segment = environment.segment;
    environment.revision++;
    environment.contains = (point, clearance = 0, area) => contains(point, clearance, area) && point.x <= 1.5 - clearance;
    environment.segment = (a, b, clearance = 0, area) => segment(a, b, clearance, area) && Math.max(a.x, b.x) <= 1.5 - clearance;
    environment.bounds = { ...environment.bounds, maxX: 1.5 };
    const next = reconcileRoomLayout(saved, environment);
    expect(next.placed.a).toEqual(saved.placed.a);
    expect(next.placed.b).toBeUndefined();
    expect(next.unplaced).toEqual([{ id: 'b', pose: saved.placed.b, reason: 'b: outside the room' }]);
  });
  it('revalidates new walls and resized furniture rather than trusting revision or ids', () => {
    const environment = fixture(), saved = defaultRoomLayout(environment);
    environment.structuralWalls = [{ minX: -.2, maxX: .2, minZ: -1, maxZ: 1 }];
    expect(reconcileRoomLayout(saved, environment).unplaced[0]).toMatchObject({ id: 'a', reason: 'a: intersects a wall' });
    environment.structuralWalls = [];
    environment.definitions = environment.definitions.map(def => def.id === 'b' ? { ...def, footprints: [{ minX: -3, maxX: 3, minZ: -.4, maxZ: .4 }] } : def);
    expect(reconcileRoomLayout(saved, environment).unplaced[0]).toMatchObject({ id: 'b', reason: 'b: outside the room' });
  });
  it('uses deterministic ID precedence for overlaps and preserves unavailable/new items', () => {
    const environment = fixture(), saved: RoomLayout = { roomRevision: 1, placed: {
      b: { x: 0, z: 0, turn: 0 }, retired: { x: 2, z: 2, turn: 0 }, a: { x: 0, z: 0, turn: 0 },
    }, unplaced: [] };
    const result = reconcileRoomLayout(saved, environment);
    expect(Object.keys(result.placed)).toEqual(['a']);
    expect(result.unplaced.map(item => item.id)).toEqual(['b', 'retired']);
    expect(result.unplaced[1]).toMatchObject({ pose: saved.placed.retired, reason: 'Furniture is no longer available' });
    delete saved.placed.b;
    expect(reconcileRoomLayout(saved, environment).unplaced.find(item => item.id === 'b')?.reason).toContain('New furniture');
  });
  it('does not silently restore already-unplaced items and supports an empty room', () => {
    const environment = fixture(), saved: RoomLayout = { roomRevision: 1, placed: {}, unplaced: [
      { id: 'a', pose: { x: 0, z: 0, turn: 0 }, reason: 'Outside the old room' },
      { id: 'b', reason: 'Not yet placed' },
    ] };
    const result = reconcileRoomLayout(saved, environment);
    expect(result.placed).toEqual({});
    expect(result.unplaced).toEqual(saved.unplaced);
    expect(validateRoomLayout(result, environment)).toBeUndefined();
  });
  it('rejects placements blocking an essential route', () => {
    const environment = fixture();
    environment.anchors = [{ x: -3, z: 0 }, { x: 3, z: 0 }];
    environment.definitions = [{ ...environment.definitions[0], footprints: [{ minX: -.1, maxX: .1, minZ: -3.99, maxZ: 3.99 }] }];
    const result = reconcileRoomLayout(defaultRoomLayout(environment), environment);
    expect(result.placed).toEqual({});
    expect(result.unplaced[0].reason).toContain('Blocks access');
  });
  it('transforms footprint and interactions with the same quarter turn', () => {
    const layout = defaultRoomLayout(), definition = FURNITURE_DEFINITIONS.find(item => item.id === 'wheel')!;
    layout.placed.wheel = { x: 0, z: 0, turn: 1 };
    const runtime = new RoomLayoutRuntime(layout);
    const wheel = runtime.spots.find(spot => spot.id === 'wheel')!;
    expect(wheel.route[0].x).toBeCloseTo(-1.15); expect(wheel.route[0].z).toBe(0);
    expect(wheel.route[1]).toMatchObject({ x: 0, z: 0 });
    expect(wheel.yaw).toBeCloseTo(Math.PI);
    const box = furnitureFootprints(definition, layout.placed.wheel)[0];
    expect(box.minX).toBeCloseTo(-.52);
    expect(box.maxZ).toBeCloseTo(1.43);
  });
  for (const [owner, spot] of [['tree', 'tree'], ['sofa', 'bench'], ['bed-1', 'bed'], ['wheel', 'wheel']] as const) {
    for (const turn of [0, 1, 2, 3] as const) it(`approaches, uses and leaves relocated ${owner} at turn ${turn}`, () => {
      const game = new Game(42); game.phase = 'free-play';
      const next: RoomLayout = { roomRevision: 1, placed: { [owner]: { x: -2, z: 2, turn } }, unplaced: [] };
      expect(validateRoomLayout(next)).toBeUndefined();
      expect(game.applyRoomLayout(next)).toBe(true);
      const cat = game.cats[0]; cat.nextNeedAt = Infinity;
      expect(game.visitFurniture(cat.id, spot)).toBe(true);
      let using = false;
      for (let i = 0; i < 2400 && !using; i++) { game.tick(.05); using = cat.visit?.phase === 'use'; }
      expect(using).toBe(true);
      const expected = game.roomLayout.spots.find(item => item.id === spot)!.route.at(-1)!;
      expect(cat.position.x).toBeCloseTo(expected.x); expect(cat.position.z).toBeCloseTo(expected.z);
      if (cat.visit) cat.visit.leaveRequested = true;
      for (let i = 0; i < 2400 && cat.visit; i++) game.tick(.05);
      expect(cat.visit).toBeUndefined(); expect(cat.elevation).toBe(0);
      expect(clearFloor(cat.position, 'whole-room', game.roomLayout.navigation)).toBe(true);
    });
  }
  it('removes omitted obstacles and all interaction spots without mutating other games', () => {
    const first = new RoomLayoutRuntime(), second = new RoomLayoutRuntime();
    const next = cloneRoomLayout(first.layout); delete next.placed.tree; delete next.placed.wheel;
    first.apply(next);
    expect(first.spots.some(spot => ['tree', 'post', 'wheel'].includes(spot.id))).toBe(false);
    expect(second.spots.some(spot => spot.id === 'wheel')).toBe(true);
    expect(clearFloor({ x: -1.65, z: 6.5 }, 'whole-room', first.navigation)).toBe(true);
    expect(clearFloor({ x: -1.65, z: 6.5 }, 'whole-room', second.navigation)).toBe(false);
  });
  it('repositions residents safely when committing and resets custom state for timed play', () => {
    const game = new Game(42);
    game.restoreFreePlay(PALETTE.slice(0, 5).map(cat => cat.name)); game.startFreePlay();
    const next = defaultRoomLayout(); delete next.placed.wheel;
    next.unplaced.push({ id: 'wheel', reason: 'Outside the updated room' });
    const before = JSON.stringify({ cats: game.cats, layout: game.roomLayout.layout });
    expect(game.canApplyRoomLayout(next)).toBe(true);
    expect(JSON.stringify({ cats: game.cats, layout: game.roomLayout.layout })).toBe(before);
    expect(game.applyRoomLayout(next)).toBe(true);
    for (const cat of game.cats) {
      expect(clearFloor(cat.position, 'whole-room', game.roomLayout.navigation)).toBe(true);
      expect(floorRoute(DEFAULT_LAYOUT_ENVIRONMENT.anchors[0], cat.position, 'whole-room', game.roomLayout.navigation).length).toBeGreaterThan(0);
      expect(cat.visit).toBeUndefined();
    }
    expect(game.inviteFreeCatToWheel()).toBe(false);
    game.reset();
    expect(game.roomLayout.layout.placed.wheel).toEqual(defaultRoomLayout().placed.wheel);
  });
});
