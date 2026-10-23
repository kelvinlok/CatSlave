import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { World } from '../src/world';

function setup(kind: 'hunger' | 'boredom') {
  const game = new Game(4), world = new World(); game.reset(true); game.events = [];
  game.spawn(game.cats[0], kind); game.select(kind === 'hunger' ? 'food' : 'toy');
  world.resize(390, 844); world.update(game, 0, 0);
  return { game, world, event: game.events[0] };
}

describe('care world integration', () => {
  it('uses a hollow arch around the head with no floor toy, and keeps it anchored while pointing', () => {
    const { game, world, event } = setup('boredom');
    const anchor = world.eventPosition(event), screen = world.project(anchor);
    world.setCarePointer(event, { x: screen.x - 20, y: screen.y - 20 }, true, 21);
    const coarse = world.carePointer!.energy;
    world.carePointer = undefined;
    for (let i = 0; i < 21; i++) world.setCarePointer(event, { x: screen.x + 20, y: screen.y - 20 }, true, 1);
    expect(world.carePointer!.energy).toBeCloseTo(coarse);
    world.update(game, 0, 0);
    expect(world.eventPosition(event).equals(anchor)).toBe(true);
    expect(world.scene.children.some(o => o.userData.eventId === event.id)).toBe(false);
    const arch = world.playArea(event);
    world.setCarePointer(event, { x: arch.x, y: arch.y - (arch.outerY + arch.innerY) / 2 }, true);
    expect(world.carePointer!.focus.z).toBeCloseTo(event.position.z + 0.35);
    expect(world.carePointer!.focus.y).toBeGreaterThan(0.65);
    expect(world.toyHit(event, { x: arch.x, y: arch.y - (arch.outerY + arch.innerY) / 2 })).toBe(true);
    expect(world.toyHit(event, { x: arch.x, y: arch.y })).toBe(false);
    expect(world.toyHit(event, { x: arch.x, y: arch.y + 50 })).toBe(false);
    expect(world.toyHit(event, { x: -100, y: -100 })).toBe(false);
  });

  it('shows a full bowl after completion, freezes its departure on pause, and cleans up on same-clock reset', () => {
    const { game, world, event } = setup('hunger');
    game.work(event.id, 2); world.update(game, 0, 0);
    const bowl = world.scene.children.find(o => o.userData.eventId === event.id)!;
    expect(bowl.userData.kibbleCount).toBe(64);
    expect(game.cats[0].activity).toBe('eating');
    game.pause(); game.tick(10); world.update(game, 10, 10);
    expect(bowl.scale.x).toBe(0.8);
    game.reset(true); world.update(game, 0, 10);
    expect(world.scene.children.some(o => o.userData.eventId === event.id)).toBe(false);
  });

  it('hides and clears the pouring stream and focus on interruption', () => {
    const { game, world, event } = setup('hunger');
    const screen = world.project(world.eventPosition(event));
    world.setCarePointer(event, screen, true); world.update(game, 0, 0);
    const bowl = world.scene.children.find(o => o.userData.eventId === event.id)!;
    expect(bowl.getObjectByName('food-stream')!.visible).toBe(true);
    game.pause(); world.update(game, 0, 0);
    expect(world.carePointer).toBeUndefined();
    expect(bowl.getObjectByName('food-stream')!.visible).toBe(false);
    expect(game.events[0].progress).toBe(0);
  });
  it('keeps the gaze target aligned with a visible feather even for the minimum-size distant arch', () => {
    const { game, world, event } = setup('boredom');
    game.cats[0].position = { x: 0, z: -5.7 }; event.position = { ...game.cats[0].position };
    world.focusOn(world.eventPosition(event)); world.update(game, 0, 0);
    const arch = world.playArea(event), pointer = { x: arch.x, y: arch.y - arch.outerY * 0.9 };
    expect(world.toyHit(event, pointer)).toBe(true);
    world.setCarePointer(event, pointer, true);
    const projected = world.project(world.carePointer!.focus);
    expect(projected.x).toBeCloseTo(pointer.x); expect(projected.y).toBeCloseTo(pointer.y);
  });
});
