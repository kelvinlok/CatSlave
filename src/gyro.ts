/** Optional tilt-to-look. Sensor permission is requested only from the Gyro button. */
export class GyroLook {
  status: 'off' | 'waiting' | 'on' | 'denied' | 'unavailable' = 'off';
  private origin?: { beta: number; gamma: number };
  private latest?: { beta: number; gamma: number };
  private velocity = { x: 0, y: 0 };
  private timer?: number;
  private lastSample = 0;
  private request = 0;
  constructor(private changed: () => void) {}
  private receive = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    this.latest = { beta: event.beta, gamma: event.gamma }; this.lastSample = performance.now();
    this.origin ??= this.latest;
    if (this.status === 'waiting') { clearTimeout(this.timer); this.status = 'on'; this.changed(); }
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
  recenter() { this.origin = undefined; this.velocity = { x: 0, y: 0 }; }
  step(dt: number, active: boolean) {
    if (!active || this.status !== 'on' || !this.latest || performance.now() - this.lastSample > 500) {
      this.origin = this.latest; this.velocity = { x: 0, y: 0 }; return this.velocity;
    }
    this.origin ??= this.latest;
    const speed = (angle: number) => {
      const delta = ((angle + 540) % 360) - 180;
      return Math.sign(delta) * Math.min(1, Math.max(0, Math.abs(delta) - 4) / 20) * 180;
    };
    const blend = 1 - Math.exp(-dt * 10);
    this.velocity.x += (speed(this.latest.gamma - this.origin.gamma) - this.velocity.x) * blend;
    this.velocity.y += (speed(this.latest.beta - this.origin.beta) - this.velocity.y) * blend;
    return { x: this.velocity.x * dt, y: this.velocity.y * dt };
  }
}
