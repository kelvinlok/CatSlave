import { describe, expect, it } from 'vitest';
import { BonusRound, BONUS_GAMES } from '../src/bonus';
import { Game } from '../src/simulation';
import { PAWDICURE_DURATION, CLIP_SWEEP_SECONDS } from '../src/pawdicure';

function round(seed = 12345) {
  const bonus = new BonusRound('pawdicure', [10, 20], seed);
  bonus.paw!.selectCat(20); bonus.start(); bonus.tick(3);
  return bonus;
}
function waitForWindow(bonus: BonusRound, advance = (dt: number) => bonus.tick(dt)) {
  const paw = bonus.paw!;
  for (let steps = 0; steps < 4000 && bonus.status === 'playing'; steps++) {
    const middle = (paw.safeStart + paw.safeEnd) / 2;
    if (paw.canSnip && Math.abs(paw.aim - middle) < (paw.safeEnd - paw.safeStart) * 0.12) return;
    advance(0.02);
  }
  throw new Error('No playable snip window before timeout');
}
function finish(bonus: BonusRound, advance = (dt: number) => bonus.tick(dt)) {
  const paw = bonus.paw!, zones: number[][] = [];
  while (bonus.status === 'playing') {
    waitForWindow(bonus, advance);
    expect(paw.activeClaw).toBe(paw.trimmed[paw.pawIndex].findIndex(done => !done));
    zones.push([paw.safeStart, paw.safeEnd]);
    expect(paw.snip()).toBe('success');
    if (bonus.status === 'playing') advance(0.3);
  }
  return zones;
}

