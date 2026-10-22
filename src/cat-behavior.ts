import { AISLE_Z, FURNITURE, type Waypoint } from './furniture';
import type { CatState } from './types';
import { ROOM } from './config';

export function beginVisit(cat: CatState, id: string, cats: CatState[]) {
  const spot = FURNITURE.find(s => s.id === id);
  if (!spot || cat.visit || cats.some(c => c.visit?.id === id)) return false;
  const first = spot.route[0];
  const route: Waypoint[] = spot.route.length > 1 && first.z < -5 ? [
    { x: cat.position.x, z: AISLE_Z, height: 0 },
    { x: first.x, z: AISLE_Z, height: 0 },
    ...spot.route.map(p => ({ ...p })),
  ] : spot.route.map(p => ({ ...p }));
  cat.visit = { id, phase: 'approach', route, index: 0, progress: 0,
    from: { ...cat.position, height: cat.elevation }, until: 0, leaveRequested: false };
  return true;
}

export function tickVisit(cat: CatState, clock: number, dt: number, cats: readonly CatState[]) {
  const visit = cat.visit!, spot = FURNITURE.find(s => s.id === visit.id)!;
  const turnToward = (yaw: number) => {
    const delta = Math.atan2(Math.sin(yaw - cat.yaw), Math.cos(yaw - cat.yaw));
    cat.yaw += delta * Math.min(1, dt * 7); return delta;
  };
  if (visit.phase === 'use') {
    cat.activity = spot.activity; turnToward(spot.yaw);
    if (clock < visit.until && (!visit.leaveRequested || clock < visit.until - spot.duration + 1)) return;
    visit.phase = 'leave'; visit.route = [...visit.route].reverse().slice(1);
    visit.index = 0; visit.progress = 0; visit.from = { ...cat.position, height: cat.elevation };
  }
  const target = visit.route[visit.index];
  if (!target) {
    if (visit.phase === 'approach') {
      visit.phase = 'use'; visit.until = clock + spot.duration;
      cat.activity = spot.activity;
    } else {
      cat.visit = undefined; cat.lastFurniture = spot.id; cat.elevation = 0;
      cat.activity = 'idle'; cat.pose = 0; cat.decisionAt = clock + 1.2;
    }
    return;
  }
  const from = visit.from, dx = target.x - from.x, dz = target.z - from.z;
  const distance = Math.hypot(dx, dz), jump = Math.abs(target.height - from.height) > 0.1;
  const crawl = !jump && (target.crawl || from.crawl);
  // Back out through the same opening; do not turn through the box's walls.
  const yaw = crawl ? Math.PI : distance > 0.001 ? Math.atan2(dx, dz) : cat.yaw;
  const turn = turnToward(yaw);
  cat.activity = jump ? 'jumping' : crawl ? 'crawling' : 'walking';
  if (visit.progress === 0 && Math.abs(turn) > 0.25) { cat.activity = crawl ? 'crawling' : 'idle'; return; }
  const duration = jump ? 0.75 : Math.max(0.05, distance / (crawl ? 0.48 : 1.1));
  const previous = visit.progress;
  const p = Math.min(1, visit.progress + dt / duration), smooth = jump ? p * p * (3 - 2 * p) : p;
  const next = { x: from.x + dx * smooth, z: from.z + dz * smooth };
  const blocker = !jump && from.height === 0 && cats.find(other => other !== cat && other.elevation < 0.3 &&
    Math.hypot(other.position.x - next.x, other.position.z - next.z) < 0.55 &&
    Math.hypot(other.position.x - next.x, other.position.z - next.z) < Math.hypot(other.position.x - cat.position.x, other.position.z - cat.position.z));
  if (blocker) {
    cat.activity = 'idle';
    // Detour only on the open floor; doorways and landing points remain exact.
    if (cat.position.z >= ROOM.minZ && target.z >= ROOM.minZ && distance > 0.7) {
      const candidates = [-1, 1].map(side => ({
        x: blocker.position.x + side * dz / distance * 0.85,
        z: blocker.position.z - side * dx / distance * 0.85, height: 0,
      }));
      const detour = candidates.find(point => point.x >= ROOM.minX && point.x <= ROOM.maxX && point.z >= ROOM.minZ && point.z <= ROOM.maxZ &&
        cats.every(other => other === cat || other.elevation > 0.3 || Math.hypot(point.x - other.position.x, point.z - other.position.z) > 0.7));
      if (detour) { visit.route.splice(visit.index, 0, detour); visit.from = { ...cat.position, height: 0 }; visit.progress = 0; }
    }
    return;
  }
  visit.progress = p;
  cat.position.x = next.x; cat.position.z = next.z;
  cat.elevation = from.height + (target.height - from.height) * smooth + (jump ? Math.sin(p * Math.PI) * 0.28 : 0);
  cat.pose = p; cat.stride += (p - previous) * distance * 10;
  if (p === 1) { visit.index++; visit.progress = 0; visit.from = { ...target }; }
}
