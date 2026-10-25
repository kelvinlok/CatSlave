import { describe, expect, it } from 'vitest';
import { Game } from '../src/simulation';
import { PALETTE } from '../src/config';
import { FreeRoam, freeBowlPosition } from '../src/free-roam';

function room() { const g = new Game(5); g.restoreFreePlay(PALETTE.slice(0, 5).map(c => c.name)); g.startFreePlay(); return g; }
const random = { between: (min: number, max: number) => (min + max) / 2 };

describe('relaxed free room routines', () => {
  it('walks to its own bowl, eats for several seconds, and rests afterward', () => {
    const g = room(), cat = g.cats[0], cats = [cat], roam = new FreeRoam();
    const bowl = freeBowlPosition(0, 1);
    cat.position = { x: bowl.x, z: bowl.z + 1.5 }; cat.decisionAt = 0;
    roam.reset(cats, 0);
    let eatAt = 0;
    for (let time = 18; time < 35; time += .05) {
      roam.update(cats, time, .05, random);
      if (cat.activity === 'eating') { eatAt = time; break; }
    }
    expect(eatAt).toBeGreaterThan(18);
    expect(Math.hypot(cat.position.x - bowl.x, cat.position.z - (bowl.z + .55))).toBeLessThan(.04);
    for (let time = eatAt; time < eatAt + 5; time += .05) roam.update(cats, time, .05, random);
    expect(cat.activity).toBe('eating');
    roam.update(cats, eatAt + 8, .05, random);
    expect(cat.activity).toBe('idle'); expect(cat.decisionAt).toBeGreaterThan(eatAt + 15);
  });
  it('pairs nearby cats, keeps space between them, and releases both when interrupted', () => {
    const g = room(), cats = g.cats.slice(0, 2), roam = new FreeRoam();
    cats.forEach((cat, i) => { cat.position = { x: i * 1.6, z: 0 }; cat.decisionAt = 0; cat.activity = 'idle'; });
    roam.reset(cats, 0);
    for (let time = 16; time < 22; time += .05) {
      roam.update(cats, time, .05, random);
      expect(Math.hypot(cats[0].position.x - cats[1].position.x, cats[0].position.z - cats[1].position.z)).toBeGreaterThan(.6);
      if (cats.every(cat => cat.activity === 'playing')) break;
    }
    expect(cats.every(cat => cat.activity === 'playing')).toBe(true);
    expect(roam.playmate(cats[0].id)).toBe(cats[1].id);
    roam.cancel(cats[0].id, cats, 22);
    expect(cats.every(cat => !roam.busy(cat.id) && cat.activity === 'idle' && cat.decisionAt >= 30)).toBe(true);
  });
  it('naturally reaches meals and paired play without needs and pauses all routines', () => {
    const g = room(); let meals = 0, pairs = 0;
    for (let i = 0; i < 2400; i++) {
      g.tick(.25);
      meals += g.cats.filter(c => c.activity === 'eating').length;
      pairs += g.cats.filter(c => g.freeRoam.playmate(c.id) !== undefined).length;
    }
    expect(meals).toBeGreaterThan(20); expect(pairs).toBeGreaterThan(10);
    expect(g.events).toEqual([]); expect(g.hp).toBe(100);
    g.pause(); const before = JSON.stringify(g.cats); g.tick(30); expect(JSON.stringify(g.cats)).toBe(before);
  });
});
