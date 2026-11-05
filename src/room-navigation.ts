import layout from '../assets/lounge/layout.json';
import type { CatState, FloorPoint } from './types';
import { roomFloorContains, roomFloorSegment, type FloorArea } from './room-boundaries';

export interface FloorBox { minX: number; maxX: number; minZ: number; maxZ: number; }
export const CAT_CLEARANCE = 0.22;
export interface NavigationContext {
  obstacles: readonly FloorBox[];
  corners: FloorPoint[];
  contains: typeof roomFloorContains;
  segment: typeof roomFloorSegment;
  cornerEdges: Map<FloorArea, Float64Array>;
}
const within = (p: FloorPoint, box: FloorBox) => p.x > box.minX && p.x < box.maxX && p.z > box.minZ && p.z < box.maxZ;
export function createNavigationContext(boxes: readonly FloorBox[], contains = roomFloorContains, segment = roomFloorSegment): NavigationContext {
  const obstacles = boxes.map(box => ({ minX: box.minX - CAT_CLEARANCE, maxX: box.maxX + CAT_CLEARANCE,
    minZ: box.minZ - CAT_CLEARANCE, maxZ: box.maxZ + CAT_CLEARANCE }));
  const context: NavigationContext = { obstacles, corners: [], contains, segment, cornerEdges: new Map() };
  context.corners = obstacles.flatMap(box => [
    { x: box.minX - .015, z: box.minZ - .015 }, { x: box.minX - .015, z: box.maxZ + .015 },
    { x: box.maxX + .015, z: box.minZ - .015 }, { x: box.maxX + .015, z: box.maxZ + .015 },
  ]).filter(point => clearFloor(point, 'whole-room', context));
  return context;
}
export const defaultNavigation = createNavigationContext([...layout.obstacles, ...layout.structuralWalls]);
export function clearFloor(point: FloorPoint, area: FloorArea = 'whole-room', context: NavigationContext = defaultNavigation) {
  return context.contains(point, CAT_CLEARANCE, area) && context.obstacles.every(box => !within(point, box));
}
export function segmentAvoidsBox(a: FloorPoint, b: FloorPoint, box: FloorBox) {
  let enter = 0, leave = 1;
  for (const axis of ['x', 'z'] as const) {
    const delta = b[axis] - a[axis], min = axis === 'x' ? box.minX : box.minZ, max = axis === 'x' ? box.maxX : box.maxZ;
    if (Math.abs(delta) < 1e-9) { if (a[axis] <= min || a[axis] >= max) return true; }
    else {
      const near = (min - a[axis]) / delta, far = (max - a[axis]) / delta;
      enter = Math.max(enter, Math.min(near, far)); leave = Math.min(leave, Math.max(near, far));
      if (enter >= leave) return true;
    }
  }
  return leave <= 0 || enter >= 1;
}
export function clearFloorSegment(a: FloorPoint, b: FloorPoint, area: FloorArea = 'whole-room', context: NavigationContext = defaultNavigation) {
  return context.segment(a, b, CAT_CLEARANCE, area) && context.obstacles.every(box => segmentAvoidsBox(a, b, box));
}

