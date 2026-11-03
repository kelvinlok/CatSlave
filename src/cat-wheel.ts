import { WHEEL } from './furniture';
import type { CatState } from './types';

export { WHEEL } from './furniture';
export const WHEEL_RUN_SPEED = 1.25;
export const WHEEL_ACCELERATION = 1.4;
export const WHEEL_BRAKING = 2;
export const WHEEL_STOP_TIME = WHEEL_RUN_SPEED / WHEEL_BRAKING;

/** Exact constant-acceleration distance, shared by the paws and the drum. */
export function advanceWheelRun(cat: CatState, dt: number, stopping: boolean) {
  if (!(dt > 0) || !Number.isFinite(dt)) return 0;
  const oldSpeed = cat.wheelRunSpeed ?? 0;
  const target = stopping ? 0 : WHEEL_RUN_SPEED;
  const acceleration = stopping ? WHEEL_BRAKING : WHEEL_ACCELERATION;
  const changeTime = Math.min(dt, Math.abs(target - oldSpeed) / acceleration);
  const nextSpeed = oldSpeed + Math.sign(target - oldSpeed) * acceleration * changeTime;
  cat.wheelRunSpeed = Math.abs(nextSpeed - target) < 1e-9 ? target : nextSpeed;
  const distance = (oldSpeed + cat.wheelRunSpeed) * .5 * changeTime + cat.wheelRunSpeed * (dt - changeTime);
  cat.stride += distance * 10;
  return distance;
}

/** Height above the drum's lowest inner point at a world-space forward offset. */
export function wheelTreadRise(forward: number) {
  const offset = Math.max(-WHEEL.innerRadius * .95, Math.min(WHEEL.innerRadius * .95, forward));
  return WHEEL.innerRadius - Math.sqrt(WHEEL.innerRadius ** 2 - offset ** 2);
}
