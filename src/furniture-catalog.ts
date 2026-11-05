import { FURNITURE_DEFINITIONS, type RoomLayout } from './room-layout';

export type FurnitureFilter = 'all' | 'room' | 'inventory';
export interface FurnitureGroup { id: string; label: string; ids: string[]; available: boolean; }
const repeated = [
  { id: 'chairs', label: 'Floor chair', ids: ['chair-1', 'chair-2', 'chair-3', 'chair-4'] },
  { id: 'tables', label: 'Triangular table', ids: ['table-1', 'table-2', 'table-3'] },
  { id: 'recliners', label: 'Recliner set', ids: ['recliner-1', 'recliner-2'] },
];

/** Group appearance only. Every copy keeps its own persistent ID and placement. */
export function furnitureGroups(layout: RoomLayout, filter: FurnitureFilter = 'all'): FurnitureGroup[] {
  const groups: FurnitureGroup[] = [], seen = new Set<string>();
  for (const definition of FURNITURE_DEFINITIONS) {
    const group = repeated.find(group => group.ids.includes(definition.id)) ?? { id: definition.id, label: definition.label, ids: [definition.id] };
    if (seen.has(group.id)) continue;
    seen.add(group.id); groups.push({ ...group, ids: [...group.ids], available: true });
  }
  for (const item of layout.unplaced) if (!FURNITURE_DEFINITIONS.some(definition => definition.id === item.id)) {
    groups.push({ id: item.id, label: item.id, ids: [item.id], available: false });
  }
  return groups.filter(group => filter === 'all' || group.ids.some(id => filter === 'room' ? !!layout.placed[id] : layout.unplaced.some(item => item.id === id)));
}

export function furnitureGrid(width: number, height: number) {
  const columns = 2, gap = 10, rows = Math.max(1, Math.floor(height / 224));
  return { columns, rows, gap, count: columns * rows, cardWidth: (width - gap) / columns,
    cardHeight: Math.min(246, (height - gap * (rows - 1)) / rows) };
}
