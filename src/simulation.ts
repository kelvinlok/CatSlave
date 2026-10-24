import { ATTACK_DAMAGE, ATTACK_INTERVAL, ATTACK_WARNING, CLEANING_TOOLS, EFFICIENCY, PALETTE, ROOM, STAGES, STRETCH_DURATION, TOOLS, TOOL_BY_ID, VACUUM, toolMatches } from './config';
import type { CareEvent, CatDefinition, CatState, EventKind, Phase, ToolId } from './types';
import { FURNITURE } from './furniture';
import { beginVisit, tickVisit } from './cat-behavior';
import { BONUS_GAMES, BonusRound } from './bonus';

export class Random {
  constructor(private seed: number) {}
  next() { let t = this.seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  between(min: number, max: number) { return min + this.next() * (max - min); }
  choose<T>(items: readonly T[]): T { return items[Math.floor(this.next() * items.length)]; }
}

export class Game {
  phase: Phase = 'title';
  resumePhase: 'playing' | 'tutorial' | 'bonus' = 'playing';
  pauseReason = 'A little breather';
  hp = 100;
  stage = 0;
  clock = 0;
  stageElapsed = 0;
  completed = 0;
  stagesSurvived = 0;
  lastStagePerfect = false;
  upgradesRemaining = 0;
  bonus?: BonusRound;
  private stageDamageStart = 0;
  selected: ToolId = 'sweeper';
  levels: Record<ToolId, number> = { sweeper: 1, mop: 1, brush: 1, food: 1, toy: 1, vacuum: 1 };
  cats: CatState[] = [];
  events: CareEvent[] = [];
  candidates: CatDefinition[] = [];
  tutorialStep = 0;
  tutorialDone = false;
  revision = 0;
  damageSerial = 0;
  lastAttackCatId?: number;
  feedback = '';
  feedbackUntil = 0;
  wrongToolEventId?: number;
  wrongToolUntil = 0;
  private nextId = 1;
  private random: Random;
  private movementRandom: Random;
  constructor(seed = Date.now()) { this.random = new Random(seed); this.movementRandom = new Random(seed ^ 0x51ca7); this.cats = [this.makeCat(PALETTE[0], 0)]; }
  get config() { return STAGES[this.stage]; }
  get active() { return this.phase === 'playing' || this.phase === 'tutorial'; }
  get running() { return this.active || this.phase === 'bonus'; }
  get inBonus() { return this.phase === 'bonus' || this.phase === 'paused' && this.resumePhase === 'bonus'; }
  get vacuumUnlocked() { return CLEANING_TOOLS.every(id => this.levels[id] >= 3); }
  get availableTools() { return this.vacuumUnlocked ? [VACUUM, TOOL_BY_ID.food, TOOL_BY_ID.toy] : TOOLS; }
  toolFor(kind: EventKind) { return this.availableTools.find(tool => toolMatches(tool, kind))!; }
  get timeLeft() { return Math.max(0, this.config.duration - this.stageElapsed); }

  private makeCat(palette: typeof PALETTE[number], index: number): CatState {
    return { ...palette, id: this.nextId++, appearance: palette.appearance ?? 'primitive', behavior: { needRate: 1, patience: 1 },
      nextNeedAt: 0, happyUntil: 0, attackUntil: 0,
      position: { x: 0, z: -1.2 }, destination: { x: 0, z: -1.2 }, yaw: 0.65, stride: 0, activity: 'idle', decisionAt: 0.6, elevation: 0, pose: 0 };
  }

  reset(tutorial = false) {
    this.hp = 100; this.stage = 0; this.clock = 0; this.stageElapsed = 0;
    this.completed = 0; this.stagesSurvived = 0; this.events = []; this.candidates = [];
    this.lastStagePerfect = false; this.upgradesRemaining = 0; this.stageDamageStart = 0;
    this.bonus = undefined;
    this.selected = 'sweeper'; this.tutorialStep = 0; this.tutorialDone = false;
    this.levels = { sweeper: 1, mop: 1, brush: 1, food: 1, toy: 1, vacuum: 1 };
    this.cats = [this.makeCat(PALETTE[0], 0)]; this.feedback = ''; this.damageSerial = 0; this.lastAttackCatId = undefined;
    this.wrongToolEventId = undefined; this.wrongToolUntil = 0;
    if (tutorial) { this.phase = 'tutorial'; this.spawn(this.cats[0], TOOLS[0].need); }
    else this.startStage();
    this.revision++;
  }