/** Keep a new floor mess beside the cat, on the same clear side of nearby furniture. */
export function nearbyFloorTarget(origin: FloorPoint, preferred: FloorPoint, area: FloorArea = 'whole-room', context: NavigationContext = defaultNavigation): FloorPoint {
  if (clearFloor(preferred, area, context) && clearFloorSegment(origin, preferred, area, context)) return preferred;
  const angle = Math.atan2(preferred.z - origin.z, preferred.x - origin.x);
  for (const radius of [0.63, 0.42, 0.22]) {
    for (let step = 1; step <= 16; step++) {
      const a = angle + Math.ceil(step / 2) * (step % 2 ? 1 : -1) * Math.PI / 8;
      const point = { x: origin.x + Math.cos(a) * radius, z: origin.z + Math.sin(a) * radius };
      if (clearFloor(point, area, context) && clearFloorSegment(origin, point, area, context)) return point;
    }
  }
  return { ...origin };
}
const distance = (a: FloorPoint, b: FloorPoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** Visibility graph around the furniture footprints; the final perch approach is authored separately. */
export function floorRoute(from: FloorPoint, to: FloorPoint, area: FloorArea = 'whole-room', context: NavigationContext = defaultNavigation): FloorPoint[] {
  if (!clearFloor(to, area, context)) return [];
  if (clearFloorSegment(from, to, area, context)) return [{ ...to }];
  const nodes = [from, ...context.corners, to], costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  const size = context.corners.length;
  let edges = context.cornerEdges.get(area);
  if (!edges) { edges = new Float64Array(size * size).fill(NaN); context.cornerEdges.set(area, edges); }
  const edge = (a: number, b: number) => {
    if (a > 0 && a <= size && b > 0 && b <= size) {
      const index = (a - 1) * size + b - 1;
      if (Number.isNaN(edges![index])) {
        const value = clearFloorSegment(nodes[a], nodes[b], area, context) ? distance(nodes[a], nodes[b]) : Infinity;
        edges![index] = value; edges![(b - 1) * size + a - 1] = value;
      }
      return edges![index];
    }
    return clearFloorSegment(nodes[a], nodes[b], area, context) ? distance(nodes[a], nodes[b]) : Infinity;
  };
  costs[0] = 0;
  while (visited.size < nodes.length) {
    let next = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (next < 0 || costs[i] < costs[next])) next = i;
    if (next < 0 || !Number.isFinite(costs[next])) return [];
    if (next === nodes.length - 1) break;
    visited.add(next);
    for (let i = 1; i < nodes.length; i++) {
      if (visited.has(i)) continue;
      const cost = costs[next] + edge(next, i);
      if (cost < costs[i]) { costs[i] = cost; previous[i] = next; }
    }
  }
  const route: FloorPoint[] = [];
  for (let i = nodes.length - 1; i > 0; i = previous[i]) {
    if (previous[i] < 0) return [];
    route.unshift({ ...nodes[i] });
  }
  return route;
}

/** Incrementally flood the visibility graph once when checking many destinations. */
export function createFloorReachability(origin: FloorPoint, area: FloorArea = 'whole-room', context: NavigationContext = defaultNavigation) {
  const reachable = [origin], unseen = new Set(context.corners.map((_, i) => i));
  let expanded = 0;
  const validOrigin = clearFloor(origin, area, context);
  return (target: FloorPoint): boolean => {
    if (!validOrigin || !clearFloor(target, area, context)) return false;
    if (reachable.some(point => clearFloorSegment(point, target, area, context))) return true;
    while (expanded < reachable.length) {
      const source = reachable[expanded++], before = reachable.length;
      for (const i of unseen) {
        const corner = context.corners[i];
        if (clearFloorSegment(source, corner, area, context)) { unseen.delete(i); reachable.push(corner); }
      }
      for (let i = before; i < reachable.length; i++) if (clearFloorSegment(reachable[i], target, area, context)) return true;
    }
    return false;
  };
}

const routes = new WeakMap<CatState, { target: FloorPoint; points: FloorPoint[]; area: FloorArea; context: NavigationContext }>();
export function nextFloorWaypoint(cat: CatState, target: FloorPoint, area: FloorArea = 'whole-room', context: NavigationContext = defaultNavigation): FloorPoint | undefined {
  let route = routes.get(cat);
  if (!route || route.context !== context || route.area !== area || distance(route.target, target) > 0.001) {
    route = { target: { ...target }, points: floorRoute(cat.position, target, area, context), area, context }; routes.set(cat, route);
  }
  while (route.points.length > 1 && distance(cat.position, route.points[0]) < 0.04) route.points.shift();
  if (route.points[0] && !clearFloorSegment(cat.position, route.points[0], area, context)) route.points = floorRoute(cat.position, target, area, context);
  return route.points[0];
}
