import type { StageConfig, ToolDefinition, ToolId } from './types';

export const STAGES: readonly StageConfig[] = [
  { duration: 45, cats: 1, delay: [8, 12], patience: 22 },
  { duration: 60, cats: 2, delay: [7, 10], patience: 18 },
  { duration: 60, cats: 3, delay: [6, 9], patience: 15 },
  { duration: 75, cats: 4, delay: [4, 7], patience: 12 },
  { duration: 75, cats: 5, delay: [3, 5], patience: 9 },
];
// Movement work is measured in fractions of the short viewport edge.
export const TOOLS: readonly ToolDefinition[] = [
  { id: 'sweeper', name: 'Sweeper', need: 'poop', label: 'Poop patrol', instruction: 'Sweep across the mess', gesture: 'sweep', color: '#d6a36e', work: 0.9 },
  { id: 'mop', name: 'Mop', need: 'vomit', label: 'A little accident', instruction: 'Rub back and forth', gesture: 'rub', color: '#91b9bd', work: 0.9 },
  { id: 'brush', name: 'Brush', need: 'fur', label: 'Fluff everywhere', instruction: 'Brush across the fur', gesture: 'sweep', color: '#c0acd6', work: 0.9 },
  { id: 'food', name: 'Food', need: 'hunger', label: 'Dinner, please', instruction: 'Tap the bowl to pour', gesture: 'tap', color: '#dda079', work: 4 },
  { id: 'toy', name: 'Wand', need: 'boredom', label: 'Play with me', instruction: 'Drag the toy around me', gesture: 'drag', color: '#a5b99a', work: 2 },
];
export const TOOL_BY_ID = Object.fromEntries(TOOLS.map(t => [t.id, t])) as Record<ToolId, ToolDefinition>;
export const PALETTE = [
  { name: 'Mochi', color: '#e7b77d', accent: '#b97d4c' },
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