  startStage() {
    this.phase = 'playing'; this.stageElapsed = 0; this.events = []; this.feedback = '';
    this.bonus = undefined;
    this.stageDamageStart = this.damageSerial;
    this.cats.forEach((cat, i) => {
      cat.nextNeedAt = this.clock + 1.5 + i * 1.1; cat.attackUntil = 0;
      const starts = [{ x: 0, z: 1.2 }, { x: -2.2, z: -3.8 }, { x: 2.2, z: -4.4 }, { x: -2, z: 2.8 }, { x: 2, z: 3.2 }];
      cat.position = { ...starts[i] };
      cat.destination = { ...cat.position }; cat.activity = 'idle'; cat.decisionAt = this.clock + 0.6 + i * 0.3;
      cat.stretchStartedAt = undefined; cat.nextStretchAt = this.clock + 12 + i * 3;
      cat.elevation = 0; cat.pose = 0; cat.visit = undefined; cat.lastFurniture = undefined; cat.pendingNeed = undefined;
    });
    this.revision++;
  }

  advanceTutorial() {
    if (this.phase !== 'tutorial' || !this.tutorialDone) return;
    if (this.tutorialStep === TOOLS.length - 1) { this.reset(false); return; }
    this.tutorialStep++; this.tutorialDone = false;
    this.selected = TOOLS[this.tutorialStep].id; this.spawn(this.cats[0], TOOLS[this.tutorialStep].need); this.revision++;
  }

  spawn(cat: CatState, kind?: EventKind) {
    if (this.events.some(e => e.catId === cat.id)) return;
    // Needs never leave a bowl or mess suspended inside furniture. Finish the
    // visit and return to the floor before scheduling the next care event.
    if (cat.visit && cat.elevation === 0 && cat.position.z >= ROOM.minZ && cat.position.x >= ROOM.minX && cat.position.x <= ROOM.maxX) {
      cat.lastFurniture = cat.visit.id; cat.visit = undefined; cat.pose = 0;
    }
    if (cat.visit) { cat.visit.leaveRequested = true; cat.pendingNeed ??= kind; cat.nextNeedAt = Math.min(cat.nextNeedAt, this.clock); return; }
    const nextKind = kind ?? cat.pendingNeed ?? this.random.choose(TOOLS.filter(t => t.need !== cat.lastKind)).need;
    cat.pendingNeed = undefined;
    const deadline = this.phase === 'tutorial' ? Infinity : this.clock + this.config.patience * cat.behavior.patience;
    const cleaning = nextKind === 'poop' || nextKind === 'vomit' || nextKind === 'fur';
    // Put fresh messes beside the paws so the player can see their first stroke.
    const position = cleaning ? { x: cat.position.x + (cat.position.x > 0 ? -0.58 : 0.58),
      z: Math.min(ROOM.maxZ, cat.position.z + 0.25) } : { ...cat.position };
    this.events.push({ id: this.nextId++, catId: cat.id, kind: nextKind, progress: 0,
      createdAt: this.clock, deadline, nextAttackAt: deadline + ATTACK_WARNING, attacks: 0,
      position });
    cat.activity = 'sniffing'; cat.decisionAt = this.clock + 0.9;
    cat.stretchStartedAt = undefined; cat.pose = 0;
    cat.lastKind = nextKind; this.revision++;
  }

