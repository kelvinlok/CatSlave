import type { Game } from '../../src/simulation';

/** Advance a bonus for fixtures whose subject is a later game state. */
export function winBonus(game: Game) {
  if (game.phase !== 'bonus') return;
  const paw = game.bonus?.paw;
  if (paw) paw.selectCat(game.cats[0].id);
  game.startBonus(); game.tick(3);
  if (paw) {
    for (let attempt = 0; attempt < 3500 && game.bonus?.status === 'playing'; attempt++) {
      const middle = (paw.safeStart + paw.safeEnd) / 2;
      if (paw.canSnip && Math.abs(paw.aim - middle) < (paw.safeEnd - paw.safeStart) * 0.12) paw.snip();
      else game.tick(0.02);
    }
    if (!game.bonus?.won) throw new Error('Pawdicure fixture failed to finish all four paws');
  } else {
    for (let second = 0; second < 10; second++) {
      game.cats.forEach(cat => game.pat(cat.id)); game.tick(1);
    }
  }
  game.continueBonus();
}
