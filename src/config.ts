import type { CatDefinition, StageConfig, ToolDefinition, ToolId } from './types';

export const STAGES: readonly StageConfig[] = [
  { duration: 45, cats: 1, delay: [8, 12], patience: 22 },
  { duration: 60, cats: 2, delay: [7, 10], patience: 18 },
  { duration: 60, cats: 3, delay: [6, 9], patience: 15 },
  { duration: 75, cats: 4, delay: [4, 7], patience: 12 },
  { duration: 75, cats: 5, delay: [3, 5], patience: 9 },
];
// Movement work is measured in fractions of the short viewport edge.
export const TOOLS: readonly ToolDefinition[] = [
  { id: 'sweeper', name: 'Sweeper', need: 'poop', label: 'Poop patrol', instruction: 'Sweep away all three layers', gesture: 'sweep', color: '#d6a36e', work: 0.9 },
  { id: 'mop', name: 'Mop', need: 'vomit', label: 'A little accident', instruction: 'Rub back and forth', gesture: 'rub', color: '#91b9bd', work: 0.9 },
  { id: 'brush', name: 'Brush', need: 'fur', label: 'Fluff everywhere', instruction: 'Gather the fluff, then sweep away', gesture: 'sweep', color: '#c0acd6', work: 0.9 },
  { id: 'food', name: 'Food', need: 'hunger', label: 'Dinner, please', instruction: 'Hold over the bowl to pour', gesture: 'pour', color: '#dda079', work: 2 },
  { id: 'toy', name: 'Wand', need: 'boredom', label: 'Play with me', instruction: 'Hold the wand in the arch above me', gesture: 'hold', color: '#a5b99a', work: 3 },
];
export const TOOL_BY_ID = Object.fromEntries(TOOLS.map(t => [t.id, t])) as Record<ToolId, ToolDefinition>;
export const PALETTE: readonly (Pick<CatDefinition, 'name' | 'color' | 'accent'> & Partial<Pick<CatDefinition, 'appearance'>>)[] = [
  { name: 'Choco', color: '#604239', accent: '#49312c', appearance: 'choco' },
  { name: 'Latte', color: '#f8f4e9', accent: '#514944', appearance: 'latte' },
  { name: '的的', color: '#727983', accent: '#3e4650', appearance: 'didi' },
  { name: '小塞', color: '#d7a05b', accent: '#a96a2d', appearance: 'xiaosai' },
  { name: 'Miso', color: '#9caeb7', accent: '#657e8b' },
  { name: 'Peaches', color: '#e7a59b', accent: '#bd7774' },
  { name: 'Tofu', color: '#e9e2d0', accent: '#b9b0a1' },
  { name: 'Olive', color: '#a7b79a', accent: '#758769' },
  { name: 'Plum', color: '#b6a2c8', accent: '#86729a' },
  { name: 'Bean', color: '#817c83', accent: '#514b57' },
  { name: 'Biscuit', color: '#d4c092', accent: '#a18b5c' },
];
// One shared floor, with furniture kept outside the walkable bounds.
export const ROOM = { minX: -3.1, maxX: 3.1, minZ: -5.7, maxZ: 4.0, catScale: 0.52, walkSpeed: 0.72 } as const;
export const EFFICIENCY = [0, 1, 1.5, 2] as const;
export const ATTACK_DAMAGE = 10;
export const ATTACK_WARNING = 1;
export const ATTACK_INTERVAL = 4;
export const STRETCH_DURATION = 4.2;
