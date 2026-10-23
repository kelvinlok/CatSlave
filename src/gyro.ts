import { Euler, MathUtils, Quaternion, Vector3 } from 'three';

/** Optional phone-as-viewpoint tracking. Permission is requested only from the Gyro button. */
export class GyroLook {
  status: 'off' | 'waiting' | 'on' | 'denied' | 'unavailable' = 'off';
  private alignment?: Quaternion;
  private latest?: { alpha: number; beta: number; gamma: number };
  private euler = new Euler(0, 0, 0, 'YXZ');
  private phone = new Quaternion();
  private screenRotation = new Quaternion();
  private screenAxis = new Vector3(0, 0, 1);
  private backOfPhone = new Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2);
  private gaze = new Quaternion();
  private timer?: number;
  private lastSample = 0;
  private request = 0;
  constructor(private changed: () => void, private currentView: () => Quaternion) {}
  private receive = (event: DeviceOrientationEvent) => {
    if (![event.alpha, event.beta, event.gamma].every(value => typeof value === 'number' && Number.isFinite(value))) return;
    this.latest = { alpha: event.alpha!, beta: event.beta!, gamma: event.gamma! }; this.lastSample = performance.now();
    if (this.status === 'waiting') {
      clearTimeout(this.timer); this.status = 'on';
      // The first reading is neutral even if several readings precede the next frame.
      this.recenter(this.currentView()); this.changed();
    } else if (!this.alignment) this.step(this.currentView(), true);
  };
  async toggle() {
    if (this.status === 'on' || this.status === 'waiting') { this.stop('off'); return; }
    const sensor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    if (!window.isSecureContext || !sensor) { this.stop('unavailable'); return; }
    this.status = 'waiting'; this.changed();
    const request = ++this.request;
    try {
      // Call synchronously within the user gesture, before awaiting the result.
      const permission = sensor.requestPermission ? await sensor.requestPermission() : 'granted';
      if (request !== this.request || this.status !== 'waiting') return;
      if (permission !== 'granted') { this.stop('denied'); return; }
      this.recenter();
      window.addEventListener('deviceorientation', this.receive);
      this.timer = window.setTimeout(() => this.stop('unavailable'), 5000);
    } catch { if (request === this.request) this.stop('denied'); }
  }
  private stop(status: typeof this.status) {
    this.request++;
    window.removeEventListener('deviceorientation', this.receive); clearTimeout(this.timer);
    this.status = status; this.latest = undefined; this.recenter(); this.changed();
  }
  recenter(current?: Quaternion) {
    this.alignment = undefined;
    // Anchor button/swipe actions immediately, before a newer sensor sample arrives.
    if (current) this.step(current, true);
  }
  step(current: Quaternion, active: boolean): Quaternion | undefined {
    if (!active || this.status !== 'on' || !this.latest || performance.now() - this.lastSample > 500) return;
    const { alpha, beta, gamma } = this.latest;
    // Device Z-X'-Y'' angles become a camera looking out through the phone's back.
    this.euler.set(MathUtils.degToRad(beta), MathUtils.degToRad(alpha), -MathUtils.degToRad(gamma), 'YXZ');
    const screenAngle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
    this.phone.setFromEuler(this.euler).multiply(this.backOfPhone)
      .multiply(this.screenRotation.setFromAxisAngle(this.screenAxis, -MathUtils.degToRad(screenAngle)));
    // Keep this reference through pauses and missing samples: never integrate tilt or
    // silently redefine neutral, so returning the phone also returns the same gaze.
    this.alignment ??= current.clone().multiply(this.phone.clone().invert());
    return this.gaze.copy(this.alignment).multiply(this.phone).normalize();
  }
}
