import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { CLEANING_TOOLS, TOOLS, VACUUM, toolMatches } from '../src/config';
import { Gesture } from '../src/gestures';
import { winBonus } from './support/bonus';

describe('vacuum unlock', () => {
  it('is reached through six normal upgrades across three perfect stages', () => {
    const game = new Game(42); game.reset();
    game.select('vacuum'); expect(game.selected).toBe('sweeper');
    for (const tool of CLEANING_TOOLS) {
      game.cats.forEach(c => c.nextNeedAt = Infinity); game.tick(game.timeLeft); winBonus(game);
      expect(game.upgradesRemaining).toBe(2); game.adopt(game.candidates[0].id);
      game.upgrade(tool); expect(game.vacuumUnlocked).toBe(false);
      game.upgrade(tool);
    }
    expect(game.stage).toBe(3); expect(game.phase).toBe('playing');
    expect(game.vacuumUnlocked).toBe(true); expect(game.selected).toBe('vacuum');
    expect(game.availableTools.map(t => t.id)).toEqual(['vacuum', 'food', 'toy']);
    expect(game.feedback).toContain('Vacuum unlocked');
    game.pause(); game.resume(); expect(game.vacuumUnlocked).toBe(true);
    game.reset(); expect(game.vacuumUnlocked).toBe(false);
    expect(game.availableTools).toEqual(TOOLS); expect(game.selected).toBe('sweeper');
  });
  it('unlocks only with every cleaner maxed, costs no extra pick and cannot itself be upgraded', () => {
    for (const missing of CLEANING_TOOLS) {
      const game = new Game(); game.reset();
      CLEANING_TOOLS.forEach(t => game.levels[t] = 3); game.levels[missing] = 2;
      expect(game.vacuumUnlocked).toBe(false);
      game.phase = 'upgrade'; game.upgradesRemaining = 2; game.upgrade(missing);
      expect(game.vacuumUnlocked).toBe(true); expect(game.upgradesRemaining).toBe(1);
      game.upgrade('vacuum'); expect(game.upgradesRemaining).toBe(1);
      game.upgrade('food'); expect(game.phase).toBe('playing');
    }
  });
  it('cleans each mess once but rejects food/play and unavailable vacuum use', () => {
    const game = new Game(); game.reset(); game.spawn(game.cats[0], 'poop');
    game.selected = 'vacuum'; expect(game.work(game.events[0].id, 1)).toBe(false);
    game.events = []; CLEANING_TOOLS.forEach(t => game.levels[t] = 3); game.select('vacuum');
    for (const kind of ['poop', 'vomit', 'fur'] as const) {
      game.spawn(game.cats[0], kind); const event = game.events[0]; event.progress = 0.3;
      expect(game.toolFor(kind).id).toBe('vacuum'); expect(toolMatches(VACUUM, kind)).toBe(true);
      expect(game.work(event.id, 1)).toBe(true); expect(game.events).toHaveLength(0);
      expect(game.work(event.id, 1)).toBe(false);
    }
    expect(game.completed).toBe(3);
    for (const kind of ['hunger', 'boredom'] as const) {
      game.spawn(game.cats[0], kind); expect(game.work(game.events[0].id, 1)).toBe(false);
      expect(game.events[0].progress).toBe(0); game.events = [];
    }
  });
  it('requires a click released inside its starting target; holding and dragging do not vacuum', () => {
    const gesture = new Gesture(), p = { x: 50, y: 50 };
    const begin = () => gesture.begin(p, 0, 400, { kind: 'care', eventId: 12, tool: VACUUM });
    begin(); expect(gesture.hold(1, true).work).toBe(0);
    expect(gesture.end(p, undefined, true)).toEqual({ work: 1, eventId: 12 });
    begin(); expect(gesture.end(p, undefined, false).work).toBe(0);
    begin(); expect(gesture.move({ x: 90, y: 50 }, 20, true).work).toBe(0);
    expect(gesture.end({ x: 90, y: 50 }, undefined, true).work).toBe(0);
    begin(); gesture.cancel(); expect(gesture.end(p).work).toBe(0);
  });
});
