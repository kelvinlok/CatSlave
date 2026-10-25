import { PawdicureRound, PAWDICURE_DURATION } from './pawdicure';

/** Add future mini-games here; selection uses the run's seeded random stream. */
export const BONUS_GAMES = ['butt-pats', 'pawdicure'] as const;
export type BonusId = typeof BONUS_GAMES[number];
export type BonusStatus = 'intro' | 'countdown' | 'playing' | 'scratch' | 'result';
export const BONUS_DURATION = 10;
export const PAT_PATIENCE = 3;
export const BONUS_SCRATCH_DURATION = 1.2;

export class BonusRound {
  status: BonusStatus = 'intro';
  countdown = 3;
  elapsed = 0;
  clock = 0;
  pats = 0;
  won = false;
  failedCatId?: number;
  private scratchElapsed = 0;
  private lastPats = new Map<number, number>();
  private liftTimes = new Map<number, number>();
  readonly catIds: readonly number[];
  readonly paw?: PawdicureRound;

  constructor(readonly id: BonusId, catIds: readonly number[], randomSeed = 12345) {
    this.catIds = [...catIds];
    catIds.forEach(id => this.lastPats.set(id, 0));
    if (id === 'pawdicure') this.paw = new PawdicureRound(this, randomSeed);
  }
  get timeLeft() { return Math.max(0, (this.paw ? PAWDICURE_DURATION : BONUS_DURATION) - this.elapsed); }
  start() { if (this.status === 'intro' && (!this.paw || this.paw.selectedCatId !== undefined)) this.status = 'countdown'; }
  patience(id: number) { return Math.max(0, PAT_PATIENCE - (this.elapsed - (this.lastPats.get(id) ?? 0))); }
  lift(id: number) {
    const at = this.liftTimes.get(id);
    return at === undefined ? 0 : Math.max(0, 1 - (this.clock - at) / 1.4) ** 2;
  }
  pat(id: number) {
    if (this.paw || this.status !== 'playing' || !this.lastPats.has(id)) return false;
    this.lastPats.set(id, this.elapsed); this.liftTimes.set(id, this.clock); this.pats++;
    return true;
  }
  tick(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0 || this.status === 'intro') return;
    if (this.status === 'result') { this.paw?.tickEffects(dt); return; }
    let remaining = dt;
    while (remaining > 1e-8) {
      if (this.status === 'countdown') {
        const step = Math.min(remaining, this.countdown);
        this.countdown = Math.max(0, this.countdown - step); this.clock += step; remaining -= step;
        if (this.countdown < 1e-8) { this.countdown = 0; this.status = 'playing'; }
      } else if (this.status === 'playing') {
        if (this.paw) {
          const step = Math.min(remaining, this.timeLeft);
          this.paw.tick(step); this.elapsed += step; this.clock += step; remaining -= step;
          if (this.timeLeft < 1e-8) { this.status = 'result'; break; }
          continue;
        }
        const deadline = Math.min(...this.catIds.map(id => this.lastPats.get(id)! + PAT_PATIENCE));
        const step = Math.max(0, Math.min(remaining, this.timeLeft, deadline - this.elapsed));
        this.elapsed += step; this.clock += step; remaining -= step;
        // Surviving the full ten seconds wins, including a deadline at the buzzer.
        if (this.timeLeft < 1e-8) { this.elapsed = BONUS_DURATION; this.won = true; this.status = 'result'; break; }
        if (deadline - this.elapsed < 1e-8) {
          this.failedCatId = this.catIds.find(id => this.patience(id) < 1e-8);
          this.status = 'scratch';
        }
      } else if (this.status === 'scratch') {
        const step = Math.min(remaining, BONUS_SCRATCH_DURATION - this.scratchElapsed);
        this.scratchElapsed += step; this.clock += step; remaining -= step;
        if (this.scratchElapsed >= BONUS_SCRATCH_DURATION - 1e-8) { this.status = 'result'; break; }
      } else break;
    }
  }
}