describe('Pawdicure', () => {
  it('requires choosing a cat and freezes the indicator through the countdown', () => {
    expect(BONUS_GAMES).toContain('pawdicure');
    const bonus = new BonusRound('pawdicure', [10, 20]), paw = bonus.paw!;
    bonus.start(); expect(bonus.status).toBe('intro'); expect(paw.snip()).toBe('cancel');
    expect(paw.selectCat(999)).toBe(false); expect(paw.selectCat(20)).toBe(true);
    bonus.start(); bonus.tick(2.9);
    expect(paw.clock).toBe(0); expect(paw.aim).toBe(0); expect(paw.canSnip).toBe(false);
    expect(paw.snip()).toBe('cancel'); expect(bonus.timeLeft).toBe(PAWDICURE_DURATION);
    bonus.tick(0.1); expect(bonus.status).toBe('playing'); expect(paw.canSnip).toBe(true);
  });
  it('sweeps back and forth without input or automatic misses', () => {
    const bonus = round(), paw = bonus.paw!;
    bonus.tick(CLIP_SWEEP_SECONDS / 2); expect(paw.aim).toBeCloseTo(0.5);
    bonus.tick(CLIP_SWEEP_SECONDS / 2); expect(paw.aim).toBeCloseTo(1);
    bonus.tick(CLIP_SWEEP_SECONDS / 2); expect(paw.aim).toBeCloseTo(0.5);
    bonus.tick(CLIP_SWEEP_SECONDS / 2); expect(paw.aim).toBeCloseTo(0);
    expect(paw.totalTrimmed).toBe(0); expect(paw.recovery).toBe(0); expect(paw.feedback).toBe('');
  });
  it('accepts a single snip in either sweep direction and blocks immediate repeat snips', () => {
    for (const reverse of [false, true]) {
      const bonus = round(), paw = bonus.paw!, middle = (paw.safeStart + paw.safeEnd) / 2;
      bonus.tick((reverse ? 2 - middle : middle) * CLIP_SWEEP_SECONDS);
      expect(paw.snip()).toBe('success'); expect(paw.totalTrimmed).toBe(1);
      expect(paw.activeClaw).toBe(1); expect(paw.snip()).toBe('cancel'); expect(paw.totalTrimmed).toBe(1);
    }
  });
  it('generates bounded varied per-claw zones reproducibly from the round seed', () => {
    const a = finish(round(100)), b = finish(round(100)), c = finish(round(200));
    expect(a).toHaveLength(18); expect(a).toEqual(b); expect(a).not.toEqual(c);
    expect(new Set(a.map(zone => zone.join(','))).size).toBeGreaterThan(12);
    const widths = a.map(([start, end]) => end - start);
    expect(Math.max(...widths) - Math.min(...widths)).toBeGreaterThan(0.05);
    for (const [start, end] of [...a, ...c]) {
      expect(start).toBeGreaterThanOrEqual(0.06 - 1e-9); expect(end).toBeLessThanOrEqual(0.94 + 1e-9);
      expect(end - start).toBeGreaterThanOrEqual(0.24 - 1e-9); expect(end - start).toBeLessThanOrEqual(0.36 + 1e-9);
    }
  });
  it('auto-selects all 18 claws and wins immediately after the last press', () => {
    const bonus = round(); finish(bonus);
    expect(bonus.status).toBe('result'); expect(bonus.won).toBe(true);
    expect(bonus.paw!.trimmed.map(paw => paw.filter(Boolean).length)).toEqual([5, 5, 4, 4]);
    expect(bonus.paw!.totalTrimmed).toBe(18); expect(bonus.paw!.pawIndex).toBe(3);
    expect(bonus.paw!.snip()).toBe('cancel'); expect(bonus.timeLeft).toBeGreaterThan(0);
  });
  it('keeps the same claw and zone after a miss and preserves prior progress', () => {
    const bonus = round(), paw = bonus.paw!, firstZone = [paw.safeStart, paw.safeEnd];
    expect(paw.snip()).toBe('miss'); expect(paw.activeClaw).toBe(0);
    expect([paw.safeStart, paw.safeEnd]).toEqual(firstZone); expect(paw.recovery).toBeGreaterThan(0);
    expect(paw.snip()).toBe('cancel'); waitForWindow(bonus); expect(paw.snip()).toBe('success');
    const nextZone = [paw.safeStart, paw.safeEnd];
    for (let steps = 0; steps < 1000 && !(paw.canSnip && paw.aim < 0.03); steps++) bonus.tick(0.02);
    expect(paw.snip()).toBe('miss'); expect(paw.totalTrimmed).toBe(1); expect(paw.activeClaw).toBe(1);
    expect([paw.safeStart, paw.safeEnd]).toEqual(nextZone);
  });
  it('telegraphs movement and rejects snips during it without penalizing waiting', () => {
    const bonus = round(), paw = bonus.paw!;
    bonus.tick(6.1); expect(paw.mood).toBe('warning');
    bonus.tick(0.9); expect(paw.mood).toBe('moving'); expect(paw.canSnip).toBe(false);
    expect(paw.snip()).toBe('cancel'); expect(paw.recovery).toBe(0);
    bonus.tick(0.8); expect(paw.mood).toBe('calm'); expect(paw.canSnip).toBe(true); expect(paw.totalTrimmed).toBe(0);
  });
  it('times out cleanly and rejects post-result input without HP attacks', () => {
    const bonus = round(), paw = bonus.paw!; bonus.tick(100);
    expect(bonus.status).toBe('result'); expect(bonus.won).toBe(false);
    expect(bonus.elapsed).toBe(PAWDICURE_DURATION); expect(bonus.failedCatId).toBeUndefined(); expect(paw.snip()).toBe('cancel');
  });
  it('pauses both timer and sweep and rejects paused input', () => {
    const game = new Game(42); game.startPawdicurePractice();
    const bonus = game.bonus!, paw = bonus.paw!;
    paw.selectCat(game.cats[0].id); game.startBonus(); game.tick(3.3); game.pause();
    const clock = paw.clock, aim = paw.aim; game.tick(100);
    expect(paw.clock).toBe(clock); expect(paw.aim).toBe(aim); expect(paw.canSnip).toBe(false);
    expect(paw.snip()).toBe('cancel'); game.resume(); game.tick(0.2); expect(paw.aim).not.toBe(aim);
  });
  it('lets practice retry and exit without rewards or changing saved unlocks', () => {
    const game = new Game(42); game.freePlayUnlocked = true; game.freePlayRoster = ['Choco'];
    expect(game.startPawdicurePractice()).toBe(true);
    expect(game.cats.map(cat => cat.name)).toEqual(['Choco', 'Latte', '的的', '小塞', 'Yelo', 'Miller', 'Momo', '震震子']);
    const bonus = game.bonus!; bonus.paw!.selectCat(game.cats[1].id); game.startBonus(); game.tick(3);
    finish(bonus, dt => game.tick(dt)); game.tick(0.01);
    expect(game.upgradesRemaining).toBe(0); expect(game.hp).toBe(100);
    expect(game.startPawdicurePractice()).toBe(true); expect(game.bonus!.status).toBe('intro');
    game.bonus!.paw!.selectCat(game.cats[0].id); game.startBonus(); game.tick(PAWDICURE_DURATION + 3); game.continueBonus();
    expect(game.phase).toBe('title'); expect(game.practiceBonus).toBe(false);
    expect(game.freePlayUnlocked).toBe(true); expect(game.freePlayRoster).toEqual(['Choco']);
  });
  it('does not replace an active shift and ignores invalid timer deltas', () => {
    const game = new Game(42); game.reset();
    expect(game.startPawdicurePractice()).toBe(false); expect(game.phase).toBe('playing');
    const bonus = round(), paw = bonus.paw!;
    for (const dt of [NaN, Infinity, -1, 0]) bonus.tick(dt);
    expect(bonus.elapsed).toBe(0); expect(paw.aim).toBe(0); expect(paw.clock).toBe(0);
  });
  it('awards the campaign bonus and keeps the normal reward on timeout', () => {
    for (const win of [true, false]) {
      const game = new Game(42); game.reset(); game.upgradesRemaining = 1;
      game.bonus = new BonusRound('pawdicure', game.cats.map(cat => cat.id)); game.phase = 'bonus';
      game.bonus.paw!.selectCat(game.cats[0].id); game.startBonus(); game.tick(3);
      if (win) finish(game.bonus, dt => game.tick(dt)); else game.tick(PAWDICURE_DURATION);
      game.continueBonus(); expect(game.phase).toBe('adoption');
      expect(game.upgradesRemaining).toBe(win ? 2 : 1); expect(game.damageSerial).toBe(0);
    }
  });
});
