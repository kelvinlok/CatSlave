import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GyroLook } from '../src/gyro';
import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

let target: EventTarget;
let gyro: GyroLook;
let currentView: Quaternion;
beforeEach(() => {
  vi.useFakeTimers(); target = new EventTarget();
  vi.stubGlobal('window', {
    isSecureContext: true,
    DeviceOrientationEvent: { requestPermission: async () => 'granted' },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    setTimeout,
  });
  currentView = new Quaternion();
  gyro = new GyroLook(() => {}, () => currentView);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function sample(beta: number | null, gamma: number | null, alpha: number | null = 0) {
  target.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha, beta, gamma }));
}

function expectPose(actual: Quaternion | undefined, expected: Quaternion) {
  expect(actual).toBeDefined();
  expect(Math.abs(actual!.dot(expected))).toBeCloseTo(1, 10);
}

it('tracks phone heading one-to-one, holds still, and returns to the starting view', async () => {
  await gyro.toggle(); sample(null, 0); sample(NaN, 0); expect(gyro.status).toBe('waiting');
  sample(90, 0, null); expect(gyro.status).toBe('waiting');
  const original = new Quaternion().setFromEuler(new Euler(-0.17, 0, 0, 'YXZ'));
  currentView.copy(original);
  sample(90, 0); expect(gyro.status).toBe('on'); expectPose(gyro.step(original, true), original);
  sample(90, 0, 120);
  const turned = original.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(120)));
  expectPose(gyro.step(original, true), turned);
  for (let i = 0; i < 300; i++) { sample(90, 0, 120); expectPose(gyro.step(turned, true), turned); }
  sample(90, 0); expectPose(gyro.step(turned, true), original);
});

it('anchors the first reading even when the phone moves before the next rendered frame', async () => {
  await gyro.toggle(); sample(90, 0); sample(90, 0, 30);
  expectPose(gyro.step(currentView, true), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 6));
});

it('looks up and rolls with the phone without limiting the viewing direction', async () => {
  const original = new Quaternion(); await gyro.toggle(); sample(90, 0); gyro.step(original, true);
  sample(150, 0);
  expectPose(gyro.step(original, true), new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 3));
  // With the phone flat, changing alpha rotates about the viewing axis (roll).
  sample(0, 0); gyro.recenter(); gyro.step(original, true);
  sample(0, 0, 30);
  expectPose(gyro.step(original, true), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 6));
});

it('crosses heading wrap smoothly and Reset anchors the current phone pose to the new gaze', async () => {
  const original = new Quaternion(); await gyro.toggle(); sample(90, 0, 359); gyro.step(original, true);
  sample(90, 0, 1);
  expectPose(gyro.step(original, true), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(2)));
  const reset = new Quaternion().setFromEuler(new Euler(-0.17, 0, 0, 'YXZ'));
  gyro.recenter(reset);
  sample(90, 0, 31);
  expectPose(gyro.step(reset, true), reset.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 6)));
});

it('freezes during touch, pause and stale data without losing the original reference', async () => {
  const original = new Quaternion(); await gyro.toggle(); sample(90, 0); gyro.step(original, true);
  sample(90, 0, 45); expect(gyro.step(original, false)).toBeUndefined();
  const turned = gyro.step(original, true)!.clone();
  vi.spyOn(performance, 'now').mockReturnValue(performance.now() + 1000);
  expect(gyro.step(turned, true)).toBeUndefined();
  sample(90, 0); expectPose(gyro.step(turned, true), original);
  vi.restoreAllMocks();
});

it('compensates for screen rotation so landscape and portrait agree on forward', async () => {
  const original = new Quaternion(); await gyro.toggle(); sample(90, 0); gyro.step(original, true);
  Object.assign(window, { screen: { orientation: { angle: 90 } } });
  // Same physical forward ray, phone rotated to landscape.
  sample(0, -90, 90); expectPose(gyro.step(original, true), original);
});

it('stops listening when disabled and handles missing sensor data', async () => {
  await gyro.toggle(); await gyro.toggle(); sample(45, 0); expect(gyro.status).toBe('off');
  await gyro.toggle(); await vi.advanceTimersByTimeAsync(5000); expect(gyro.status).toBe('unavailable');
  sample(45, 0); expect(gyro.status).toBe('unavailable');
});

it('does not request permission on insecure origins', async () => {
  Object.assign(window, { isSecureContext: false });
  const request = vi.spyOn(window.DeviceOrientationEvent as unknown as { requestPermission(): Promise<string> }, 'requestPermission');
  await gyro.toggle(); expect(gyro.status).toBe('unavailable'); expect(request).not.toHaveBeenCalled();
});

it('ignores an old permission response after the player toggles off and retries', async () => {
  let resolveOld!: (value: string) => void;
  let resolveNew!: (value: string) => void;
  const request = vi.fn().mockImplementationOnce(() => new Promise<string>(resolve => { resolveOld = resolve; }))
    .mockImplementationOnce(() => new Promise<string>(resolve => { resolveNew = resolve; }));
  Object.assign(window.DeviceOrientationEvent, { requestPermission: request });
  const old = gyro.toggle(); await gyro.toggle(); const current = gyro.toggle();
  resolveOld('denied'); await old; expect(gyro.status).toBe('waiting');
  resolveNew('granted'); await current; sample(45, 0); expect(gyro.status).toBe('on');
});
