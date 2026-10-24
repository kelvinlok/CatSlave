import type { Game } from '../../src/simulation';

/** Advance a bonus for fixtures whose subject is a later game state. */
export function winBonus(game: Game) {
  if (game.phase !== 'bonus') return;
  game.startBonus(); game.tick(3);
  for (let second = 0; second < 10; second++) {
    game.cats.forEach(cat => game.pat(cat.id)); game.tick(1);
  }
  game.continueBonus();
}
