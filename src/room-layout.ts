import manifest from '../assets/lounge/furniture-manifest.json';
import room from '../assets/lounge/layout.json';
import { FURNITURE, type FurnitureSpot } from './furniture';
import type { FloorPoint } from './types';
import { ROOM_ENTRANCE, roomFloorContains, roomFloorSegment } from './room-boundaries';
import { clearFloor, createNavigationContext, createFloorReachability, segmentAvoidsBox, type FloorBox, type NavigationContext } from './room-navigation';

export interface FurniturePose extends FloorPoint { turn: 0 | 1 | 2 | 3; }
export interface UnplacedFurniture { id: string; pose?: FurniturePose; reason: string; stored?: boolean; }
export interface RoomLayout { roomRevision: number; placed: Record<string, FurniturePose>; unplaced: UnplacedFurniture[]; }
export interface FurnitureDefinition {
  id: string; label: string; defaultPose: FurniturePose;
  footprints: readonly FloorBox[]; obstacleIds: readonly string[];
}
export const ROOM_REVISION = manifest.revision;
export const FURNITURE_DEFINITIONS: readonly FurnitureDefinition[] = manifest.items.map(item => ({
  id: item.id, label: item.label, defaultPose: { x: item.x, z: item.z, turn: 0 },
  footprints: item.footprints, obstacleIds: item.obstacleIds,
}));
export const SPOT_OWNERS: Readonly<Record<string, string>> = { tree: 'tree', post: 'tree', bench: 'sofa', bed: 'bed-1', wheel: 'wheel' };
export interface LayoutEnvironment {
  revision: number;
  definitions: readonly FurnitureDefinition[];
  fixedObstacles: readonly FloorBox[];
  structuralWalls: readonly FloorBox[];
  contains: typeof roomFloorContains;
  segment: typeof roomFloorSegment;
  anchors: readonly FloorPoint[];
  bounds: FloorBox;
  residents: number;
  spots: readonly FurnitureSpot[];
}
const movableObstacleIds = new Set(FURNITURE_DEFINITIONS.flatMap(def => [...def.obstacleIds]));
export const DEFAULT_LAYOUT_ENVIRONMENT: LayoutEnvironment = {
  revision: ROOM_REVISION, definitions: FURNITURE_DEFINITIONS,
  fixedObstacles: room.obstacles.filter(box => !movableObstacleIds.has(box.id)), structuralWalls: room.structuralWalls,
  contains: roomFloorContains, segment: roomFloorSegment, bounds: room.bounds, residents: 5, spots: FURNITURE,
  anchors: [
    { x: ROOM_ENTRANCE.x, z: ROOM_ENTRANCE.z - .65 },
    { x: room.opening.x, z: (room.opening.minZ + room.opening.maxZ) / 2 },
    ...Array.from({ length: 5 }, (_, i) => [0, .55].map(offset => ({ x: room.feedingShelf.bowlMinX + i * (room.feedingShelf.bowlMaxX - room.feedingShelf.bowlMinX) / 4, z: room.feedingShelf.bowlZ + offset }))).flat(),
  ],
};
export function cloneRoomLayout(value: RoomLayout): RoomLayout {
  return { roomRevision: value.roomRevision, placed: Object.fromEntries(Object.entries(value.placed).map(([id, pose]) => [id, { ...pose }])),
    unplaced: value.unplaced.map(item => ({ ...item, ...(item.pose ? { pose: { ...item.pose } } : {}) })) };
}
export function defaultRoomLayout(environment = DEFAULT_LAYOUT_ENVIRONMENT): RoomLayout {
  return { roomRevision: environment.revision, placed: Object.fromEntries(environment.definitions.map(def => [def.id, { ...def.defaultPose }])), unplaced: [] };
}
export function isFurniturePose(pose: unknown): pose is FurniturePose {
  if (!pose || typeof pose !== 'object') return false;
  const p = pose as FurniturePose;
  return Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isInteger(p.turn) && p.turn >= 0 && p.turn <= 3;
}
export function rotateFloorPoint(point: FloorPoint, turn: number): FloorPoint {
  switch (((turn % 4) + 4) % 4) {
    case 1: return { x: point.z, z: -point.x };
    case 2: return { x: -point.x, z: -point.z };
    case 3: return { x: -point.z, z: point.x };
    default: return { ...point };
  }
}
/** Transform an authored world coordinate through its owner's placement delta. */
export function transformFurniturePoint(def: FurnitureDefinition, pose: FurniturePose, point: FloorPoint): FloorPoint {
  const delta = rotateFloorPoint({ x: point.x - def.defaultPose.x, z: point.z - def.defaultPose.z }, pose.turn);
  return { x: pose.x + delta.x, z: pose.z + delta.z };
}
function boxCorners(box: FloorBox): FloorPoint[] {
  return [{ x: box.minX, z: box.minZ }, { x: box.maxX, z: box.minZ }, { x: box.maxX, z: box.maxZ }, { x: box.minX, z: box.maxZ }];
}
export function furnitureFootprints(def: FurnitureDefinition, pose: FurniturePose): FloorBox[] {
  return def.footprints.map(box => {
    const points = boxCorners(box).map(point => rotateFloorPoint(point, pose.turn));
    return { minX: pose.x + Math.min(...points.map(p => p.x)), maxX: pose.x + Math.max(...points.map(p => p.x)),
      minZ: pose.z + Math.min(...points.map(p => p.z)), maxZ: pose.z + Math.max(...points.map(p => p.z)) };
  });
}
export function boxesOverlap(a: FloorBox, b: FloorBox) {
  return a.minX < b.maxX - 1e-6 && a.maxX > b.minX + 1e-6 && a.minZ < b.maxZ - 1e-6 && a.maxZ > b.minZ + 1e-6;
}
function transformedObstacle(box: FloorBox, def: FurnitureDefinition, pose: FurniturePose): FloorBox {
  const points = boxCorners(box).map(p => transformFurniturePoint(def, pose, p));
  return { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minZ: Math.min(...points.map(p => p.z)), maxZ: Math.max(...points.map(p => p.z)) };
}
export function layoutObstacles(layout: RoomLayout, environment = DEFAULT_LAYOUT_ENVIRONMENT): FloorBox[] {
  const boxes: FloorBox[] = [...environment.fixedObstacles, ...environment.structuralWalls];
  for (const def of environment.definitions) {
    const pose = layout.placed[def.id]; if (!pose) continue;
    // Keep leg-only navigation for tables. Shared old recliner bounds are replaced
    // with their individually authored footprints, so omission removes just one set.
    const authored = def.id.startsWith('table-') ? room.obstacles.filter(box => def.obstacleIds.includes(box.id)) : [];
    boxes.push(...(authored.length ? authored.map(box => transformedObstacle(box, def, pose)) : furnitureFootprints(def, pose)));
  }
  return boxes;
}
function resolvedSpots(layout: RoomLayout, environment: LayoutEnvironment, navigation?: NavigationContext): FurnitureSpot[] {
  const spots: FurnitureSpot[] = [];
  for (const spot of environment.spots) {
    const owner = SPOT_OWNERS[spot.id];
    if (owner) {
      const def = environment.definitions.find(item => item.id === owner), pose = layout.placed[owner];
      if (!def || !pose) continue;
      spots.push({ ...spot, yaw: spot.yaw + pose.turn * Math.PI / 2,
        route: spot.route.map(point => ({ ...point, ...transformFurniturePoint(def, pose, point) })) });
    } else if ((spot.id === 'sun' || spot.id === 'rug') && navigation && !clearFloor(spot.route[0], 'whole-room', navigation)) {
      const safe = findSafeFloorPositions(navigation, [spot.route[0]], 1, environment)[0];
      if (safe) spots.push({ ...spot, route: [{ ...safe, height: 0 }] });
    } else spots.push({ ...spot, route: spot.route.map(point => ({ ...point })) });
  }
  return spots;
}
/** Find enough separated points in the entrance-connected floor component. */
export function findSafeFloorPositions(navigation: NavigationContext, preferred: readonly FloorPoint[], count: number, environment = DEFAULT_LAYOUT_ENVIRONMENT, connected?: (point: FloorPoint) => boolean): FloorPoint[] {
  const origin = environment.anchors[0];
  const reachable = connected ?? (origin ? createFloorReachability(origin, 'whole-room', navigation) : () => true);
  const result: FloorPoint[] = [];
  const accept = (point: FloorPoint) => {
    if (result.length >= count || !clearFloor(point, 'whole-room', navigation)
      || result.some(other => Math.hypot(other.x - point.x, other.z - point.z) < .7)
      || !reachable(point)) return;
    result.push({ ...point });
  };
  preferred.forEach(accept);
  // Start near the entry rather than in the corners behind furniture.
  const center = origin ?? { x: 0, z: 0 }, candidates: FloorPoint[] = [];
  for (let x = environment.bounds.minX + .35; x < environment.bounds.maxX; x += .75)
    for (let z = environment.bounds.minZ + .35; z < environment.bounds.maxZ; z += .75) candidates.push({ x, z });
  candidates.sort((a, b) => Math.hypot(a.x - center.x, a.z - center.z) - Math.hypot(b.x - center.x, b.z - center.z));
  for (const point of candidates) { accept(point); if (result.length >= count) break; }
  return result;
}
function geometryIssue(layout: RoomLayout, environment: LayoutEnvironment): string | undefined {
  const placed: { id: string; boxes: FloorBox[] }[] = [];
  for (const id of Object.keys(layout.placed).sort()) {
    const def = environment.definitions.find(item => item.id === id), pose = layout.placed[id];
    if (!def) return `${id}: furniture is no longer available`;
    if (!isFurniturePose(pose)) return `${def.label}: invalid position or rotation`;
    const boxes = furnitureFootprints(def, pose);
    for (const box of boxes) {
      const corners = boxCorners(box);
      if (!corners.every(point => environment.contains(point, .01))
        || !corners.every((point, i) => environment.segment(point, corners[(i + 1) % 4], .01))) return `${def.label}: outside the room`;
      if (environment.structuralWalls.some(wall => boxesOverlap(box, wall))) return `${def.label}: intersects a wall`;
      if (environment.fixedObstacles.some(fixed => boxesOverlap(box, fixed))) return `${def.label}: overlaps fixed furniture`;
      if (placed.some(other => other.boxes.some(otherBox => boxesOverlap(box, otherBox)))) return `${def.label}: overlaps another item`;
    }
    placed.push({ id, boxes });
  }
}
export function validateRoomLayout(layout: RoomLayout, environment = DEFAULT_LAYOUT_ENVIRONMENT): string | undefined {
  const geometry = geometryIssue(layout, environment); if (geometry) return geometry;
  const navigation = createNavigationContext(layoutObstacles(layout, environment), environment.contains, environment.segment);
  const origin = environment.anchors[0];
  const reachable = origin ? createFloorReachability(origin, 'whole-room', navigation) : () => true;
  if (environment.anchors.some(point => !clearFloor(point, 'whole-room', navigation)
    || !reachable(point))) return 'Blocks access to the entrance, passage or feeding area';
  for (const spot of resolvedSpots(layout, environment)) {
    if (spot.id === 'sun' || spot.id === 'rug') continue;
    if (!spot.route.every(point => environment.contains(point, .22))) return `Blocks access to ${spot.id}`;
    if (!reachable(spot.route[0])) return `Blocks access to ${spot.id}`;
    const owner = SPOT_OWNERS[spot.id];
    const blockers = [...environment.structuralWalls,
      ...environment.definitions.filter(def => def.id !== owner && layout.placed[def.id]).flatMap(def => furnitureFootprints(def, layout.placed[def.id]))];
    if (owner) blockers.push(...environment.fixedObstacles);
    // The authored entry/climb path must remain clear of other furnishings.
    for (let i = 1; i < spot.route.length; i++) {
      if (blockers.some(box => !segmentAvoidsBox(spot.route[i - 1], spot.route[i], { minX: box.minX - .22, maxX: box.maxX + .22, minZ: box.minZ - .22, maxZ: box.maxZ + .22 }))) return `Blocks the ${spot.id} interaction route`;
    }
  }
  if (findSafeFloorPositions(navigation, environment.anchors, environment.residents, environment, reachable).length < environment.residents) return 'Not enough reachable floor space for the cats';
}

