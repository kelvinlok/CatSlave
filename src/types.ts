export type ToolId = 'sweeper' | 'mop' | 'brush' | 'food' | 'toy' | 'vacuum';
export type EventKind = 'poop' | 'vomit' | 'fur' | 'hunger' | 'boredom';
export type Phase = 'title' | 'tutorial' | 'playing' | 'bonus' | 'paused' | 'adoption' | 'upgrade' | 'game-over' | 'victory' | 'free-play';
export interface BehaviorProfile { needRate: number; patience: number; }
export interface CatDefinition {
  id: number; name: string; color: string; accent: string;
  appearance: 'primitive' | 'choco' | 'latte' | 'didi' | 'xiaosai'; behavior: BehaviorProfile;
}
export interface FloorPoint { x: number; z: number; }
export type CatActivity = 'idle' | 'walking' | 'sniffing' | 'jumping' | 'crawling' | 'perching' | 'hiding' | 'watching' | 'sleeping' | 'grooming' | 'scratching' | 'eating' | 'playing' | 'stretching';
export interface CatState extends CatDefinition {
  nextNeedAt: number; lastKind?: EventKind; happyUntil: number; attackUntil: number;
  position: FloorPoint; destination: FloorPoint; yaw: number; stride: number;
  activity: CatActivity; decisionAt: number;
  nextStretchAt?: number; stretchStartedAt?: number;
  elevation: number; pose: number;
  visit?: import('./furniture').FurnitureVisit; lastFurniture?: string;
  pendingNeed?: EventKind;
}
export interface CareEvent {
  id: number; catId: number; kind: EventKind; progress: number;
  createdAt: number; deadline: number; nextAttackAt: number; attacks: number;
  position: FloorPoint;
}
export interface ToolDefinition {
  id: ToolId; name: string; need: EventKind;
  needs?: readonly EventKind[];
  gesture: 'sweep' | 'rub' | 'tap' | 'pour' | 'hold' | 'drag'; color: string; work: number;
}
export interface StageConfig { duration: number; cats: number; delay: readonly [number, number]; patience: number; }
export interface Point { x: number; y: number; }
