import type { CatActivity, FloorPoint } from './types';

export interface Waypoint extends FloorPoint { height: number; crawl?: boolean; }
export interface FurnitureSpot {
  id: string;
  activity: CatActivity;
  yaw: number;
  duration: number;
  route: readonly Waypoint[];
}

// Room coordinates, shared by the models and behavior. Routes enter from
// the clear aisle in front of the furniture and are reversed when leaving.
export const TREE = { x: -3.8, z: -4.7 };
export const HIDEOUT = { x: -3.8, z: 2.8 };
export const BENCH = { x: -4.25, z: -0.7 };
export const BED = { x: 3.9, z: 3.2 };
export const POST = { x: 4.1, z: -2.4 };
export const RUG = { x: 0, z: 0.0, radiusX: 3.1, radiusZ: 3.6 };
export const AISLE_Z = -5.15;
export const FURNITURE: readonly FurnitureSpot[] = [
  { id: 'tree', activity: 'perching', yaw: 0.25, duration: 4.5, route: [
    { x: -2.8, z: TREE.z + 1.35, height: 0 },
    { x: TREE.x, z: TREE.z + 0.75, height: 0.56 },
    { x: TREE.x - 0.35, z: TREE.z + 0.15, height: 1.22 },
    { x: TREE.x + 0.2, z: TREE.z - 0.05, height: 1.96 },
  ] },
  { id: 'box', activity: 'hiding', yaw: Math.PI, duration: 3.8, route: [
    { x: -2.8, z: HIDEOUT.z + 1.15, height: 0 },
    { x: HIDEOUT.x, z: HIDEOUT.z + 1.15, height: 0 },
    { x: HIDEOUT.x, z: HIDEOUT.z + 0.6, height: 0, crawl: true },
    { x: HIDEOUT.x, z: HIDEOUT.z, height: 0, crawl: true },
  ] },
  { id: 'window', activity: 'watching', yaw: Math.PI / 2, duration: 4, route: [
    { x: -2.9, z: -5.5, height: 0 },
    { x: -2.9, z: -6.45, height: 0.8 },
    { x: -2.65, z: -7.28, height: 1.92 },
  ] },
  { id: 'cabinet', activity: 'perching', yaw: Math.PI / 2, duration: 3.5, route: [
    { x: 2.9, z: -5.45, height: 0 },
    { x: 2.9, z: -6.05, height: 0.62 },
    { x: 2.38, z: -6.92, height: 1.36 },
  ] },
  { id: 'sun', activity: 'sleeping', yaw: 1.1, duration: 5, route: [
    { x: -2.7, z: -4.3, height: 0 },
  ] },
  { id: 'rug', activity: 'grooming', yaw: -0.65, duration: 3, route: [
    { x: 0.4, z: 2.6, height: 0 },
  ] },
  { id: 'bench', activity: 'sleeping', yaw: 0, duration: 5, route: [
    { x: -3, z: BENCH.z, height: 0 }, { x: BENCH.x, z: BENCH.z, height: 1.12 },
  ] },
  { id: 'bed', activity: 'sleeping', yaw: 0.6, duration: 5, route: [
    { x: 2.9, z: BED.z, height: 0 }, { x: BED.x, z: BED.z, height: 0.22 },
  ] },
  { id: 'post', activity: 'scratching', yaw: 2.42, duration: 3.2, route: [
    { x: 3, z: POST.z + 0.7, height: 0 }, { x: POST.x - 0.27, z: POST.z + 0.31, height: 0.215 },
  ] },
];

export interface FurnitureVisit {
  id: string;
  phase: 'approach' | 'use' | 'leave';
  route: Waypoint[];
  index: number;
  progress: number;
  from: Waypoint;
  until: number;
  leaveRequested: boolean;
}
