import { describe, it, expect } from 'vitest';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';
import { winBonus } from './support/bonus';

describe('cat dex collection', () => {
  it('offers only custom cats and migrates retired cats in saved winning rosters', () => {
    expect(PALETTE).toHaveLength(8);
    expect(PALETTE.every(cat => cat.appearance && cat.appearance !== 'primitive')).toBe(true);
    const g = new Game();
    g.restoreFreePlay(['Choco', 'Latte', 'Miso', 'Tofu', 'Olive']);
    expect(g.freePlayUnlocked).toBe(true);
    expect(new Set(g.freePlayRoster).size).toBe(5);
    expect(g.freePlayRoster).toContain('Choco'); expect(g.freePlayRoster).toContain('Latte');
    expect(g.freePlayRoster.every(name => PALETTE.some(cat => cat.name === name))).toBe(true);
    expect(g.startFreePlay()).toBe(true);
    expect(g.cats).toHaveLength(5);
  });
  it('unlocks only the adopted candidate and retains discovery across resets', () => {
    const g = new Game(42); g.reset();
    g.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); g.tick(g.timeLeft); winBonus(g);
    const [chosen, other] = g.candidates;
    expect(g.adoptedCats).toEqual(['Choco']);
    g.adopt(-1); expect(g.adoptedCats).toEqual(['Choco']);
    g.adopt(chosen.id); g.reset();
    expect(g.adoptedCats).toContain(chosen.name);
    expect(g.adoptedCats).not.toContain(other.name);
  });
  it('merges valid saved discoveries and migrates existing free-play rosters', () => {
    const g = new Game();
    g.restoreAdoptedCats(null); g.restoreAdoptedCats(['Latte', 'Latte', 'fake', 2]);
    expect(g.adoptedCats).toEqual(['Choco', 'Latte']);
    g.restoreFreePlay(PALETTE.slice(2, 7).map(cat => cat.name));
    expect(g.adoptedCats).toHaveLength(7);
    g.restoreAdoptedCats(['Choco']); expect(g.adoptedCats).toHaveLength(7);
  });
});