  tick(dt: number) {
    if (this.phase === 'bonus' && this.bonus) {
      const before = this.bonus.status;
      const failedBefore = this.bonus.failedCatId;
      this.bonus.tick(dt);
      if (before !== this.bonus.status) {
        if (this.bonus.failedCatId !== undefined && failedBefore === undefined) {
          this.damageSerial++; this.lastAttackCatId = this.bonus.failedCatId;
        }
        if (this.bonus.won) this.upgradesRemaining = 2;
        this.revision++;
      }
      return;
    }
    if (!this.active || dt <= 0 || !Number.isFinite(dt)) return;
    // Substeps keep deadlines, lethal attacks, and stage boundaries deterministic.
    let remaining = dt;
    while (remaining > 0.000001 && this.active) {
      const step = Math.min(remaining, 0.05, this.phase === 'playing' ? this.timeLeft : 0.05);
      remaining -= step; this.clock += step;
      this.moveCats(step);
      for (const cat of this.cats) if (cat.pendingNeed && !cat.visit) this.spawn(cat, cat.pendingNeed);
      if (this.phase === 'tutorial') continue;
      this.stageElapsed += step;
      for (const event of this.events) {
        if (this.clock + 1e-7 >= event.nextAttackAt) {
          this.hp = Math.max(0, this.hp - ATTACK_DAMAGE); event.attacks++;
          event.nextAttackAt += ATTACK_INTERVAL; this.damageSerial++;
          const cat = this.cats.find(c => c.id === event.catId)!;
          cat.attackUntil = this.clock + 1.15; this.lastAttackCatId = cat.id;
          this.say(`${cat.name} scratched you!  −10 HP`); this.revision++;
          if (this.hp === 0) { this.phase = 'game-over'; return; }
        }
      }
      if (this.timeLeft < 1e-7) { this.finishStage(); break; }
      for (const cat of this.cats) {
        if (!this.events.some(e => e.catId === cat.id) && this.clock >= cat.nextNeedAt) this.spawn(cat);
      }
    }
  }

  private moveCats(dt: number) {
    for (const cat of this.cats) {
      const need = this.events.find(e => e.catId === cat.id);
      if (cat.visit) { cat.stretchStartedAt = undefined; tickVisit(cat, this.clock, dt, this.cats); continue; }
      // Bowls and play stay reachable. Cleaning messes remain behind as the cat wanders.
      const waiting = need && (need.kind === 'hunger' || need.kind === 'boredom');
      if (waiting || cat.attackUntil > this.clock) {
        cat.stretchStartedAt = undefined; cat.pose = 0;
        cat.activity = need?.kind === 'hunger' ? (need.progress > 0 ? 'eating' : 'sniffing') : need?.kind === 'boredom' ? 'playing' : 'idle';
        const turn = Math.atan2(Math.sin(-cat.yaw), Math.cos(-cat.yaw));
        cat.yaw += turn * Math.min(1, dt * 4);
        continue;
      }
      if (cat.activity === 'stretching') {
        cat.stretchStartedAt ??= this.clock;
        cat.pose = Math.min(1, (this.clock - cat.stretchStartedAt) / STRETCH_DURATION);
        if (cat.pose >= 1) {
          cat.activity = 'idle'; cat.pose = 0; cat.stretchStartedAt = undefined;
          cat.decisionAt = this.clock + 0.7;
        }
        continue;
      }
      // Stretch only during an unhurried floor pause, with room to reach forward.
      if (!need && cat.elevation === 0 && (cat.activity === 'idle' || cat.activity === 'sniffing')
        && this.clock >= (cat.nextStretchAt ?? Infinity) && cat.nextNeedAt > this.clock + STRETCH_DURATION) {
        const reach = { x: cat.position.x + Math.sin(cat.yaw) * 0.7, z: cat.position.z + Math.cos(cat.yaw) * 0.7 };
        const clear = reach.x > ROOM.minX && reach.x < ROOM.maxX && reach.z > ROOM.minZ && reach.z < ROOM.maxZ
          && this.cats.every(other => other === cat || other.elevation > 0.3 || Math.hypot(other.position.x - reach.x, other.position.z - reach.z) > 0.65);
        if (clear) {
          cat.activity = 'stretching'; cat.stretchStartedAt = this.clock; cat.pose = 0;
          cat.destination = { ...cat.position }; cat.nextStretchAt = this.clock + this.movementRandom.between(28, 44);
          continue;
        }
      }
      if (cat.activity !== 'walking' && this.clock >= cat.decisionAt) {
        if (!need && cat.nextNeedAt > this.clock + 2 && this.movementRandom.next() < 0.8) {
          const spots = FURNITURE.filter(spot => spot.id !== cat.lastFurniture && !this.cats.some(other => other.visit?.id === spot.id));
          if (spots.length && this.visitFurniture(cat.id, this.movementRandom.choose(spots).id)) continue;
        }
        // Every cat can choose any part of the same room; there are no assigned lanes.
        for (let attempt = 0; attempt < 12; attempt++) {
          cat.destination = { x: this.movementRandom.between(ROOM.minX, ROOM.maxX), z: this.movementRandom.between(ROOM.minZ, ROOM.maxZ) };
          if (this.cats.every(other => other === cat || Math.hypot(other.position.x - cat.destination.x, other.position.z - cat.destination.z) > 0.85)) break;
        }
        cat.activity = 'walking';
      }
      if (cat.activity !== 'walking') continue;
      const dx = cat.destination.x - cat.position.x, dz = cat.destination.z - cat.position.z;
      const distance = Math.hypot(dx, dz), desired = Math.atan2(dx, dz);
      const turn = Math.atan2(Math.sin(desired - cat.yaw), Math.cos(desired - cat.yaw));
      cat.yaw += turn * Math.min(1, dt * 5);
      // Turn before stepping; this avoids sliding sideways when choosing a new destination.
      const travel = Math.min(distance, dt * ROOM.walkSpeed * Math.max(0, Math.cos(turn)));
      if (distance > 0.001) {
        const next = { x: cat.position.x + dx / distance * travel, z: cat.position.z + dz / distance * travel };
        const blocked = this.cats.some(other => other !== cat && other.elevation < 0.3 && Math.hypot(other.position.x - next.x, other.position.z - next.z) < 0.60);
        if (blocked) { cat.activity = 'idle'; cat.decisionAt = this.clock + 0.3 + (cat.id % 3) * 0.1; }
        else { cat.position = next; cat.stride += travel * 10; }
      }
      if (distance < 0.025) {
        cat.activity = this.movementRandom.next() < 0.45 ? 'sniffing' : 'idle';
        cat.decisionAt = this.clock + this.movementRandom.between(1.2, 3.8);
      }
    }
  }

