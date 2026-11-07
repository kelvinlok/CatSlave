import { describe, expect, it } from 'vitest';
import { riseJumpMotion, JUMP_TAKEOFF, JUMP_TOUCHDOWN } from '../src/cat-jump';

describe('room jump motion', () => {
  it('clears an upper ledge early with a bounded ballistic apex', () => {
    for (const rise of [.18, 1.2, 1.62, 2.16]) {
      let highest=0;
      for (let i=0;i<=20;i++) {
        const flight=i/20, p=JUMP_TAKEOFF+flight*(JUMP_TOUCHDOWN-JUMP_TAKEOFF);
        const up=riseJumpMotion(rise,p);
        highest=Math.max(highest,up.height);
        if(rise>=1.2 && flight>=.45 && flight<1) expect(up.height).toBeGreaterThan(rise);
      }
      expect(highest).toBeLessThanOrEqual(rise+.45);
      expect(highest).toBeGreaterThan(rise+.1);
    }
  });
  it('keeps anticipation and recovery planted and launches a high jump with momentum', () => {
    for (const p of [0,.07,JUMP_TAKEOFF]) expect(riseJumpMotion(2.16,p).height).toBe(0);
    for (const p of [JUMP_TOUCHDOWN,.9,1]) expect(riseJumpMotion(2.16,p).height).toBe(2.16);
    const sample=(flight:number)=>riseJumpMotion(2.16,JUMP_TAKEOFF+flight*(JUMP_TOUCHDOWN-JUMP_TAKEOFF)).height;
    expect(sample(.1)-sample(0)).toBeGreaterThan(sample(.6)-sample(.5));
    expect(sample(.9)).toBeGreaterThan(2.16);
    expect(sample(.9)).toBeLessThan(2.61);
  });
});
