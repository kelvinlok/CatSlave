/** Shared timing keeps anticipation and landing poses on their support surface. */
export const JUMP_DURATION = 0.96;
export const JUMP_TAKEOFF = 0.14;
export const JUMP_TOUCHDOWN = 0.82;

export function jumpFlightProgress(progress: number) {
  return Math.max(0, Math.min(1, (progress - JUMP_TAKEOFF) / (JUMP_TOUCHDOWN - JUMP_TAKEOFF)));
}

/** A small outward push followed by gravity, with time reserved for crouch/landing. */
export function dropJumpMotion(drop: number, progress: number) {
  const gravity = 9.8, push = 1.35;
  const flightSeconds = (push + Math.sqrt(push * push + 2 * gravity * drop)) / gravity;
  const flight = jumpFlightProgress(progress), seconds = flight * flightSeconds;
  return { flight, duration: flightSeconds / (JUMP_TOUCHDOWN - JUMP_TAKEOFF),
    height: flight === 1 ? -drop : push * seconds - .5 * gravity * seconds * seconds };
}

/** A stronger upward push clears the destination's front edge before touchdown. */
export function riseJumpMotion(rise: number, progress: number) {
  const flight = jumpFlightProgress(progress);
  const apex = Math.min(.45, .12 + rise * .16), gravity = 9.8;
  const push = Math.sqrt(2 * gravity * (rise + apex));
  const flightSeconds = (push + Math.sqrt(2 * gravity * apex)) / gravity;
  const seconds = flight * flightSeconds;
  return { flight, duration: flightSeconds / (JUMP_TOUCHDOWN - JUMP_TAKEOFF),
    height: flight === 0 ? 0 : flight === 1 ? rise : push * seconds - .5 * gravity * seconds * seconds };
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
