import { winBonus } from './support/bonus';
import { expect, it } from 'vitest';
import { Game } from '../src/simulation';

it('offers 的的 by the second adoption and preserves his name and appearance without duplicates', () => {
  for (const seed of [1, 7, 42, 1234]) {
    const game = new Game(seed); game.reset();
    for (let stage = 0; stage < 2; stage++) {
      game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); winBonus(game);
      const appearance = stage === 0 ? 'latte' : 'didi';
      const candidate = game.candidates.find(cat => cat.appearance === appearance)!;
      expect(candidate).toBeDefined();
      game.adopt(candidate.id); for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
    }
    expect(game.cats.map(cat => cat.name)).toEqual(['Choco', 'Latte', '的的']);
    expect(game.cats[2]).toMatchObject({ appearance: 'didi', color: '#727983' });
    game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); winBonus(game);
    expect(game.candidates.every(candidate => !game.cats.some(cat => cat.appearance === candidate.appearance && cat.color === candidate.color))).toBe(true);
  }
});
