import type { BonusRound } from './bonus';

export const PAWDICURE_DURATION = 45;
export const PAW_CLAW_COUNTS = [5, 5, 4, 4] as const;
export const CLIP_SWEEP_SECONDS = 1.3;
const MOOD_PERIOD = 7.7;

/** Input-independent grooming state. All animation and deadlines share the simulation clock. */
export class PawdicureRound {
  selectedCatId?: number;
  pawIndex = 0;
  readonly trimmed = PAW_CLAW_COUNTS.map(count => Array<boolean>(count).fill(false));
  activeClaw?: number = 0;
  suspended = false;
  private readonly zones: { start: number; end: number }[][];
  feedback = '';
  feedbackUntil = 0;
  combo = 0;
  recovery = 0;
  clock = 0;
  lastSnip?: { pawIndex: number; clawIndex: number; success: boolean };
  snipAge = Infinity;

  constructor(private readonly round: BonusRound, seed: number) {
    // Precompute each claw's target so retries cannot reroll an easier zone.
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    this.zones = PAW_CLAW_COUNTS.map(count => Array.from({ length: count }, () => {
      const width = 0.24 + random() * 0.12;
      const start = 0.06 + random() * (0.88 - width);
      return { start, end: start + width };
    }));
  }
  get aim() {
    const phase = this.clock / CLIP_SWEEP_SECONDS % 2;
    return phase <= 1 ? phase : 2 - phase;
  }
  get safeStart() { return this.zones[this.pawIndex][this.activeClaw ?? this.clawCount - 1].start; }
  get safeEnd() { return this.zones[this.pawIndex][this.activeClaw ?? this.clawCount - 1].end; }
  get clawCount() { return PAW_CLAW_COUNTS[this.pawIndex]; }
  get totalTrimmed() { return this.trimmed.reduce((total, paw) => total + paw.filter(Boolean).length, 0); }
  get mood(): 'calm' | 'warning' | 'moving' {
    const phase = this.clock % MOOD_PERIOD;
    return phase < 6 ? 'calm' : phase < 6.9 ? 'warning' : 'moving';
  }
  private get playing() { return this.round.status === 'playing' && !this.suspended; }
  get canSnip() { return this.playing && this.recovery <= 0 && this.mood !== 'moving' && this.activeClaw !== undefined; }
  selectCat(id: number) {
    if (this.round.status !== 'intro' || this.suspended || !this.round.catIds.includes(id)) return false;
    this.selectedCatId = id; return true;
  }
  reveal(index: number) {
    if (!this.canSnip
      || !Number.isInteger(index) || index < 0 || index >= this.clawCount || this.trimmed[this.pawIndex][index]) return false;
    this.activeClaw = index; return true;
  }
  snip(): 'success' | 'miss' | 'cancel' {
    if (!this.canSnip || this.activeClaw === undefined) return 'cancel';
    const success = this.aim >= this.safeStart && this.aim <= this.safeEnd;
    this.lastSnip = { pawIndex: this.pawIndex, clawIndex: this.activeClaw, success }; this.snipAge = 0;
    if (!success) {
      this.miss('Outside green — try the next pass'); return 'miss';
    }
    this.trimmed[this.pawIndex][this.activeClaw] = true;
    this.activeClaw = undefined; this.combo++; this.recovery = 0.22;
    this.feedback = this.combo > 1 ? `${this.combo} clean snips!` : 'Clean snip!';
    this.feedbackUntil = this.clock + 1;
    if (this.totalTrimmed === 18) {
      this.round.won = true; this.round.status = 'result'; this.feedback = 'All four paws done!';
    } else if (this.trimmed[this.pawIndex].every(Boolean)) {
      this.pawIndex++; this.recovery = 0.6; this.feedback = 'Paw complete!';
    }
    if (this.round.status === 'playing') this.activeClaw = this.trimmed[this.pawIndex].findIndex(done => !done);
    return 'success';
  }
  private miss(message: string) {
    this.combo = 0; this.recovery = 0.7;
    this.feedback = message; this.feedbackUntil = this.clock + 1.2;
  }
  tick(dt: number) {
    if (!this.playing || !Number.isFinite(dt) || dt <= 0) return;
    this.tickEffects(dt);
    this.clock += dt; this.recovery = Math.max(0, this.recovery - dt);
  }
  tickEffects(dt: number) {
    if (this.lastSnip && !this.suspended && Number.isFinite(dt) && dt > 0) this.snipAge = Math.min(10, this.snipAge + dt);
  }
}
