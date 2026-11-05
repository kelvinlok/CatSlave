import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';
import { defaultCatOutfit } from '../src/wardrobe';
import type { Phase } from '../src/types';

describe('wardrobe game flow', () => {
  it('returns to the exact entry screen and does not advance the simulation while dressing', () => {
    for (const entry of ['title', 'cat-dex', 'free-play'] as const) {
      const game = new Game(42);
      if (entry === 'free-play') {
        game.restoreFreePlay(PALETTE.slice(0, 5).map(cat => cat.name)); game.startFreePlay(); game.tick(.25);
      } else game.phase = entry;
      const before = { clock: game.clock, cats: JSON.stringify(game.cats), hp: game.hp,
        stageElapsed: game.stageElapsed, wheelAngle: game.wheelAngle, events: JSON.stringify(game.events) };
      expect(game.openWardrobe()).toBe(true); expect(game.phase).toBe('wardrobe');
      expect(game.running).toBe(false); expect(game.active).toBe(false);
      game.tick(120); game.pause();
      expect(game.phase).toBe('wardrobe');
      expect({ clock: game.clock, cats: JSON.stringify(game.cats), hp: game.hp,
        stageElapsed: game.stageElapsed, wheelAngle: game.wheelAngle, events: JSON.stringify(game.events) }).toEqual(before);
      expect(game.closeWardrobe()).toBe(true); expect(game.phase).toBe(entry);
    }
  });

  it('cycles only adopted cats and opens on the selected free-play cat', () => {
    const game = new Game(42); game.restoreAdoptedCats([PALETTE[2].name, PALETTE[8].name]);
    game.openWardrobe(8); expect(game.wardrobeCatIndex).toBe(8);
    game.cycleWardrobeCat(1); expect(game.wardrobeCatIndex).toBe(0);
    game.cycleWardrobeCat(1); expect(game.wardrobeCatIndex).toBe(2);
    game.cycleWardrobeCat(-1); expect(game.wardrobeCatIndex).toBe(0);
    game.cycleWardrobeCat(Number.NaN); expect(game.wardrobeCatIndex).toBe(0);
    game.closeWardrobe(); game.openWardrobe(7);
    expect([0, 2, 8]).toContain(game.wardrobeCatIndex);
    game.closeWardrobe(); game.restoreFreePlay(PALETTE.slice(0, 5).map(cat => cat.name)); game.startFreePlay();
    const selected = game.cats[3]; game.chooseFreeCat(selected.id);
    expect(game.openWardrobe()).toBe(true); expect(game.wardrobeCatIndex).toBe(3);
    expect(game.inFreePlay).toBe(true);
    game.closeWardrobe(); expect(game.phase).toBe('free-play'); expect(game.selectedFreeCatId).toBe(selected.id);
  });

  it('mixes three slots per cat, removes individual pieces, and resets only the chosen cat', () => {
    const game = new Game(42); game.restoreAdoptedCats(['Latte']); game.openWardrobe(0);
    game.equipWardrobe('momo'); game.chooseWardrobeCategory('neckwear'); game.equipWardrobe('latte');
    game.chooseWardrobeCategory('footwear'); game.equipWardrobe('xiaosai');
    expect(game.wardrobe.get('choco')).toEqual({ headwear: 'momo', neckwear: 'latte', footwear: 'xiaosai' });
    expect(game.wardrobe.get('latte')).toEqual(defaultCatOutfit('latte'));
    game.wardrobeItemOffset = 4; game.chooseWardrobeCategory('headwear'); expect(game.wardrobeItemOffset).toBe(0);
    game.equipWardrobe('none'); expect(game.wardrobe.get('choco')).toEqual({ headwear: 'none', neckwear: 'latte', footwear: 'xiaosai' });
    game.cycleWardrobeCat(1); game.equipWardrobe('didi');
    expect(game.wardrobe.get('latte').headwear).toBe('didi');
    game.resetWardrobe(); expect(game.wardrobe.get('latte')).toEqual(defaultCatOutfit('latte'));
    expect(game.wardrobe.get('choco')).toEqual({ headwear: 'none', neckwear: 'latte', footwear: 'xiaosai' });
    game.closeWardrobe(); game.reset();
    expect(game.wardrobe.get('choco')).toEqual({ headwear: 'none', neckwear: 'latte', footwear: 'xiaosai' });
  });

  it('rejects entry from active or modal flows and cannot equip a locked cat or equip outside the closet', () => {
    const blocked: Phase[] = ['playing', 'tutorial', 'bonus', 'paused', 'adoption', 'upgrade', 'game-over', 'victory', 'room-editor', 'room-notice'];
    for (const phase of blocked) {
      const game = new Game(42); game.phase = phase;
      expect(game.openWardrobe()).toBe(false); expect(game.phase).toBe(phase);
      expect(game.equipWardrobe('none')).toBe(false);
      game.resetWardrobe(); expect(game.wardrobe.get('choco')).toEqual(defaultCatOutfit('choco'));
    }
    const game = new Game(42); game.openWardrobe(); game.wardrobeCatIndex = 8;
    expect(game.equipWardrobe('none')).toBe(false); expect(game.wardrobe.get('dingding')).toEqual(defaultCatOutfit('dingding'));
  });
});
