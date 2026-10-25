/** Shared timing keeps anticipation and landing poses on their support surface. */
export const JUMP_DURATION = 0.96;
export const JUMP_TAKEOFF = 0.14;
export const JUMP_TOUCHDOWN = 0.82;

export function jumpFlightProgress(progress: number) {
  return Math.max(0, Math.min(1, (progress - JUMP_TAKEOFF) / (JUMP_TOUCHDOWN - JUMP_TAKEOFF)));
}

/** Smooth authored poses with no per-frame accumulation or random timing. */
export function jumpCurve(progress: number, keys: readonly (readonly [number, number])[]) {
  if (progress <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [end, value] = keys[i], [start, previous] = keys[i - 1];
    if (progress <= end) {
      const t = (progress - start) / (end - start);
      return previous + (value - previous) * t * t * (3 - 2 * t);
    }
  }
  return keys[keys.length - 1][1];
}
