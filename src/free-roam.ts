import { ROOM } from './config';
import type { CatState, FloorPoint } from './types';

export const freeBowlPosition = (index: number, count: number): FloorPoint => ({ x: (index - (count - 1) / 2) * 0.8, z: -5.8 });
interface Routine { kind: 'meal' | 'social'; target: FloorPoint; partner?: number; until?: number; expires: number; }
interface Schedule { meal: number; social: number; }
interface RandomSource { between(min: number, max: number): number; }

/** Quiet, optional room routines. These never create needs or consume food. */
export class FreeRoam {
  private routines = new Map<number, Routine>();
  private schedule = new Map<number, Schedule>();
  reset(cats: CatState[], clock: number) {
    this.routines.clear(); this.schedule.clear();
    cats.forEach((cat, i) => this.schedule.set(cat.id, { meal: clock + 18 + i * 11, social: clock + 10 + i * 6 }));
  }
  playmate(id: number) { const task = this.routines.get(id); return task?.kind === 'social' && task.until !== undefined ? task.partner : undefined; }
  busy(id: number) { return this.routines.has(id); }
  cancel(id: number, cats: CatState[], clock: number) {
    const task = this.routines.get(id);
    if (!task) return;
    this.routines.delete(id);
    const cat = cats.find(c => c.id === id);
    if (cat) { cat.activity = 'idle'; cat.destination = { ...cat.position }; cat.decisionAt = clock + 8; }
    if (task.partner !== undefined && this.routines.get(task.partner)?.partner === id) this.cancel(task.partner, cats, clock);
  }
  update(cats: CatState[], clock: number, dt: number, random: RandomSource) {
    const available = (cat: CatState, invitation = false) => !cat.visit && !this.busy(cat.id) && cat.elevation === 0
      && (cat.activity === 'idle' || cat.activity === 'sniffing') && clock >= cat.decisionAt - (invitation ? 3 : 0);
    for (const [i, cat] of cats.entries()) {
      const schedule = this.schedule.get(cat.id);
      if (!schedule || !available(cat)) continue;
      if (clock >= schedule.meal) {
        const bowl = freeBowlPosition(i, cats.length);
        this.routines.set(cat.id, { kind: 'meal', target: { x: bowl.x, z: bowl.z + 0.55 }, expires: clock + 50 });
        schedule.meal = clock + random.between(65, 100);
      } else if (clock >= schedule.social) {
        const friend = cats.find(other => other !== cat && available(other, true) && clock >= (this.schedule.get(other.id)?.social ?? Infinity)
          && Math.hypot(cat.position.x - other.position.x, cat.position.z - other.position.z) < 4);
        if (!friend) continue;
        const dx = friend.position.x - cat.position.x, dz = friend.position.z - cat.position.z, length = Math.hypot(dx, dz) || 1;
        const center = { x: (cat.position.x + friend.position.x) / 2, z: (cat.position.z + friend.position.z) / 2 };
        for (const [participant, partner, side] of [[cat, friend, -1], [friend, cat, 1]] as const) {
          this.routines.set(participant.id, { kind: 'social', partner: partner.id,
            target: { x: center.x + side * dx / length * 0.48, z: center.z + side * dz / length * 0.48 }, expires: clock + 25 });
          this.schedule.get(participant.id)!.social = clock + random.between(45, 75);
        }
      }
    }
    for (const cat of cats) {
      const task = this.routines.get(cat.id);
      if (!task) continue;
      if (clock >= task.expires || task.until !== undefined && clock >= task.until) { this.cancel(cat.id, cats, clock); continue; }
      cat.stretchStartedAt = undefined; cat.pose = 0;
      const dx = task.target.x - cat.position.x, dz = task.target.z - cat.position.z;
      if (Math.hypot(dx, dz) > 0.035) {
        cat.activity = 'walking'; cat.destination = { ...task.target };
        this.walk(cat, cats, dt);
        continue;
      }
      cat.activity = 'idle';
      const partner = cats.find(other => other.id === task.partner), otherTask = partner && this.routines.get(partner.id);
      if (task.kind === 'meal') {
        task.until ??= clock + random.between(6, 9);
        cat.activity = 'eating'; this.face(cat, Math.PI, dt);
      } else if (partner && otherTask) {
        this.face(cat, Math.atan2(partner.position.x - cat.position.x, partner.position.z - cat.position.z), dt);
        if (Math.hypot(partner.position.x - otherTask.target.x, partner.position.z - otherTask.target.z) < 0.035) {
          task.until ??= clock + 7; otherTask.until ??= task.until;
          cat.activity = 'playing'; cat.happyUntil = clock + 1;
        }
      } else this.cancel(cat.id, cats, clock);
    }
  }
  private face(cat: CatState, yaw: number, dt: number) {
    const turn = Math.atan2(Math.sin(yaw - cat.yaw), Math.cos(yaw - cat.yaw));
    cat.yaw += turn * Math.min(1, dt * 5); return turn;
  }
  private walk(cat: CatState, cats: CatState[], dt: number) {
    const dx = cat.destination.x - cat.position.x, dz = cat.destination.z - cat.position.z;
    const distance = Math.hypot(dx, dz), angle = Math.atan2(dx, dz);
    // Try a gentle side step if another resting cat occupies the direct route.
    for (const offset of [0, 0.8, -0.8, 1.4, -1.4]) {
      const yaw = angle + offset, travel = Math.min(distance, dt * ROOM.walkSpeed * 0.85);
      const next = { x: cat.position.x + Math.sin(yaw) * travel, z: cat.position.z + Math.cos(yaw) * travel };
      if (next.x < ROOM.minX || next.x > ROOM.maxX || next.z < ROOM.minZ || next.z > ROOM.maxZ) continue;
      if (cats.some(other => other !== cat && other.elevation < 0.3 && Math.hypot(other.position.x - next.x, other.position.z - next.z) < 0.62)) continue;
      const turn = this.face(cat, yaw, dt);
      if (Math.abs(turn) < 0.7) { cat.position = next; cat.stride += travel * 10; }
      return;
    }
    cat.activity = 'idle';
  }
}
