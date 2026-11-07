import type { CatState, FloorPoint } from './types';
import { CAT_CLEARANCE, clearFloor, clearFloorSegment, segmentAvoidsBox, floorRoute, type NavigationContext } from './room-navigation';
import { jumpFlightProgress, dropJumpMotion, riseJumpMotion, JUMP_TAKEOFF } from './cat-jump';

export const MAX_ACTIVE_CATS = 5;
export interface CatRoomDefinition { index: number; position: FloorPoint & { height: number }; approach: FloorPoint; yaw: number; }
export const CAT_ROOMS: readonly CatRoomDefinition[] = Array.from({ length: 8 }, (_, index) => ({
  index, position: { x: -6.95, z: index % 2 ? -6.20 : -7.10, height: .18 + Math.floor(index / 2) * 1.2 },
  approach: { x: -5.85, z: index % 2 ? -6.20 : -7.10 }, yaw: Math.PI / 2,
}));
export interface CatRoomsSave { version: 1; active: string[]; rooms: (string | null)[]; }
interface Point extends FloorPoint { height: number; }
export interface RoomTransition {
  catId: number; roomIndex: number; direction: 'sleep' | 'wake'; initialDirection: 'sleep' | 'wake'; phase: 'queued' | 'waiting' | 'approach' | 'hop'; progress: number;
  route: Point[]; from: Point; index: number; blockedFor: number;
  yieldRoute?: FloorPoint[]; yieldFor?: number;
}
/** Reservations are distinct from settled occupants; saves never capture a half-transfer. */
export class CatRooms {
  readonly slots: (CatState | undefined)[] = Array(8).fill(undefined);
  readonly transitions = new Map<number, RoomTransition>();
  lastError = '';
  private reject(message: string) { this.lastError = message; return false; }
  // Every room can use the shared front passage and cabinet approach.
  private landingBusy(point: FloorPoint, cat: CatState, active: readonly CatState[]) {
    if (active.some(other => other !== cat && other.elevation < .3 && Math.hypot(other.position.x-point.x,other.position.z-point.z)<.7)) return true;
    let earlier = true;
    for (const other of this.transitions.values()) {
      if (other.catId === cat.id) { earlier = false; continue; }
      if (other.direction !== 'wake' || other.phase === 'queued') continue;
      const landing = other.route.at(-1), leg = other.route[other.index];
      // Earlier reservations win. A committed flight always wins, including
      // over an earlier request which has not yet left its support surface.
      const committed = leg?.height === 0 && other.from.height > 0 && other.progress > JUMP_TAKEOFF;
      if (landing?.height === 0 && (earlier || committed) && Math.hypot(landing.x-point.x,landing.z-point.z)<.7) return true;
    }
    return false;
  }
  private clearOfCats(from: FloorPoint, to: FloorPoint, cat: CatState, active: readonly CatState[]) {
    const dx=to.x-from.x,dz=to.z-from.z,length2=dx*dx+dz*dz;
    return active.every(other => {
      if(other===cat || other.elevation>=.3) return true;
      const t=length2 ? Math.max(0,Math.min(1,((other.position.x-from.x)*dx+(other.position.z-from.z)*dz)/length2)) : 0;
      return Math.hypot(other.position.x-from.x-dx*t,other.position.z-from.z-dz*t)>=.6;
    });
  }
  private yieldQueuedBlocker(landing: FloorPoint, incoming: CatState, active: CatState[], navigation: NavigationContext) {
    const blocker=active.find(other=>other!==incoming && other.elevation===0 && !other.visit
      && Math.hypot(other.position.x-landing.x,other.position.z-landing.z)<.7
      && this.transitions.get(other.id)?.phase==='queued' && this.transitions.get(other.id)?.direction==='sleep');
    if(!blocker) return;
    const queued=this.transitions.get(blocker.id)!;
    if(queued.yieldRoute?.length) return;
    for(const radius of [.9,1.2,1.5]) for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4, point={x:blocker.position.x+Math.cos(angle)*radius,z:blocker.position.z+Math.sin(angle)*radius};
      if(Math.hypot(point.x-landing.x,point.z-landing.z)<.85 || !clearFloor(point,'whole-room',navigation)
        || this.landingBusy(point,blocker,active)) continue;
      const route=floorRoute(blocker.position,point,'whole-room',navigation);
      let previous=blocker.position,total=0,clear=!!route.length;
      for(const next of route) { total+=Math.hypot(next.x-previous.x,next.z-previous.z); clear&&=this.clearOfCats(previous,next,blocker,active); previous=next; }
      if(!clear || total>2.8) continue;
      queued.yieldRoute=route;queued.yieldFor=incoming.id;return;
    }
  }
  private tickYield(cat: CatState, transition: RoomTransition, active: CatState[], navigation: NavigationContext, dt: number) {
    const target=transition.yieldRoute?.[0];if(!target) return;
    const dx=target.x-cat.position.x,dz=target.z-cat.position.z,distance=Math.hypot(dx,dz);
    const yaw=Math.atan2(dx,dz),turn=Math.atan2(Math.sin(yaw-cat.yaw),Math.cos(yaw-cat.yaw));cat.yaw+=turn*Math.min(1,dt*8);
    cat.activity='idle';cat.pose=0;cat.jumpDrop=undefined;cat.jumpRise=undefined;
    if(Math.abs(turn)>.3) return;
    const travel=Math.min(distance,dt*.7),next={x:cat.position.x+dx/(distance||1)*travel,z:cat.position.z+dz/(distance||1)*travel};
    if(!clearFloor(next,'whole-room',navigation) || !clearFloorSegment(cat.position,next,'whole-room',navigation)
      || !this.clearOfCats(cat.position,next,cat,active)) return;
    cat.position=next;cat.destination={...target};cat.activity='walking';cat.stride+=travel*10;
    if(distance<=travel+.001) transition.yieldRoute!.shift();
    if(!transition.yieldRoute!.length) {transition.yieldRoute=undefined;transition.yieldFor=undefined;cat.activity='idle';}
  }
  private saved?: CatRoomsSave;
  private known = new Map<string, CatState>();
  get sleeping() { return this.slots.filter((cat): cat is CatState => !!cat && !this.transitions.has(cat.id)); }
  export(): CatRoomsSave | undefined { return this.saved && { version: 1, active: [...this.saved.active], rooms: [...this.saved.rooms] }; }
  restore(value: unknown, unlocked: readonly string[]) {
    if (!value || typeof value !== 'object') return false;
    const data = value as CatRoomsSave;
    if (data.version !== 1 || !Array.isArray(data.active) || data.active.length > MAX_ACTIVE_CATS
      || !Array.isArray(data.rooms) || data.rooms.length !== 8) return false;
    const names = [...data.active, ...data.rooms.filter(name => name !== null)];
    if (names.some(name => typeof name !== 'string' || !unlocked.includes(name)) || new Set(names).size !== names.length) return false;
    this.saved = { version: 1, active: [...data.active], rooms: [...data.rooms] }; return true;
  }
  initialize(activeNames: readonly string[], unlocked: readonly string[], create: (name: string) => CatState, existing: CatState[]) {
    this.transitions.clear();
    for (const cat of existing) if (!this.known.has(cat.name)) this.known.set(cat.name, cat);
    const get = (name: string) => { let cat = this.known.get(name); if (!cat) { cat = create(name); this.known.set(name, cat); } return cat; };
    const active = (this.saved?.active ?? activeNames).filter(name => unlocked.includes(name)).slice(0, MAX_ACTIVE_CATS).map(get);
    active.forEach(cat => { cat.jumpDrop = undefined; cat.jumpRise = undefined; });
    this.slots.fill(undefined);
    this.saved?.rooms.forEach((name, i) => { if (name && unlocked.includes(name) && !active.some(cat => cat.name === name)) this.slots[i] = get(name); });
    for (const name of unlocked) if (!active.some(cat => cat.name === name) && !this.slots.some(cat => cat?.name === name)) {
      const index = this.slots.indexOf(undefined); if (index >= 0) this.slots[index] = get(name); else if (active.length < MAX_ACTIVE_CATS) active.push(get(name));
    }
    this.slots.forEach((cat, index) => { if (cat) this.sleep(cat, index); });
    this.commit(active); return active;
  }
  private sleep(cat: CatState, index: number) {
    const room = CAT_ROOMS[index]; cat.position = { x: room.position.x, z: room.position.z }; cat.elevation = room.position.height;
    cat.yaw = room.yaw; cat.activity = 'sleeping'; cat.pose = 0; cat.jumpDrop = undefined; cat.jumpRise = undefined; cat.visit = undefined; cat.destination = { ...cat.position };
    cat.nextNeedAt = Infinity; cat.decisionAt = Infinity;
  }
  private commit(active: readonly CatState[]) {
    // While another reservation remains, save that cat's original membership.
    const names = active.filter(cat => this.transitions.get(cat.id)?.initialDirection !== 'wake').map(cat => cat.name);
    const rooms = this.slots.map(cat => cat && this.transitions.get(cat.id)?.initialDirection !== 'sleep' ? cat.name : null);
    this.saved = { version: 1, active: names, rooms };
  }
  private floorApproach(origin: FloorPoint, target: FloorPoint, navigation: NavigationContext, floorNavigation = navigation): FloorPoint[] {
    if (clearFloor(origin, 'whole-room', navigation)) {
      const route=floorRoute(origin,target,'whole-room',navigation);
      if(route.length) return route;
    }
    // Lounge cats can already be beneath a table. Leave that containing footprint
    // once, then use whole-body clearance for the rest of the bedroom approach.
    const containing = navigation.obstacles.filter(box => origin.x > box.minX && origin.x < box.maxX && origin.z > box.minZ && origin.z < box.maxZ);
    const exits = containing.flatMap(box => [
      { x: box.minX - .015, z: origin.z }, { x: box.maxX + .015, z: origin.z },
      { x: origin.x, z: box.minZ - .015 }, { x: origin.x, z: box.maxZ + .015 },
    ]).sort((a,b) => Math.hypot(a.x-origin.x,a.z-origin.z)-Math.hypot(b.x-origin.x,b.z-origin.z));
    for (const exit of exits) {
      if (Math.hypot(exit.x-origin.x,exit.z-origin.z)>1.8 || !clearFloor(exit,'whole-room',navigation)
        || !navigation.segment(origin,exit,CAT_CLEARANCE,'whole-room')
        || navigation.obstacles.some(box=>!containing.includes(box) && !segmentAvoidsBox(origin,exit,box))) continue;
      const route=floorRoute(exit,target,'whole-room',navigation);
      if(route.length) return [exit,...route];
    }
    return floorNavigation === navigation ? [] : floorRoute(origin,target,'whole-room',floorNavigation);
  }
  private clearLanding(from: Point, point: Point, navigation: NavigationContext) {
    // Room navigation includes tabletop envelopes as well as floor obstacles.
    if (!clearFloor(point, 'whole-room', navigation)) return false;
    if (!segmentAvoidsBox(from, point, { minX: -7.87, maxX: -6.13, minZ: -5.99, maxZ: -5.48 })) return false;
    // The cabinet jump passes above the low chair; check the descending runout
    // once it reaches floor-obstacle height. Lower doorways have a clear approach.
    const t = from.x < -6.3 ? .80 : 0;
    const runout = { x: from.x + (point.x - from.x) * t, z: from.z + (point.z - from.z) * t };
    return clearFloorSegment(runout, point, 'whole-room', navigation);
  }
  private roomPath(index: number, navigation: NavigationContext, origin?: FloorPoint, floorNavigation = navigation): Point[] | undefined {
    const room = CAT_ROOMS[index], upper = index >= 4;
    const launch = upper ? { x: -6.62, z: -4.78, height: 1.62 } : { x: -6.0, z: room.position.z, height: room.position.height };
    // Prefer a straight jump into open floor. Legacy furniture can require the back lane.
    const frontFloor = { x: -5.15, z: -5.6, height: 0 }, backFloor = { x: -5.15, z: -7.55, height: 0 };
    const candidates = upper
      ? [{ x: -5.25, z: -4.78, height: 0 }, { x: -4.9, z: -4.78, height: 0 },
        ...[0, -.25, .15].flatMap(dz => [0, .35, .7].map(dx => ({ x: -4.9 + dx, z: -7.1 + dz, height: 0 })))]
      : index % 2 ? [frontFloor, backFloor] : [backFloor, frontFloor];
    const launchFor = (point: Point) => !upper ? { ...launch, z: point.z > -6 ? -6.2 : -7.35 } : launch;
    const landing = candidates.find(point => {
      return this.clearLanding(launchFor(point), point, navigation) && (!origin || this.floorApproach(origin, point, navigation, floorNavigation).length > 0);
    });
    if (!landing) return;
    if (!upper) {
      const departure=launchFor(landing);
      return [{ ...room.position }, launch, ...(departure.z !== launch.z ? [departure] : []), landing];
    }
    // The extended upper ledge carries the cat past the full-height side divider
    // before a straight jump onto the clear cabinet top. No airborne U-turns.
    return [
      { ...room.position },
      { x: -6.04, z: room.position.z, height: room.position.height },
      { x: -6.04, z: -5.45, height: room.position.height },
      { x: -6.75, z: -4.50, height: 1.62 }, launch, landing,
    ];
  }
  send(cat: CatState, active: CatState[], navigation: NavigationContext, index = this.slots.indexOf(undefined), floorNavigation = navigation) {
    this.lastError = '';
    if (!active.includes(cat)) return this.reject('Choose a cat in the lounge.');
    if (this.transitions.has(cat.id)) return this.reject('That cat is already moving.');
    if (index < 0 || index >= 8 || !Number.isInteger(index)) return this.reject('All eight rooms are occupied.');
    if (this.slots[index]) return this.reject('This room is occupied.');
    const path = this.roomPath(index, navigation, cat.elevation === 0 && !cat.visit ? cat.position : undefined, floorNavigation);
    if (!path) return this.reject('Clear the space in front of the cat rooms first.');
    const queued = this.transitions.size > 0;
    this.slots[index] = cat;
    this.transitions.set(cat.id, { catId: cat.id, roomIndex: index, direction: 'sleep', initialDirection: 'sleep', phase: queued ? 'queued' : 'waiting', progress: 0,
      route: [], from: { ...cat.position, height: cat.elevation }, index: 0, blockedFor: 0 });
    if (cat.visit) cat.visit.leaveRequested = true;
    cat.decisionAt = Infinity; return true;
  }
  wake(index: number, active: CatState[], navigation: NavigationContext) {
    this.lastError = '';
    const cat = this.slots[index];
    if (!cat) return this.reject('This room is empty.');
    if (this.transitions.has(cat.id) || active.some(other => other.name === cat.name)) return this.reject('That cat is already moving.');
    if (active.length >= MAX_ACTIVE_CATS) return this.reject('The lounge already has 5 cats.');
    const route = this.roomPath(index, navigation)?.slice(1);
    if (!route) return this.reject('Clear the space in front of the cat rooms first.');
    const queued = this.transitions.size > 0;
    active.push(cat); cat.activity = queued ? 'sleeping' : 'crawling'; cat.decisionAt = Infinity; cat.pose = 0;
    this.transitions.set(cat.id, { catId: cat.id, roomIndex: index, direction: 'wake', initialDirection: 'wake', phase: queued ? 'queued' : 'hop', progress: 0,
      route, from: { ...cat.position, height: cat.elevation }, index: 0, blockedFor: 0 }); return true;
  }
  tick(active: CatState[], navigation: NavigationContext, dt: number, clock: number, floorNavigation = navigation): boolean {
    let changed = false;
    for (const [id, transition] of this.transitions) {
      const cat = active.find(cat => cat.id === id); if (!cat) continue;
      if (transition.phase === 'queued') {
        if(transition.yieldRoute?.length) {this.tickYield(cat,transition,active,navigation,dt);continue;}
        // Map insertion order owns the shared passage until a transfer settles.
        const first = this.transitions.values().next().value;
        if (first !== transition) continue;
        if (transition.direction === 'wake') {
          const route = this.roomPath(transition.roomIndex, navigation)?.slice(1);
          if (!route) {
            this.lastError = 'Clear the space in front of the cat rooms first.';
            this.transitions.delete(id); active.splice(active.indexOf(cat), 1); this.sleep(cat, transition.roomIndex);
            this.commit(active); changed = true; continue;
          }
          transition.route = route;
          transition.phase = 'hop'; cat.activity = 'crawling';
        } else transition.phase = 'waiting';
        changed = true;
      }
      if (transition.phase === 'waiting') {
        if (cat.visit) continue;
        const path = this.roomPath(transition.roomIndex, navigation, cat.position, floorNavigation)?.reverse();
        if (!path) { this.lastError = 'Clear the space in front of the cat rooms first.'; this.slots[transition.roomIndex] = undefined; this.transitions.delete(id); cat.decisionAt = clock + 2; changed = true; continue; }
        transition.route = [...this.floorApproach(cat.position, path[0], navigation, floorNavigation).map(point => ({ ...point, height: 0 })), ...path.slice(1)];
        transition.from = { ...cat.position, height: 0 }; transition.phase = 'approach';
      }
      const target = transition.route[transition.index];
      if (!target) {
        this.transitions.delete(id);
        if (transition.direction === 'sleep') { active.splice(active.indexOf(cat), 1); this.sleep(cat, transition.roomIndex); }
        else { this.slots[transition.roomIndex] = undefined; cat.elevation = 0; cat.pose = 0; cat.jumpDrop = undefined; cat.jumpRise = undefined; cat.activity = 'idle'; cat.destination = { ...cat.position }; cat.decisionAt = clock + 5; }
        this.commit(active); changed = true; continue;
      }
      const from = transition.from, distance = Math.hypot(target.x - from.x, target.z - from.z), hop = target.height !== from.height;
      const drop = Math.max(0, from.height - target.height), rise = Math.max(0, target.height - from.height);
      cat.jumpDrop = drop || undefined; cat.jumpRise = rise || undefined;
      transition.phase = hop || from.height > 0 ? 'hop' : 'approach';
      const yaw = distance > .001 ? Math.atan2(target.x - from.x, target.z - from.z) : CAT_ROOMS[transition.roomIndex].yaw;
      const turn = Math.atan2(Math.sin(yaw - cat.yaw), Math.cos(yaw - cat.yaw)); cat.yaw += turn * Math.min(1, dt * 8);
      if (!transition.progress && Math.abs(turn) > .3) { cat.activity = 'idle'; continue; }
      // Check the landing before takeoff; never freeze or reverse a cat in midair.
      if (drop && target.height === 0 && transition.progress <= JUMP_TAKEOFF
        && [...this.transitions.values()].some(other=>other.yieldFor===cat.id && other.yieldRoute?.length)) {cat.activity='idle';cat.jumpDrop=undefined;cat.jumpRise=undefined;continue;}
      if (drop && target.height === 0 && transition.progress <= JUMP_TAKEOFF && this.landingBusy(target,cat,active)) {
        const alternative = [[.35, 0], [.75, 0], [0, -.8], [0, .8]].map(([dx, dz]) => ({ x: target.x + dx, z: target.z + dz, height: 0 }))
          .find(point => {
            if (Math.hypot(point.x - from.x, point.z - from.z) > (from.x < -6.3 ? 3.4 : 1.8)) return false;
            return this.clearLanding(from, point, navigation)
              && !this.landingBusy(point,cat,active);
          });
        if (alternative) { Object.assign(target, alternative); transition.progress = 0; cat.pose = 0; }
        else this.yieldQueuedBlocker(target,cat,active,navigation);
        cat.activity = 'idle'; cat.jumpDrop = undefined; cat.jumpRise = undefined; continue;
      }
      const duration = drop ? dropJumpMotion(drop, 0).duration : rise ? riseJumpMotion(rise, 0).duration : Math.max(.3, distance / .8);
      const p = Math.min(1, transition.progress + dt / duration);
      const flight = hop ? jumpFlightProgress(p) : p, smooth = flight;
      const next = { x: from.x + (target.x - from.x) * smooth, z: from.z + (target.z - from.z) * smooth };
      if (!hop && target.height === 0 && active.some(other => other !== cat && other.elevation < .3 && Math.hypot(other.position.x - next.x, other.position.z - next.z) < .55
        && Math.hypot(other.position.x - next.x, other.position.z - next.z) < Math.hypot(other.position.x - cat.position.x, other.position.z - cat.position.z))) {
        cat.activity = 'idle'; transition.blockedFor += dt;
        if (transition.blockedFor >= 8) {
          if (transition.direction === 'sleep') {
            this.slots[transition.roomIndex] = undefined; this.transitions.delete(id); cat.decisionAt = clock + 2;
          }
          changed = true;
        }
        continue;
      }
      transition.progress = p; transition.blockedFor = 0; cat.position = next; cat.pose = p;
      cat.activity = hop ? 'jumping' : from.height > 0 || !clearFloor(cat.position,'whole-room',navigation) ? 'crawling' : 'walking';
      cat.elevation = drop ? from.height + dropJumpMotion(drop, p).height : rise ? from.height + riseJumpMotion(rise, p).height : target.height;
      cat.stride += dt * 8;
      if (p === 1) { transition.index++; transition.progress = 0; transition.from = { ...target }; }
    }
    return changed;
  }
}
