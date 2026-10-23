import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GyroLook } from '../src/gyro';

let target: EventTarget;
let gyro: GyroLook;
beforeEach(() => {
  vi.useFakeTimers(); target = new EventTarget();
  vi.stubGlobal('window', {
    isSecureContext: true,
    DeviceOrientationEvent: { requestPermission: async () => 'granted' },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    setTimeout,
  });
  gyro = new GyroLook(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function sample(beta: number | null, gamma: number | null) {
  target.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma }));
}

it('calibrates to the first valid pose and ignores noise inside the dead zone', async () => {
  await gyro.toggle(); sample(null, 0); sample(NaN, 0); expect(gyro.status).toBe('waiting');
  sample(45, 10); expect(gyro.status).toBe('on'); expect(gyro.step(0.1, true)).toEqual({ x: 0, y: 0 });
  sample(48, 13); expect(gyro.step(0.1, true)).toEqual({ x: 0, y: 0 });
  sample(45, 35); expect(gyro.step(0.1, true).x).toBeGreaterThan(0);
  gyro.step(0.1, false); expect(gyro.step(0.1, true)).toEqual({ x: 0, y: 0 });
});

it('handles angle wrapping and recalibration without a sudden full-speed turn', async () => {
  await gyro.toggle(); sample(179, 0); sample(-179, 0);
  expect(gyro.step(0.1, true).y).toBe(0);
  sample(-150, 0); expect(gyro.step(0.1, true).y).toBeGreaterThan(0);
  gyro.recenter(); expect(gyro.step(0.1, true).y).toBe(0);
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
