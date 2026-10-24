import { winBonus } from './support/bonus';
import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';

describe('Latte adoption', () => {
  it('offers Latte after Choco and keeps her identity after adoption without offering duplicates', () => {
    for (const seed of [1, 7, 42, 1234]) {
      const game = new Game(seed); game.reset();
      expect(game.cats[0].name).toBe('Choco');
      game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); winBonus(game);
      expect(game.phase).toBe('adoption');
      const latte = game.candidates.find(cat => cat.name === 'Latte')!;
      expect(latte).toMatchObject({ appearance: 'latte', color: '#f8f4e9' });
      expect(game.candidates).toHaveLength(2);
      game.adopt(latte.id); for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
      expect(game.cats.map(cat => cat.name)).toEqual(['Choco', 'Latte']);
      expect(game.cats[1].appearance).toBe('latte');
      game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); winBonus(game);
      expect(game.candidates.every(cat => cat.name !== 'Latte' && cat.name !== 'Choco')).toBe(true);
    }
  });
});
