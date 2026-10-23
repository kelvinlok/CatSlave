import { describe, expect, it } from 'vitest';
import { Gesture } from '../src/gestures';
import { TOOL_BY_ID } from '../src/config';

describe('gesture ownership', () => {
  it('keeps care gestures on their original target', () => {
    const g = new Gesture(); g.begin({ x: 50, y: 50 }, 0, 400, { kind: 'care', eventId: 1, tool: TOOL_BY_ID.sweeper });
    expect(g.move({ x: 90, y: 50 }, 20, true).work).toBeCloseTo(0.1);
    expect(g.move({ x: 100, y: 50 }, 40, true).look).toBeUndefined();
    expect(g.end({ x: 300, y: 50 }).work).toBe(0);
  });
  it('empty-space drags turn the view after a dead zone and never produce care', () => {
    const g = new Gesture(); g.begin({ x: 300, y: 50 }, 0, 400, { kind: 'empty' });
    expect(g.move({ x: 297, y: 50 }, 10, true).look).toBeUndefined();
    expect(g.move({ x: 50, y: 50 }, 20, true)).toEqual({ work: 0, look: { x: -247, y: 0 } });
    expect(g.end({ x: 50, y: 50 })).toEqual({ work: 0 });
  });
  it('UI gestures never leak work and must release on the same control', () => {
    const g = new Gesture(); g.begin({ x: 50, y: 50 }, 0, 400, { kind: 'ui', id: 'food' });
    expect(g.move({ x: 50, y: 50 }, 20, true).work).toBe(0); expect(g.end({ x: 50, y: 50 }, 'food').click).toBe('food');
    g.begin({ x: 50, y: 50 }, 0, 400, { kind: 'ui', id: 'food' }); expect(g.end({ x: 50, y: 50 }, 'mop').click).toBeUndefined();
  });
  it('stationary touch never progresses cleaning', () => {
    for (const tool of [TOOL_BY_ID.sweeper, TOOL_BY_ID.mop, TOOL_BY_ID.brush]) {
      const g = new Gesture(); g.begin({ x: 50, y: 50 }, 0, 400, { kind: 'care', eventId: 1, tool });
      expect(g.move({ x: 50, y: 50 }, 1000, true).work).toBe(0); expect(g.end({ x: 50, y: 50 }).work).toBe(0);
    }
  });
  it('plays with a stationary held wand only inside its action area', () => {
    const g = new Gesture(); g.begin({ x: 50, y: 50 }, 0, 400, { kind: 'care', eventId: 7, tool: TOOL_BY_ID.toy });
    expect(g.move({ x: 50, y: 50 }, 1000, true).work).toBe(0);
    expect(g.hold(0.08, true)).toEqual({ eventId: 7, work: 0.08 });
    expect(g.hold(0.08, false).work).toBe(0);
    g.cancel(); expect(g.hold(0.08, true).work).toBe(0);
  });
  it('pours continuously only while held inside, and never grants extra work on release', () => {
    const g = new Gesture(); const route = { kind: 'care' as const, eventId: 1, tool: TOOL_BY_ID.food };
    g.begin({ x: 50, y: 50 }, 0, 400, route);
    expect(g.hold(0.03, true)).toEqual({ eventId: 1, work: 0.03 });
    expect(g.hold(0.03, false).work).toBe(0);
    expect(g.hold(5, true).work).toBe(0.1);
    expect(g.hold(NaN, true).work).toBe(0);
    expect(g.hold(-1, true).work).toBe(0);
    expect(g.end({ x: 50, y: 50 }, undefined, true).work).toBe(0);
    expect(g.hold(0.03, true).work).toBe(0);
    g.begin({ x: 50, y: 50 }, 0, 400, route); g.cancel();
    expect(g.hold(0.03, true).work).toBe(0);
  });
  it('only counts movement in the target and clamps teleport jumps', () => {
    const g = new Gesture(); g.begin({ x: 50, y: 50 }, 0, 400, { kind: 'care', eventId: 1, tool: TOOL_BY_ID.brush });
    expect(g.move({ x: 100, y: 50 }, 20, false).work).toBe(0); expect(g.move({ x: 500, y: 50 }, 40, true).work).toBeCloseTo(0.12);
  });
  it('cancels without doing work or changing view', () => {
    const g = new Gesture(); g.begin({ x: 50, y: 50 }, 0, 400, { kind: 'care', eventId: 1, tool: TOOL_BY_ID.food });
    g.cancel(); expect(g.end({ x: 50, y: 50 })).toEqual({ work: 0 });
  });
  it('normalizes cleaning work across viewport sizes', () => {
    const results = [320, 800].map(size => {
      const g = new Gesture(); g.begin({ x: 0, y: 0 }, 0, size, { kind: 'care', eventId: 1, tool: TOOL_BY_ID.mop });
      return g.move({ x: size * 0.1, y: 0 }, 20, true).work;
    });
    expect(results[0]).toBeCloseTo(results[1]);
  });
});