  visitFurniture(catId: number, id: string) {
    const cat = this.cats.find(c => c.id === catId);
    if (!this.active || !cat || this.events.some(e => e.catId === catId)) return false;
    return beginVisit(cat, id, this.cats);
  }

  work(eventId: number, amount: number): boolean {
    if (!this.active || amount <= 0 || !Number.isFinite(amount)) return false;
    const event = this.events.find(e => e.id === eventId);
    if (!event) return false;
    const tool = TOOL_BY_ID[this.selected];
    if (!this.availableTools.some(t => t.id === this.selected) || !toolMatches(tool, event.kind)) { this.rejectTool(event); return false; }
    event.progress = this.selected === 'vacuum' ? 1 : Math.min(1, event.progress + amount * EFFICIENCY[this.levels[this.selected]] / tool.work);
    if (event.progress >= 1 - 1e-7) {
      const cat = this.cats.find(c => c.id === event.catId)!;
      cat.happyUntil = this.clock + 1.8; cat.attackUntil = 0;
      cat.activity = event.kind === 'hunger' ? 'eating' : 'idle';
      cat.decisionAt = this.clock + 1.8;
      cat.nextNeedAt = this.clock + this.random.between(...this.config.delay) / cat.behavior.needRate;
      this.events = this.events.filter(e => e.id !== eventId);
      if (this.phase === 'tutorial') this.tutorialDone = true;
      else this.completed++;
      this.say(`${cat.name} approves. For now.`); this.revision++;
    }
    return true;
  }