/** Reconcile an older layout without ever moving an invalid item to a guessed position. */
export function reconcileRoomLayout(layout: RoomLayout, environment = DEFAULT_LAYOUT_ENVIRONMENT): RoomLayout {
  const next: RoomLayout = { roomRevision: environment.revision, placed: {}, unplaced: [] };
  const known = new Set(environment.definitions.map(def => def.id));
  const seen = new Set<string>();
  for (const id of Object.keys(layout.placed).sort()) {
    seen.add(id); const pose = layout.placed[id];
    if (!known.has(id)) { next.unplaced.push({ id, pose: { ...pose }, reason: 'Furniture is no longer available' }); continue; }
    if (!isFurniturePose(pose)) { next.unplaced.push({ id, reason: 'Invalid position or rotation' }); continue; }
    next.placed[id] = { ...pose };
    const issue = validateRoomLayout(next, environment);
    if (issue) { delete next.placed[id]; next.unplaced.push({ id, pose: { ...pose }, reason: issue }); }
  }
  for (const item of layout.unplaced) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    next.unplaced.push({ ...item, ...(item.pose ? { pose: { ...item.pose } } : {}),
      stored: known.has(item.id) ? item.stored : undefined,
      reason: known.has(item.id) ? item.reason : 'Furniture is no longer available' });
  }
  for (const def of environment.definitions) if (!seen.has(def.id)) next.unplaced.push({ id: def.id, reason: 'New furniture: choose a position' });
  next.unplaced.sort((a, b) => a.id.localeCompare(b.id));
  return next;
}

/** One layout/navigation snapshot per game, never shared mutable module state. */
export class RoomLayoutRuntime {
  layout: RoomLayout;
  revision = 0;
  navigation: NavigationContext;
  spots: FurnitureSpot[];
  constructor(layout = defaultRoomLayout(), readonly environment = DEFAULT_LAYOUT_ENVIRONMENT) {
    this.layout = cloneRoomLayout(layout);
    this.navigation = createNavigationContext(layoutObstacles(layout, environment), environment.contains, environment.segment);
    this.spots = resolvedSpots(layout, environment, this.navigation);
  }
  apply(layout: RoomLayout) {
    this.layout = cloneRoomLayout(layout);
    this.navigation = createNavigationContext(layoutObstacles(layout, this.environment), this.environment.contains, this.environment.segment);
    this.spots = resolvedSpots(layout, this.environment, this.navigation);
    this.revision++;
  }
}
