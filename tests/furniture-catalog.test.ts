import { describe, expect, it } from 'vitest';
import { furnitureGroups, furnitureGrid } from '../src/furniture-catalog';
import { defaultRoomLayout } from '../src/room-layout';

describe('visual furniture inventory', () => {
  it('groups matching pieces without losing copy identities or merging colour variants', () => {
    const layout = defaultRoomLayout(), groups = furnitureGroups(layout);
    expect(groups.flatMap(group => group.ids).sort()).toEqual(Object.keys(layout.placed).sort());
    expect(groups.find(group => group.id === 'chairs')?.ids).toEqual(['chair-1', 'chair-2', 'chair-3', 'chair-4']);
    expect(groups.find(group => group.id === 'tables')?.ids).toHaveLength(3);
    expect(groups.find(group => group.id === 'recliners')?.ids).toHaveLength(2);
    expect(groups.filter(group => group.id.startsWith('bed-'))).toHaveLength(3);
  });
  it('shows a mixed group in either filter and retains unavailable items only in inventory', () => {
    const layout = defaultRoomLayout(), pose = layout.placed['chair-2']; delete layout.placed['chair-2'];
    layout.unplaced.push({ id: 'chair-2', pose, reason: 'Stored in inventory', stored: true }, { id: 'old-chair', reason: 'Furniture is no longer available' });
    expect(furnitureGroups(layout, 'inventory').map(group => group.id)).toEqual(['chairs', 'old-chair']);
    expect(furnitureGroups(layout, 'room').find(group => group.id === 'chairs')?.ids).toHaveLength(4);
    expect(furnitureGroups(layout, 'room').some(group => group.id === 'old-chair')).toBe(false);
    expect(furnitureGroups(layout).find(group => group.id === 'old-chair')?.available).toBe(false);
  });
  it('keeps copy buttons at least 44 pixels on short/narrow phones and desktop', () => {
    for (const [width, height] of [[256, 290], [348, 580], [468, 650]]) {
      const grid = furnitureGrid(width, height);
      expect((grid.cardWidth - 26) / 2).toBeGreaterThanOrEqual(44);
      expect(grid.cardHeight).toBeGreaterThanOrEqual(220);
      expect(grid.rows * grid.cardHeight + (grid.rows - 1) * grid.gap).toBeLessThanOrEqual(height);
    }
  });
});
