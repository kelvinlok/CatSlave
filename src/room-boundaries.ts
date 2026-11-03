import type { FloorPoint } from './types';
import layout from '../assets/lounge/layout.json';

// The entry group follows the widened left wall in lounge-depth-wheel.py.
export const ROOM_ENTRANCE = { x: layout.mainRoom.minX + 3.2, z: layout.mainRoom.maxZ, width: 1.8, height: 3.45 };

interface Position extends FloorPoint { y: number; }
export type FloorArea = 'main-room' | 'whole-room';
interface Volume { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number; }
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Overlapping room volumes exclude the projecting wall recess and inset the doorway. */
function volumes(clearance: number, camera: boolean, area: FloorArea = 'whole-room'): Volume[] {
  const c = clearance, minY = camera ? 0.07 + c : -Infinity, maxY = camera ? layout.bounds.height - 0.15 - c : Infinity;
  const wall = camera ? 0.2 : 0;
  const main = layout.mainRoom, wing = layout.sunroom, opening = layout.opening, recess = layout.blockedFloor;
  const rooms = [
    // The front room is full-width; the rear room ends at the projecting wall face.
    { minX: main.minX + wall + c, maxX: main.maxX - wall - c,
      minZ: recess.maxZ + wall + c, maxZ: main.maxZ - wall - c, minY, maxY },
    { minX: main.minX + wall + c, maxX: recess.minX - wall - c,
      minZ: main.minZ + wall + c, maxZ: main.maxZ - wall - c, minY, maxY },
    { minX: opening.x - wall - c, maxX: opening.x + wall + c,
      minZ: opening.minZ + wall + c, maxZ: opening.maxZ - wall - c,
      minY, maxY: camera ? opening.height - 0.1 - c : Infinity },
    { minX: wing.minX + wall + c, maxX: wing.maxX - wall - c,
      minZ: wing.minZ + wall + c, maxZ: wing.maxZ - wall - c, minY, maxY },
  ];
  return area === 'main-room' ? rooms.slice(0, 2) : rooms;
}
function contains(point: Position, box: Volume) {
  return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY && point.z >= box.minZ && point.z <= box.maxZ;
}
export function roomFloorContains(point: FloorPoint, clearance = 0, area: FloorArea = 'whole-room') {
  return volumes(clearance, false, area).some(box => contains({ ...point, y: 0 }, box));
}

/** Furthest continuous segment coverage in a union; gaps cannot be skipped by a large move. */
function coverage(from: Position, to: Position, boxes: Volume[]) {
  const intervals: [number, number][] = [];
  for (const box of boxes) {
    let enter = 0, leave = 1;
    for (const [axis, min, max] of [['x', box.minX, box.maxX], ['y', box.minY, box.maxY], ['z', box.minZ, box.maxZ]] as const) {
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 1e-12) {
        if (from[axis] < min || from[axis] > max) { leave = -1; break; }
      } else {
        const a = (min - from[axis]) / delta, b = (max - from[axis]) / delta;
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (leave >= enter) intervals.push([enter, leave]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let end = 0;
  for (const [enter, leave] of intervals) {
    if (enter > end + 1e-9) break;
    end = Math.max(end, leave);
  }
  return end;
}
export function roomFloorSegment(from: FloorPoint, to: FloorPoint, clearance = 0, area: FloorArea = 'whole-room') {
  return coverage({ ...from, y: 0 }, { ...to, y: 0 }, volumes(clearance, false, area)) >= 1 - 1e-9;
}
export function clampRoomCamera(point: Position, clearance: number): Position {
  const candidates = volumes(clearance, true).map(box => ({
    x: clamp(point.x, box.minX, box.maxX), y: clamp(point.y, box.minY, box.maxY), z: clamp(point.z, box.minZ, box.maxZ),
  }));
  return candidates.reduce((best, candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y, candidate.z - point.z)
    < Math.hypot(best.x - point.x, best.y - point.y, best.z - point.z) ? candidate : best);
}
export function moveRoomCamera(from: Position, to: Position, clearance: number): Position {
  const t = coverage(from, to, volumes(clearance, true));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
}
