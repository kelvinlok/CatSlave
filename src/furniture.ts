import type { CatActivity, FloorPoint } from './types';
import layout from '../assets/lounge/layout.json' with { type: 'json' };

export interface Waypoint extends FloorPoint { height: number; crawl?: boolean; }
export interface FurnitureSpot {
  id: string;
  activity: CatActivity;
  yaw: number;
  duration: number;
  route: readonly Waypoint[];
}

// Surface heights and coordinates match the editable Blender lounge and layout.json.
export const TREE = { x: -6.85, z: 1.7 };
export const HIDEOUT = { x: -7.05, z: -5.7 };
export const BENCH = { x: 2.65, z: 6.4 };
export const BED = { x: 0.45, z: -5.5 };
export const POST = { x: -6.85, z: 1.7 };
export const WHEEL = layout.furniture.wheel;
export const FURNITURE: readonly FurnitureSpot[] = [
  { id: 'tree', activity: 'perching', yaw: 0.25, duration: 4.5, route: [
    { x: -5.75, z: 2.15, height: 0 },
    { x: -6.6, z: 2.15, height: 0.56 },
    { x: -6.95, z: 1.65, height: 1.22 },
    { x: -6.65, z: 1.3, height: 1.96 },
  ] },
  { id: 'box', activity: 'hiding', yaw: -Math.PI / 2, duration: 3.8, route: [
    { x: -5.85, z: -5.7, height: 0 },
    { x: -6.45, z: HIDEOUT.z, height: 0.08, crawl: true },
    { x: HIDEOUT.x, z: HIDEOUT.z, height: 0.08, crawl: true },
  ] },
  { id: 'window', activity: 'watching', yaw: Math.PI / 2, duration: 4, route: [
    { x: 7.05, z: 1.6, height: 0 },
    { x: 7.7, z: 1.6, height: 0.65 },
    { x: 8.55, z: 1.6, height: 1.55 },
  ] },
  { id: 'cabinet', activity: 'perching', yaw: Math.PI / 2, duration: 3.5, route: [
    { x: -5.85, z: -0.85, height: 0 },
    { x: -6.65, z: -0.85, height: 1.62 },
  ] },
  { id: 'sun', activity: 'sleeping', yaw: 1.1, duration: 5, route: [
    { x: 0, z: 2.1, height: 0 },
  ] },
  // The legacy id is retained for saved behavior; this is now the open oak floor.
  { id: 'rug', activity: 'grooming', yaw: -0.65, duration: 3, route: [
    { x: 0.4, z: 0, height: 0 },
  ] },
  { id: 'bench', activity: 'sleeping', yaw: Math.PI, duration: 5, route: [
    { x: BENCH.x, z: 5.15, height: 0 }, { x: BENCH.x, z: BENCH.z, height: 0.78 },
  ] },
  { id: 'bed', activity: 'sleeping', yaw: 0.6, duration: 5, route: [
    { x: 0.05, z: -4.35, height: 0 }, { x: BED.x, z: BED.z, height: 0.22 },
  ] },
  { id: 'wheel', activity: 'running', yaw: Math.PI / 2, duration: 8, route: [
    WHEEL.approach, { x: WHEEL.x, z: WHEEL.z, height: WHEEL.height },
  ] },
  { id: 'post', activity: 'scratching', yaw: -Math.PI / 2, duration: 3.2, route: [
    { x: -5.75, z: 1.4, height: 0 }, { x: POST.x + 0.31, z: POST.z, height: 0.08 },
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