  select(tool: ToolId) {
    if (!this.active) return;
    if (this.vacuumUnlocked && CLEANING_TOOLS.some(id => id === tool)) tool = 'vacuum';
    if (!this.availableTools.some(t => t.id === tool)) return;
    this.selected = tool; this.revision++;
  }
  rejectTool(event: CareEvent) {
    this.wrongToolEventId = event.id; this.wrongToolUntil = this.clock + 1.5;
    this.say(`Use the ${this.toolFor(event.kind).name.toLowerCase()} for this`);
  }
  say(message: string) { this.feedback = message; this.feedbackUntil = this.clock + 2; }
  pause(reason = 'A little breather') {
    if (!this.running) return;
    this.resumePhase = this.phase as 'playing' | 'tutorial' | 'bonus'; this.phase = 'paused'; this.pauseReason = reason; this.revision++;
  }
  resume() { if (this.phase === 'paused') { this.phase = this.resumePhase; this.revision++; } }

  private finishStage() {
    // The stage timer can cut care short; only HP loss disqualifies perfection.
    this.lastStagePerfect = this.damageSerial === this.stageDamageStart;
    this.upgradesRemaining = this.stage < STAGES.length - 1 ? 1 : 0;
    this.events = []; this.stagesSurvived++; this.feedback = '';
    if (this.stage === STAGES.length - 1) { this.phase = 'victory'; this.revision++; return; }
    if (this.lastStagePerfect) {
      this.bonus = new BonusRound(this.random.choose(BONUS_GAMES), this.cats.map(cat => cat.id));
      this.phase = 'bonus'; this.revision++; return;
    }
    this.openAdoption();
  }

  startBonus() { if (this.phase === 'bonus') { this.bonus?.start(); this.revision++; } }
  pat(catId: number) {
    if (this.phase !== 'bonus' || !this.bonus?.pat(catId)) return false;
    this.revision++; return true;
  }
  continueBonus() {
    if (this.phase !== 'bonus' || this.bonus?.status !== 'result') return;
    this.openAdoption();
  }

  private openAdoption() {
    this.hp = Math.min(100, this.hp + 20);
    const available = PALETTE.filter(p => !this.cats.some(c => c.color === p.color));
    const featured = this.stage === 0 ? 'latte' : this.stage === 1 ? 'didi' : this.stage === 2 ? 'xiaosai' : undefined;
    const first = available.find(p => featured !== undefined && p.appearance === featured) ?? this.random.choose(available);
    const second = this.random.choose(available.filter(p => p !== first));
    this.candidates = [first, second].map(p => this.makeCat(p, this.cats.length));
    this.phase = 'adoption'; this.revision++;
  }

  adopt(id: number) {
    if (this.phase !== 'adoption') return;
    const candidate = this.candidates.find(c => c.id === id);
    if (!candidate) return;
    this.cats.push({ ...candidate, nextNeedAt: 0, happyUntil: 0, attackUntil: 0,
      position: { x: 0, z: -1.2 }, destination: { x: 0, z: -1.2 }, yaw: 0.65, stride: 0, activity: 'idle', decisionAt: this.clock + 1, elevation: 0, pose: 0 });
    this.candidates = []; this.phase = 'upgrade'; this.revision++;
  }
  upgrade(tool: ToolId) {
    if (this.phase !== 'upgrade' || this.upgradesRemaining <= 0 || !TOOL_BY_ID[tool] || tool === 'vacuum' || this.levels[tool] >= 3) return;
    const wasUnlocked = this.vacuumUnlocked;
    this.levels[tool]++; this.upgradesRemaining--; this.revision++;
    if (!wasUnlocked && this.vacuumUnlocked) this.selected = 'vacuum';
    if (this.upgradesRemaining === 0) { this.stage++; this.startStage(); }
    if (!wasUnlocked && this.vacuumUnlocked) this.say('Vacuum unlocked! Tap any mess to clean it.');
  }
  urgency(event: CareEvent) {
    if (this.phase === 'tutorial' || (this.phase === 'paused' && this.resumePhase === 'tutorial')) return 'calm';
    if (this.clock >= event.deadline) return 'angry';
    return event.deadline - this.clock <= 4 ? 'urgent' : 'calm';
  }
  warning(event: CareEvent) { return event.nextAttackAt - this.clock <= ATTACK_WARNING && this.clock >= event.deadline; }
}
