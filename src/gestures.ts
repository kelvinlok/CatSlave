import type { Point, ToolDefinition } from './types';

export type GestureRoute = { kind: 'ui'; id: string } | { kind: 'care'; eventId: number; tool: ToolDefinition } | { kind: 'empty' };
export interface GestureResult { work: number; click?: string; eventId?: number; }
const empty = (): GestureResult => ({ work: 0 });

/** Pure gesture recognizer. The start route is immutable until release/cancel. */
export class Gesture {
  private start?: Point;
  private previous?: Point;
  private lastTime = 0;
  private distance = 0;
  private dragTime = 0;
  private travel = 0;
  private shortEdge = 1;
  route?: GestureRoute;
  begin(point: Point, time: number, shortEdge: number, route: GestureRoute) {
    this.start = point; this.previous = point; this.lastTime = time;
    this.distance = 0; this.dragTime = 0; this.travel = 0;
    this.shortEdge = Math.max(1, shortEdge); this.route = route;
  }
  move(point: Point, time: number, inTarget: boolean): GestureResult {
    const result = empty();
    if (!this.previous || !this.route) return result;
    const dx = point.x - this.previous.x, dy = point.y - this.previous.y;
    const distance = Math.hypot(dx, dy);
    const seconds = Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000));
    this.travel += distance;
    const route = this.route;
    if (route.kind === 'care' && inTarget && distance >= 0.5) {
      result.eventId = route.eventId;
      if (route.tool.gesture === 'sweep' || route.tool.gesture === 'rub') {
        // Clamp discontinuous pointer jumps; no free progress by leaving/re-entering.
        this.distance += Math.min(distance, this.shortEdge * 0.12) / this.shortEdge;
        result.work = this.distance; this.distance = 0;
      } else if (route.tool.gesture === 'drag') {
        this.dragTime += seconds;
        result.work = this.dragTime; this.dragTime = 0;
      }
    }
    this.previous = point; this.lastTime = time; return result;
  }
  end(point: Point, targetId?: string, inTarget = true): GestureResult {
    const result = empty();
    if (!this.start || !this.route) return result;
    const route = this.route;
    if (route.kind === 'ui' && route.id === targetId && this.travel < 18) result.click = route.id;
    else if (route.kind === 'care' && route.tool.gesture === 'tap' && this.travel < 18 && inTarget) { result.eventId = route.eventId; result.work = 1; }
    this.cancel(); return result;
  }
  cancel() { this.route = undefined; this.start = undefined; this.previous = undefined; }
}
