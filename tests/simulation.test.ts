import { describe, expect, it } from 'vitest';
import { Game, Random } from '../src/simulation';
import { STAGES, TOOLS } from '../src/config';
import { winBonus } from './support/bonus';

function active(seed = 42) { const game = new Game(seed); game.reset(); return game; }
function completeAll(game: Game) {
  for (const event of [...game.events]) { game.select(TOOLS.find(t => t.need === event.kind)!.id); game.work(event.id, 100); }
}
function survive(game: Game) { while (game.phase === 'playing') { completeAll(game); game.tick(0.5); } winBonus(game); }
function spendUpgrades(game: Game) {
  while (game.phase === 'upgrade') game.upgrade(TOOLS.find(tool => game.levels[tool.id] < 3)!.id);
}

describe('simulation', () => {
  it('uses a reproducible random stream', () => {
    const a = new Random(7), b = new Random(7);
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(Array.from({ length: 20 }, () => b.next()));
  });
  it('keeps at most one unresolved need per cat and staggers initial needs', () => {
    const game = active(); game.tick(2); expect(game.events).toHaveLength(1);
    game.spawn(game.cats[0]); game.tick(3); expect(game.events).toHaveLength(1);
    survive(game); game.adopt(game.candidates[0].id); spendUpgrades(game);
    game.tick(1.6); expect(game.events).toHaveLength(1);
    game.tick(1.1); expect(game.events).toHaveLength(2);
  });
  it('does not repeat the same kind for a cat', () => {
    const game = active(); let last;
    for (let i = 0; i < 30; i++) {
      game.spawn(game.cats[0]); expect(game.events[0].kind).not.toBe(last);
      last = game.events[0].kind; completeAll(game);
    }
  });
  it('rejects wrong tools and preserves partial work across tools and pause', () => {
    const game = active(); game.spawn(game.cats[0], 'hunger'); const event = game.events[0];
    expect(game.work(event.id, 1)).toBe(false); expect(event.progress).toBe(0);
    game.select('food'); game.work(event.id, 1); expect(event.progress).toBe(0.5);
    game.select('brush'); game.pause(); game.tick(10); game.resume(); expect(event.progress).toBe(0.5);
    game.select('food'); game.work(event.id, 3); expect(game.events).toHaveLength(0); expect(game.completed).toBe(1);
  });
  it('applies a 1-second warning and repeats damage every 4 seconds', () => {
    const game = active(); game.spawn(game.cats[0], 'poop');
    game.tick(22.5); expect(game.hp).toBe(100); expect(game.warning(game.events[0])).toBe(true);
    game.tick(0.5); expect(game.hp).toBe(90);
    game.tick(3.9); expect(game.hp).toBe(90);
    game.tick(0.1); expect(game.hp).toBe(80);
  });
  it('cancels a pending attack when care completes during the warning', () => {
    const game = active(); game.spawn(game.cats[0], 'poop'); game.tick(22.5);
    completeAll(game); game.tick(1); expect(game.hp).toBe(100);
  });
  it('freezes simulation and input when paused or in menus', () => {
    const game = active(); game.tick(3); const event = game.events[0]; const clock = game.clock;
    game.pause(); game.tick(300); expect(game.clock).toBe(clock); expect(game.work(event.id, 100)).toBe(false);
    game.resume(); game.tick(1); expect(game.clock).toBeCloseTo(clock + 1);
  });
  it('restores 20 HP, clears needs, and offers two distinct new coat colors', () => {
    const game = active(); game.hp = 45; survive(game);
    expect(game.phase).toBe('adoption'); expect(game.hp).toBe(65); expect(game.events).toHaveLength(0);
    expect(game.candidates).toHaveLength(2);
    expect(game.candidates[0].color).not.toBe(game.candidates[1].color);
    expect(game.candidates.every(c => c.color !== game.cats[0].color)).toBe(true);
    expect(game.candidates[0].behavior).toEqual(game.candidates[1].behavior);
    const clock = game.clock; game.tick(50); expect(game.clock).toBe(clock);
  });
  it('adopts exactly one cat, upgrades once, and starts the next stage', () => {
    const game = active();
    game.spawn(game.cats[0], 'poop'); game.tick(23); completeAll(game); survive(game);
    expect(game.lastStagePerfect).toBe(false); expect(game.upgradesRemaining).toBe(1);
    const id = game.candidates[0].id; game.adopt(id); game.adopt(id);
    expect(game.cats).toHaveLength(2); expect(game.phase).toBe('upgrade');
    game.upgrade('food'); expect(game.levels.food).toBe(2); expect(game.stage).toBe(1);
    game.upgrade('food'); expect(game.levels.food).toBe(2);
    game.spawn(game.cats[0], 'hunger'); game.select('food'); game.work(game.events[0].id, 1);
    expect(game.events[0].progress).toBe(0.75);
  });
  it('limits upgrades to level 3', () => {
    const game = active(); game.phase = 'upgrade'; game.upgradesRemaining = 1; game.levels.food = 3;
    game.upgrade('food'); expect(game.phase).toBe('upgrade'); expect(game.levels.food).toBe(3);
    expect(game.upgradesRemaining).toBe(1);
  });
  it('awards two picks after winning the perfect-stage bonus and waits for both', () => {
    const game = active();
    game.cats[0].nextNeedAt = Infinity; game.tick(game.timeLeft);
    expect(game.phase).toBe('bonus'); expect(game.upgradesRemaining).toBe(1); winBonus(game);
    expect(game.lastStagePerfect).toBe(true); expect(game.upgradesRemaining).toBe(2);
    game.adopt(game.candidates[0].id);
    const clock = game.clock;
    game.upgrade('toy');
    expect(game.phase).toBe('upgrade'); expect(game.stage).toBe(0); expect(game.upgradesRemaining).toBe(1);
    game.tick(100); expect(game.clock).toBe(clock);
    game.upgrade('toy');
    expect(game.levels.toy).toBe(3); expect(game.phase).toBe('playing'); expect(game.stage).toBe(1);
    expect(game.upgradesRemaining).toBe(0);
    game.upgrade('food'); expect(game.levels.food).toBe(1);
    game.reset(true); expect(game.lastStagePerfect).toBe(false); expect(game.upgradesRemaining).toBe(0);
  });
  it('awards perfection without HP loss even when the timer cuts off unfinished care', () => {
    const game = active();
    game.spawn(game.cats[0], 'poop'); game.tick(23); completeAll(game);
    game.cats[0].nextNeedAt = Infinity; game.tick(game.timeLeft);
    expect(game.lastStagePerfect).toBe(false); expect(game.upgradesRemaining).toBe(1);
    game.adopt(game.candidates[0].id); spendUpgrades(game);
    game.hp = 70;
    game.cats.forEach(cat => cat.nextNeedAt = Infinity); game.tick(game.timeLeft);
    expect(game.phase).toBe('bonus'); expect(game.upgradesRemaining).toBe(1); winBonus(game);
    expect(game.lastStagePerfect).toBe(true); expect(game.upgradesRemaining).toBe(2);
    expect(game.hp).toBe(90);
    game.adopt(game.candidates[0].id); spendUpgrades(game);
    game.cats.forEach(cat => cat.nextNeedAt = Infinity);
    game.stageElapsed = game.config.duration - 0.1; game.spawn(game.cats[0], 'hunger');
    game.select('food'); game.work(game.events[0].id, 0.5);
    expect(game.events[0].progress).toBeGreaterThan(0); expect(game.events[0].progress).toBeLessThan(1);
    game.tick(0.1);
    expect(game.lastStagePerfect).toBe(true); expect(game.phase).toBe('bonus'); expect(game.upgradesRemaining).toBe(1);
    expect(game.events).toHaveLength(0);
  });
  it('finishes five stages with five cats and never offers a sixth', () => {
    const game = active();
    for (let stage = 0; stage < STAGES.length; stage++) {
      survive(game);
      if (stage < 4) { game.adopt(game.candidates[0].id); spendUpgrades(game); }
    }
    expect(game.phase).toBe('victory'); expect(game.stagesSurvived).toBe(5); expect(game.cats).toHaveLength(5); expect(game.events).toHaveLength(0);
  });
  it('ends immediately on lethal damage, including at a stage boundary', () => {
    const game = active(); game.hp = 10; game.spawn(game.cats[0], 'poop');
    game.stageElapsed = 44; game.events[0].deadline = 0; game.events[0].nextAttackAt = 1;
    game.tick(1); expect(game.phase).toBe('game-over'); expect(game.hp).toBe(0); expect(game.stagesSurvived).toBe(0);
    const clock = game.clock; game.tick(100); expect(game.clock).toBe(clock);
  });
  it('runs all five untimed lessons without damage or score, then starts a fresh run', () => {
    const game = new Game(42); game.reset(true);
    for (let i = 0; i < 5; i++) {
      game.tick(100); expect(game.hp).toBe(100); expect(game.stageElapsed).toBe(0);
      expect(game.events[0].kind).toBe(TOOLS[i].need); completeAll(game);
      expect(game.tutorialDone).toBe(true); expect(game.completed).toBe(0); game.advanceTutorial();
    }
    expect(game.phase).toBe('playing'); expect(game.stage).toBe(0); expect(game.clock).toBe(0);
  });
  it('resets all run-only progression', () => {
    const game = active(); survive(game); game.adopt(game.candidates[0].id); game.upgrade('food'); game.hp = 10;
    game.reset(); expect(game.hp).toBe(100); expect(game.cats).toHaveLength(1); expect(game.levels.food).toBe(1); expect(game.stage).toBe(0); expect(game.completed).toBe(0);
  });
  it('wanders deterministically, leaving each cleaning mess at its birth location', () => {
    const a = active(17), b = active(17);
    for (const g of [a, b]) { g.cats[0].position = { x: 1.2, z: -0.5 }; g.spawn(g.cats[0], 'fur'); }
    const origin = { ...a.events[0].position };
    expect(Math.hypot(origin.x - a.cats[0].position.x, origin.z - a.cats[0].position.z)).toBeLessThan(0.7);
    a.tick(8); b.tick(8);
    expect(a.cats[0].position).toEqual(b.cats[0].position);
    expect(a.cats[0].position).not.toEqual(origin);
    expect(a.events[0].position).toEqual(origin);
    expect(a.cats[0].stride).toBeGreaterThan(0);
    expect(a.events[0].position).not.toBe(a.cats[0].position);
  });
  it('freezes locomotion on pause and keeps hungry or bored cats beside their targets', () => {
    const game = active(); game.spawn(game.cats[0], 'fur'); game.tick(3);
    const position = { ...game.cats[0].position }, stride = game.cats[0].stride;
    game.pause(); game.tick(20); expect(game.cats[0].position).toEqual(position); expect(game.cats[0].stride).toBe(stride);
    game.resume(); completeAll(game); game.spawn(game.cats[0], 'hunger'); game.tick(4);
    expect(game.cats[0].position).toEqual(position);
    completeAll(game); game.spawn(game.cats[0], 'boredom'); game.tick(4);
    expect(game.cats[0].position).toEqual(position);
  });
  it('allows a cat to cross the entire shared floor while staying inside its bounds', () => {
    const game = new Game(17); game.reset(true);
    const positions = [];
    for (let i = 0; i < 600; i++) { game.tick(0.5); positions.push({ ...game.cats[0].position }); }
    expect(Math.min(...positions.map(p => p.x))).toBeLessThan(-2);
    expect(Math.max(...positions.map(p => p.x))).toBeGreaterThan(2);
    expect(Math.min(...positions.map(p => p.z))).toBeLessThan(-4.5);
    expect(Math.max(...positions.map(p => p.z))).toBeGreaterThan(3.2);
    expect(positions.every(p => p.x >= -3.1 && p.x <= 3.1 && p.z >= -5.7 && p.z <= 4)).toBe(true);
  });
  it('identifies the attacker, including a fatal hit, and clears it on restart', () => {
    const game = active(); game.hp = 10; game.spawn(game.cats[0], 'vomit'); game.tick(23);
    expect(game.lastAttackCatId).toBe(game.cats[0].id); expect(game.damageSerial).toBe(1);
    game.reset(); expect(game.lastAttackCatId).toBeUndefined(); expect(game.damageSerial).toBe(0);
  });
});
