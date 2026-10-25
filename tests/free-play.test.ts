import { describe, it, expect } from 'vitest';
import { Game } from '../src/simulation';
import { PALETTE, STAGES, TOOLS } from '../src/config';
import { winBonus } from './support/bonus';

describe('free play', () => {
  it('locks until victory and retains the winning adopted roster across restart', () => {
    const g = new Game(42); expect(g.startFreePlay()).toBe(false); g.reset();
    for (let stage = 0; stage < STAGES.length; stage++) {
      g.cats.forEach(c => { c.nextNeedAt = Infinity; }); g.tick(g.timeLeft);
      if (g.phase === 'victory') break;
      winBonus(g); g.adopt(g.candidates[0].id);
      while (g.phase === 'upgrade') g.upgrade(TOOLS.find(t => g.levels[t.id] < 3)!.id);
    }
    expect(g.phase).toBe('victory'); expect(g.freePlayUnlocked).toBe(true);
    const names = g.cats.map(c => c.name); expect(g.startFreePlay()).toBe(true);
    g.tick(600); g.spawn(g.cats[0], 'poop');
    expect(g.events).toEqual([]); expect(g.hp).toBe(100); expect(g.phase).toBe('free-play');
    g.chooseFreeCat(g.cats[4].id); expect(g.interactFreeCat('pet')).toBe(true);
    expect(g.cats[4].happyUntil).toBeGreaterThan(g.clock);
    g.pause(); const clock = g.clock; g.tick(5); expect(g.clock).toBe(clock);
    expect(g.interactFreeCat('wand')).toBe(false); g.resume(); expect(g.phase).toBe('free-play');
    g.reset(); g.phase = 'title'; g.startFreePlay(); expect(g.cats.map(c => c.name)).toEqual(names);
    const restored = new Game(); restored.restoreFreePlay(names); restored.startFreePlay();
    expect(restored.cats.map(c => c.name)).toEqual(names);
  });
  it('rejects malformed saved rosters', () => {
    for (const names of [null, [], ['fake'], Array(5).fill(PALETTE[0].name)]) {
      const g = new Game(); g.restoreFreePlay(names); expect(g.freePlayUnlocked).toBe(false);
    }
  });
});
