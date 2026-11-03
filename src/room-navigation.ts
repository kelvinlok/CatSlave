import layout from '../assets/lounge/layout.json';
import type { CatState, FloorPoint } from './types';
import { roomFloorContains, roomFloorSegment, type FloorArea } from './room-boundaries';

const clearance = 0.22;
const obstacles = [...layout.obstacles, ...layout.structuralWalls].map(box => ({
  minX: box.minX - clearance, maxX: box.maxX + clearance,
  minZ: box.minZ - clearance, maxZ: box.maxZ + clearance,
}));
const within = (p: FloorPoint, box: typeof obstacles[number]) => p.x > box.minX && p.x < box.maxX && p.z > box.minZ && p.z < box.maxZ;
export function clearFloor(point: FloorPoint, area: FloorArea = 'whole-room') {
  return roomFloorContains(point, clearance, area)
    && obstacles.every(box => !within(point, box));
}
export function clearFloorSegment(a: FloorPoint, b: FloorPoint, area: FloorArea = 'whole-room') {
  return roomFloorSegment(a, b, clearance, area) && obstacles.every(box => {
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
  });
}

/** Keep a new floor mess beside the cat, on the same clear side of nearby furniture. */
export function nearbyFloorTarget(origin: FloorPoint, preferred: FloorPoint, area: FloorArea = 'whole-room'): FloorPoint {
  if (clearFloor(preferred, area) && clearFloorSegment(origin, preferred, area)) return preferred;
  const angle = Math.atan2(preferred.z - origin.z, preferred.x - origin.x);
  for (const radius of [0.63, 0.42, 0.22]) {
    for (let step = 1; step <= 16; step++) {
      const a = angle + Math.ceil(step / 2) * (step % 2 ? 1 : -1) * Math.PI / 8;
      const point = { x: origin.x + Math.cos(a) * radius, z: origin.z + Math.sin(a) * radius };
      if (clearFloor(point, area) && clearFloorSegment(origin, point, area)) return point;
    }
  }
  return { ...origin };
}
const corners = obstacles.flatMap(box => [
  { x: box.minX - 0.015, z: box.minZ - 0.015 }, { x: box.minX - 0.015, z: box.maxZ + 0.015 },
  { x: box.maxX + 0.015, z: box.minZ - 0.015 }, { x: box.maxX + 0.015, z: box.maxZ + 0.015 },
]).filter(point => clearFloor(point));
const distance = (a: FloorPoint, b: FloorPoint) => Math.hypot(a.x - b.x, a.z - b.z);

/** Visibility graph around the furniture footprints; the final perch approach is authored separately. */
export function floorRoute(from: FloorPoint, to: FloorPoint, area: FloorArea = 'whole-room'): FloorPoint[] {
  if (!clearFloor(to, area)) return [];
  if (clearFloorSegment(from, to, area)) return [{ ...to }];
  const nodes = [from, ...corners, to], costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), visited = new Set<number>();
  costs[0] = 0;
  while (visited.size < nodes.length) {
    let next = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (next < 0 || costs[i] < costs[next])) next = i;
    if (next < 0 || !Number.isFinite(costs[next])) return [];
    if (next === nodes.length - 1) break;
    visited.add(next);
    for (let i = 1; i < nodes.length; i++) {
      if (visited.has(i) || !clearFloorSegment(nodes[next], nodes[i], area)) continue;
      const cost = costs[next] + distance(nodes[next], nodes[i]);
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

const routes = new WeakMap<CatState, { target: FloorPoint; points: FloorPoint[]; area: FloorArea }>();
export function nextFloorWaypoint(cat: CatState, target: FloorPoint, area: FloorArea = 'whole-room'): FloorPoint | undefined {
  let route = routes.get(cat);
  if (!route || route.area !== area || distance(route.target, target) > 0.001) {
    route = { target: { ...target }, points: floorRoute(cat.position, target, area), area }; routes.set(cat, route);
  }
  while (route.points.length > 1 && distance(cat.position, route.points[0]) < 0.04) route.points.shift();
  if (route.points[0] && !clearFloorSegment(cat.position, route.points[0], area)) {
    route.points = floorRoute(cat.position, target, area);
  }
  return route.points[0];
}
