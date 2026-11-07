import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { beginVisit, tickVisit } from '../src/cat-behavior';
import { RoomLayoutRuntime, defaultRoomLayout, validateRoomLayout } from '../src/room-layout';
import { clearFloor } from '../src/room-navigation';

function fixture() {
  const game = new Game(12); game.reset(); game.phase = 'tutorial';
  const cat = game.cats[0]; cat.nextNeedAt = Infinity; cat.nextStretchAt = Infinity;
  return { game, cat };
}
describe('Christmas tree furniture', () => {
  it('rises, slips and lands safely without ever perching', () => {
    const { game, cat } = fixture();
    expect(game.visitFurniture(cat.id, 'christmas-tree')).toBe(true);
    let highest = 0, sawSlide = false;
    for (let i = 0; i < 1600 && cat.visit; i++) {
      const before = cat.elevation; game.tick(.025);
      highest = Math.max(highest, cat.elevation);
      if (cat.elevation < before && cat.visit?.phase === 'use') sawSlide = true;
      expect(cat.activity).not.toBe('perching');
      expect(cat.elevation).toBeGreaterThanOrEqual(0);
    }
    expect(highest).toBeGreaterThan(.5); expect(highest).toBeLessThanOrEqual(.55);
    expect(sawSlide).toBe(true); expect(cat.visit).toBeUndefined(); expect(cat.elevation).toBe(0);
    expect(cat.lastFurniture).toBe('christmas-tree');
    expect(clearFloor(cat.position, 'whole-room', game.roomLayout.navigation)).toBe(true);
  });
  it('moves and rotates the approach and landing with the tree, and removes the interaction when stored', () => {
    const layout = defaultRoomLayout(); layout.placed['christmas-tree'] = { x: -2.5, z: -.5, turn: 1 };
    expect(validateRoomLayout(layout)).toBeUndefined();
    const runtime = new RoomLayoutRuntime(layout), { cat } = fixture();
    const spot = runtime.spots.find(s => s.id === 'christmas-tree')!;
    expect(spot.route[0]).toEqual({ x: -1.35, z: -.5, height: 0 });
    cat.position = { ...spot.route[0] }; cat.elevation = 0;
    expect(beginVisit(cat, 'christmas-tree', [cat], 'whole-room', runtime)).toBe(true);
    for (let i = 0; i < 300 && cat.visit; i++) tickVisit(cat, i * .05, .05, [cat], undefined, 'whole-room', runtime);
    expect(cat.visit).toBeUndefined(); expect(cat.elevation).toBe(0);
    expect(cat.position.x).toBeCloseTo(spot.route[0].x); expect(cat.position.z).toBeCloseTo(spot.route[0].z);
    delete layout.placed['christmas-tree']; runtime.apply(layout);
    expect(beginVisit(cat, 'christmas-tree', [cat], 'whole-room', runtime)).toBe(false);
  });
  it('does not attempt to climb a disabled decoration', () => {
    const { game, cat } = fixture(); game.festiveDecorations = false;
    const tree = defaultRoomLayout().placed['christmas-tree'];
    expect(game.visitFurniture(cat.id, 'christmas-tree')).toBe(false);
    expect(clearFloor(tree, 'whole-room', game.roomLayout.navigation)).toBe(true);
    expect(game.roomLayout.layout.placed['christmas-tree']).toEqual(tree);
    game.festiveDecorations = true;
    expect(clearFloor(tree, 'whole-room', game.roomLayout.navigation)).toBe(false);
    expect(game.visitFurniture(cat.id, 'christmas-tree')).toBe(true);
  });
});
