import { describe, expect, it } from 'vitest';
import { BonusRound, BONUS_GAMES } from '../src/bonus';
import { Game } from '../src/simulation';
import { winBonus } from './support/bonus';

function perfectStage() {
  const game = new Game(42); game.reset(); game.cats[0].nextNeedAt = Infinity;
  game.tick(game.timeLeft); return game;
}

describe('Butt Pats bonus', () => {
  it('waits for Ready and counts down three seconds without consuming patience', () => {
    const b = new BonusRound('butt-pats', [1, 2]);
    b.tick(100); expect(b.status).toBe('intro'); expect(b.pat(1)).toBe(false);
    b.start(); b.tick(2.99); expect(b.status).toBe('countdown'); expect(b.elapsed).toBe(0);
    expect(b.pat(1)).toBe(false); expect(b.patience(1)).toBe(3);
    b.tick(0.01); expect(b.status).toBe('playing'); expect(b.timeLeft).toBe(10);
  });
  it('wins after ten seconds of patting every cat and counts each pat', () => {
    const b = new BonusRound('butt-pats', [1, 2, 3, 4]); b.start(); b.tick(3);
    for (let i = 0; i < 5; i++) {
      b.catIds.forEach(id => expect(b.pat(id)).toBe(true)); b.tick(2);
    }
    expect(b.status).toBe('result'); expect(b.won).toBe(true); expect(b.pats).toBe(20);
    expect(b.timeLeft).toBe(0); expect(b.pat(1)).toBe(false);
  });
  it('loses on the first neglected cat and waits for the whole scratch animation', () => {
    const b = new BonusRound('butt-pats', [1, 2]); b.start(); b.tick(3);
    b.tick(2.9); for (let i = 0; i < 20; i++) b.pat(1);
    b.tick(0.1); expect(b.failedCatId).toBe(2); expect(b.status).toBe('scratch');
    expect(b.pat(2)).toBe(false); expect(b.timeLeft).toBe(7);
    b.tick(1.19); expect(b.status).toBe('scratch');
    b.tick(0.01); expect(b.status).toBe('result'); expect(b.won).toBe(false);
  });
  it('raises on each pat, settles gradually and ignores invalid targets and time', () => {
    const b = new BonusRound('butt-pats', [1]); b.start(); b.tick(3);
    expect(b.pat(999)).toBe(false); b.pat(1); expect(b.lift(1)).toBe(1);
    b.tick(0.7); expect(b.lift(1)).toBeCloseTo(0.25);
    b.pat(1); expect(b.lift(1)).toBe(1); b.tick(1.4); expect(b.lift(1)).toBeCloseTo(0);
    const clock = b.clock; b.tick(NaN); b.tick(-1); expect(b.clock).toBe(clock);
  });
  it('gives survival at the ten-second buzzer priority over a simultaneous patience expiry', () => {
    const b = new BonusRound('butt-pats', [1]); b.start(); b.tick(3);
    b.tick(2); b.pat(1); b.tick(2); b.pat(1); b.tick(2); b.pat(1); b.tick(1); b.pat(1); b.tick(3);
    expect(b.won).toBe(true); expect(b.failedCatId).toBeUndefined();
  });
});

describe('bonus progression', () => {
  it('requires winning the bonus before awarding the extra upgrade or offering adoption', () => {
    const game = perfectStage();
    expect(game.phase).toBe('bonus'); expect(game.upgradesRemaining).toBe(1);
    expect(game.candidates).toHaveLength(0); expect(BONUS_GAMES).toContain(game.bonus!.id);
    expect(game.bonus!.catIds).toEqual(game.cats.map(c => c.id));
    game.continueBonus(); expect(game.phase).toBe('bonus');
    winBonus(game); expect(game.phase).toBe('adoption'); expect(game.upgradesRemaining).toBe(2);
    game.continueBonus(); expect(game.upgradesRemaining).toBe(2);
  });
  it('keeps the regular reward and HP on a loss, then proceeds after the scratch', () => {
    const game = perfectStage(), hp = game.hp;
    game.startBonus(); game.tick(3); game.tick(3);
    expect(game.bonus!.status).toBe('scratch'); expect(game.lastAttackCatId).toBe(game.cats[0].id);
    expect(game.damageSerial).toBe(1); expect(game.hp).toBe(hp);
    game.continueBonus(); expect(game.phase).toBe('bonus');
    game.tick(1.2); expect(game.damageSerial).toBe(1); game.continueBonus();
    expect(game.phase).toBe('adoption'); expect(game.upgradesRemaining).toBe(1);
  });
  it('pauses countdown, patience and scratch recovery without accepting pats', () => {
    const game = perfectStage(); game.startBonus(); game.tick(1);
    for (const expected of ['countdown', 'playing', 'scratch'] as const) {
      const b = game.bonus!, before = [b.clock, b.countdown, b.elapsed];
      expect(b.status).toBe(expected); game.pause(); game.tick(100);
      expect(game.pat(game.cats[0].id)).toBe(false); expect([b.clock, b.countdown, b.elapsed]).toEqual(before);
      game.resume(); expect(game.phase).toBe('bonus');
      game.tick(expected === 'countdown' ? 2 : expected === 'playing' ? 3 : 1.2);
    }
    expect(game.bonus!.status).toBe('result');
    game.reset(); expect(game.bonus).toBeUndefined(); expect(game.phase).toBe('playing');
  });
  it('does not add an adoption bonus after the final stage or a damaged stage', () => {
    const game = new Game(42); game.reset(); game.spawn(game.cats[0], 'poop'); game.tick(23);
    game.events = []; game.cats[0].nextNeedAt = Infinity; game.tick(game.timeLeft);
    expect(game.phase).toBe('adoption'); expect(game.bonus).toBeUndefined(); expect(game.upgradesRemaining).toBe(1);
    game.reset(); game.stage = 4; game.startStage(); game.cats[0].nextNeedAt = Infinity; game.tick(game.timeLeft);
    expect(game.phase).toBe('victory'); expect(game.bonus).toBeUndefined();
  });
});
