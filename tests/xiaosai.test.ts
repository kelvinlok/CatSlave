import { winBonus } from './support/bonus';
import { expect, it } from 'vitest';
import { Game } from '../src/simulation';

it('makes 小塞 available after the other reference cats and retains the adopted identity', () => {
  for (const seed of [1, 7, 42, 1234]) {
    const game = new Game(seed); game.reset();
    for (const appearance of ['latte', 'didi', 'xiaosai']) {
      game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); winBonus(game);
      const candidate = game.candidates.find(cat => cat.appearance === appearance)!;
      expect(candidate).toBeDefined();
      game.adopt(candidate.id); for (const tool of ['food', 'sweeper', 'mop', 'brush', 'toy'] as const) while (game.phase === 'upgrade' && game.levels[tool] < 3) game.upgrade(tool);
    }
    expect(game.cats.map(cat => cat.name)).toEqual(['Choco', 'Latte', '的的', '小塞']);
    expect(game.cats[3]).toMatchObject({ appearance: 'xiaosai', color: '#d7a05b' });
    game.stageElapsed = game.config.duration - 0.01; game.tick(0.02); winBonus(game);
    expect(game.candidates.every(cat => cat.appearance !== 'xiaosai')).toBe(true);
  }
});
