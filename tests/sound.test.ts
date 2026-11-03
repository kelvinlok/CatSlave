import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { RoomSounds, type SoundId, type SoundSink } from '../src/sound';
import { WHEEL_RUN_SPEED } from '../src/cat-wheel';

function setup() {
  const game = new Game(42); game.reset();
  const sounds = new RoomSounds(), calls: SoundId[] = [];
  let stops = 0;
  const wheelSpeeds: number[] = [];
  const sink: SoundSink = { play(id) { calls.push(id); }, setWheelSpeed(speed) { wheelSpeeds.push(speed); }, stop() { stops++; } };
  const update = () => sounds.update(game, sink);
  update();
  return { game, sounds, calls, sink, update, wheelSpeeds, stops: () => stops };
}

describe('room audio follows gameplay', () => {
  it('follows the wheel through approach, acceleration, pause, braking and exit', () => {
    const t = setup(), cat = t.game.cats[0]; t.game.phase = 'tutorial';
    cat.nextNeedAt = cat.decisionAt = Infinity;
    expect(t.game.visitFurniture(cat.id, 'wheel')).toBe(true);
    t.update(); expect(t.wheelSpeeds.at(-1)).toBe(0);
    for (let i = 0; i < 1000 && t.game.wheelSpeed < WHEEL_RUN_SPEED; i++) { t.game.tick(.05); t.update(); }
    expect(t.wheelSpeeds.at(-1)).toBe(WHEEL_RUN_SPEED);
    expect(t.wheelSpeeds.some(speed => speed > 0 && speed < WHEEL_RUN_SPEED)).toBe(true);
    const beforePause = t.wheelSpeeds.length;
    t.game.pause(); t.update(); t.game.tick(3); t.update();
    expect(t.stops()).toBe(1); expect(t.wheelSpeeds).toHaveLength(beforePause);
    t.game.resume(); t.update(); expect(t.wheelSpeeds.at(-1)).toBe(WHEEL_RUN_SPEED);
    t.game.spawn(cat, 'hunger'); t.game.tick(.1); t.update();
    expect(t.wheelSpeeds.at(-1)).toBeGreaterThan(0);
    expect(t.wheelSpeeds.at(-1)).toBeLessThan(WHEEL_RUN_SPEED);
    for (let i = 0; i < 1000 && cat.visit; i++) { t.game.tick(.05); t.update(); }
    expect(cat.visit).toBeUndefined(); expect(t.wheelSpeeds.at(-1)).toBe(0);
  });
  it('calls once for a new need but does not purr for routine cleaning', () => {
    const t = setup(); t.game.spawn(t.game.cats[0], 'poop'); t.update(); t.update();
    expect(t.calls).toEqual(['meow']);
    t.game.work(t.game.events[0].id, 100); t.update(); t.update();
    expect(t.calls).toEqual(['meow']);
  });
  it('purrs once when finishing wand play clears the last need', () => {
    const t = setup(); t.game.spawn(t.game.cats[0], 'boredom'); t.update();
    t.game.select('toy'); t.game.work(t.game.events[0].id, 100); t.update(); t.update();
    expect(t.calls.filter(id => id === 'purr')).toHaveLength(1);
  });
  it('keeps play rewards quiet while another cat still needs care', () => {
    const t = setup();
    t.game.cats.push({ ...t.game.cats[0], id: 999 });
    t.game.spawn(t.game.cats[0], 'boredom'); t.game.spawn(t.game.cats[1], 'hunger'); t.update();
    t.game.select('toy'); t.game.work(t.game.events[0].id, 100); t.update();
    expect(t.calls).not.toContain('purr');
    t.game.select('food'); t.game.work(t.game.events[0].id, 100); t.update();
    expect(t.calls).not.toContain('purr'); // No delayed reward when the queue clears.
  });
  it('times scratching and eating sounds, keeps sleeping quiet, and stops during pause', () => {
    const t = setup(), cat = t.game.cats[0];
    cat.activity = 'scratching'; t.game.clock = .3; t.update(); t.update();
    t.game.clock = .6; t.update();
    expect(t.calls).toEqual(['scratch', 'scratch']);
    t.game.pause(); t.update(); t.update();
    expect(t.stops()).toBe(1);
    t.game.resume(); cat.activity = 'eating'; t.update();
    expect(t.calls.at(-1)).toBe('eat');
    const beforeSleeping = [...t.calls];
    cat.activity = 'sleeping'; t.update();
    for (let i = 0; i < 3; i++) { t.game.clock += 4; t.update(); }
    t.game.pause(); t.update(); t.game.resume(); t.update();
    expect(t.calls).toEqual(beforeSleeping);
  });
  it('sounds at each jump landing, including consecutive tree platforms', () => {
    const t = setup(), cat = t.game.cats[0];
    cat.activity = 'jumping';
    cat.visit = { id: 'tree', phase: 'approach', route: [], index: 1, progress: .9,
      from: { x: 0, z: 0, height: 0 }, until: 0, leaveRequested: false };
    t.update(); cat.visit.index++; cat.visit.progress = 0; t.update(); t.update();
    expect(t.calls).toEqual(['land']);
    cat.activity = 'perching'; t.update(); expect(t.calls).toEqual(['land']);
  });
  it('rustles when entering the box and clears stale state on restart', () => {
    const t = setup(), cat = t.game.cats[0];
    cat.activity = 'crawling'; t.update(); t.update();
    expect(t.calls).toEqual(['rustle']);
    t.game.clock = 5; t.update(); t.game.reset(); t.update();
    expect(t.stops()).toBe(1);
    expect(t.calls).toEqual(['rustle']);
  });
});
