import { describe, expect, it } from 'vitest';
import {
  RoomEditor, RoomLayoutStore, ROOM_LAYOUT_STORAGE_KEY, ROOM_LAYOUT_NOTICE_KEY, importRoomLayout, parseRoomLayout, roomLayoutWarnings,
} from '../src/room-editor';
import { defaultRoomLayout, validateRoomLayout, reconcileRoomLayout, DEFAULT_LAYOUT_ENVIRONMENT, type RoomLayout } from '../src/room-layout';
import { RoomEditorView } from '../src/room-editor-view';
import * as THREE from 'three';

class MemoryStorage {
  values = new Map<string, string>();
  writes: string[] = [];
  fail = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error('Quota exceeded');
    this.writes.push(key); this.values.set(key, value);
  }
}
function spareTable(): RoomLayout {
  const layout = defaultRoomLayout();
  layout.unplaced = [...layout.unplaced, ...Object.entries(layout.placed).filter(([id]) => id !== 'table-1').map(([id, pose]) => ({ id, pose, reason: 'Not placed' }))];
  layout.placed = { 'table-1': { x: -2, z: 0, turn: 0 } };
  return layout;
}

describe('room editor transactions', () => {
  it('stores without deleting ownership, preserves the committed pose, and supports undo, redo and recovery', () => {
    const original = defaultRoomLayout(), editor = new RoomEditor(original), pose = original.placed.wheel;
    editor.select('wheel'); editor.preview({ ...pose, x: 99 });
    expect(editor.storeSelected()).toBe(true);
    expect(editor.draft.placed.wheel).toBeUndefined(); expect(editor.previewPose).toBeUndefined();
    expect(editor.selectedId).toBeUndefined();
    expect(editor.draft.unplaced).toEqual([...original.unplaced, { id: 'wheel', pose, reason: 'Stored in inventory', stored: true }]);
    expect(original.placed.wheel).toEqual(pose);
    expect(editor.storeSelected()).toBe(false);
    editor.undo(); expect(editor.draft).toEqual(original);
    editor.redo(); expect(editor.draft.placed.wheel).toBeUndefined();
    editor.select('wheel'); expect(editor.commitPreview()).toBe(true);
    expect(editor.draft).toEqual(original);
    editor.undo(); expect(editor.draft.unplaced[0].stored).toBe(true);
  });
  it('keeps previews isolated, rolls back invalid drops, and preserves the caller layout', () => {
    const original = spareTable(), before = JSON.stringify(original), editor = new RoomEditor(original);
    expect(validateRoomLayout(original)).toBeUndefined();
    editor.select('table-1'); editor.preview({ x: -1.63, z: .13, turn: 0 });
    expect(editor.previewPose).toEqual({ x: -1.75, z: .25, turn: 0 });
    expect(editor.draft.placed['table-1']).toEqual(original.placed['table-1']);
    expect(editor.commitPreview()).toBe(true);
    expect(editor.canUndo).toBe(true);
    const committed = JSON.stringify(editor.draft);
    editor.preview({ x: 100, z: 100, turn: 0 });
    expect(editor.previewError).toBeTruthy(); expect(editor.commitPreview()).toBe(false);
    expect(JSON.stringify(editor.draft)).toBe(committed); expect(editor.error).toBeTruthy();
    expect(JSON.stringify(original)).toBe(before);
    editor.undo(); expect(editor.draft).toEqual(original);
    editor.redo(); expect(JSON.stringify(editor.draft)).toBe(committed);
  });

  it('clears redo on a new edit and limits retained undo history', () => {
    const editor = new RoomEditor(spareTable()); editor.select('table-1');
    for (let i = 0; i < 105; i++) expect(editor.rotate()).toBe(true);
    let count = 0;
    while (editor.canUndo) { editor.undo(); count++; }
    expect(count).toBe(100); expect(editor.canRedo).toBe(true);
    editor.redo(); editor.nudge(1, 0); expect(editor.canRedo).toBe(false);
  });

  it('recovers an unplaced item only after a valid drop and can undo that recovery', () => {
    const original = spareTable();
    const pose = original.placed['table-1']; delete original.placed['table-1'];
    original.unplaced.push({ id: 'table-1', pose: { ...pose, x: 99 }, reason: 'Outside the updated room' });
    const editor = new RoomEditor(original); editor.select('table-1');
    expect(editor.previewError).toBeTruthy(); expect(editor.draft.placed['table-1']).toBeUndefined();
    editor.preview(pose, false); expect(editor.commitPreview()).toBe(true);
    expect(editor.draft.unplaced.some(item => item.id === 'table-1')).toBe(false);
    editor.undo(); expect(editor.draft).toEqual(original);
    editor.select('retired-chair'); expect(editor.previewPose).toBeUndefined();
  });

  it('loads and resets as one undoable operation and exports only committed state', () => {
    const original = spareTable(), editor = new RoomEditor(original);
    editor.reset(); expect(editor.canUndo).toBe(true); editor.undo(); expect(editor.draft).toEqual(original);
    editor.select('table-1'); editor.preview({ x: 99, z: 99, turn: 0 });
    const file = JSON.parse(editor.export()); expect(file.layout.placed).toEqual(original.placed);
    editor.cancelPreview(); expect(editor.displayLayout).toEqual(original);
  });
});

describe('room layout files and slots', () => {
  it('seeds all new slots and resets/exports with independent copies of the selected default', () => {
    const memory = new MemoryStorage(), store = new RoomLayoutStore(memory), preset = defaultRoomLayout();
    expect(store.activeSlot).toBe(0); expect(store.slots).toEqual([preset, preset, preset]);
    expect(memory.writes).toEqual([]);
    store.slots[0].placed.sofa.x = 100; store.slots[0].unplaced[0].pose!.x = 100;
    expect(store.slots[1]).toEqual(preset); expect(store.slots[2]).toEqual(preset);
    const editor = new RoomEditor(spareTable()); editor.reset();
    expect(editor.draft).toEqual(preset);
    expect(importRoomLayout(editor.export())).toEqual(preset);
  });
  it('preserves all existing saved slots and active selection when the bundled default changes', () => {
    const memory = new MemoryStorage(), first = spareTable(), second = defaultRoomLayout(), third = spareTable();
    first.placed['table-1'] = { x: -2.25, z: 0, turn: 1 };
    third.placed['table-1'] = { x: -1.5, z: 0, turn: 2 };
    const record = { formatVersion: 1, activeSlot: 2, slots: [first, second, third] }, raw = JSON.stringify(record);
    memory.values.set(ROOM_LAYOUT_STORAGE_KEY, raw);
    const store = new RoomLayoutStore(memory);
    expect(store.activeSlot).toBe(2); expect(store.slots).toEqual(record.slots);
    expect(store.load().placed).toEqual(third.placed);
    expect(store.load().unplaced).toEqual([...third.unplaced].sort((a,b) => a.id.localeCompare(b.id)));
    expect(memory.getItem(ROOM_LAYOUT_STORAGE_KEY)).toBe(raw); expect(memory.writes).toEqual([]);
  });
  it('persists inventory through slots and files without warnings, while still reporting update omissions and retired items', () => {
    const editor = new RoomEditor(defaultRoomLayout()); editor.select('wheel'); editor.storeSelected();
    const memory = new MemoryStorage(), store = new RoomLayoutStore(memory);
    store.save(1, importRoomLayout(editor.export()));
    const reload = new RoomLayoutStore(memory), layout = reload.load();
    expect(layout.placed.wheel).toBeUndefined();
    expect(layout.unplaced.find(item => item.id === 'wheel')).toMatchObject({ id: 'wheel', stored: true, pose: defaultRoomLayout().placed.wheel });
    expect(reload.noticeNeeded(1, layout)).toBe(false);
    layout.placed['table-1'].x = 99;
    const updated = reconcileRoomLayout(layout);
    expect(reload.noticeNeeded(1, updated)).toBe(true);
    expect(roomLayoutWarnings(updated).map(item => item.id)).toEqual(['table-1']);
    const retired = reconcileRoomLayout(layout, { ...DEFAULT_LAYOUT_ENVIRONMENT,
      definitions: DEFAULT_LAYOUT_ENVIRONMENT.definitions.filter(def => def.id !== 'wheel') });
    expect(roomLayoutWarnings(retired).find(item => item.id === 'wheel')?.reason).toBe('Furniture is no longer available');
    const malformed = JSON.parse(editor.export()); malformed.layout.unplaced[0].stored = 'yes';
    expect(() => importRoomLayout(JSON.stringify(malformed))).toThrow(/inventory/);
  });
  it('rejects malformed, oversized, duplicate and unsupported input without changing a draft', () => {
    const editor = new RoomEditor(spareTable()), before = JSON.stringify(editor.draft);
    for (const text of ['{', JSON.stringify({ formatVersion: 99, layout: spareTable() }), ' '.repeat(102401),
      '{"formatVersion":1,"formatVersion":1,"layout":{}}']) expect(() => editor.import(text)).toThrow();
    const bad = spareTable(); bad.unplaced.push({ id: 'table-1', reason: 'duplicate' });
    expect(() => parseRoomLayout(bad)).toThrow(/Duplicate/);
    for (const pose of [{ x: null, z: 0, turn: 0 }, { x: 0, z: 0, turn: 4 }, { x: 0, z: 0, turn: .5 }]) {
      expect(() => parseRoomLayout({ roomRevision: 1, placed: { table: pose }, unplaced: [] })).toThrow();
    }
    expect(JSON.stringify(editor.draft)).toBe(before);
  });

  it('round-trips unavailable furniture and its last position', () => {
    const original = spareTable(); original.unplaced.push({ id: 'retired-chair', pose: { x: -2, z: 1, turn: 1 }, reason: 'No longer available' });
    const restored = importRoomLayout(new RoomEditor(original).export());
    expect(restored.unplaced.find(item => item.id === 'retired-chair')).toMatchObject({ id: 'retired-chair', pose: { x: -2, z: 1, turn: 1 } });
  });

  it('copies into a destination slot without changing the source; failed persistence is atomic', () => {
    const memory = new MemoryStorage(), store = new RoomLayoutStore(memory), source = JSON.stringify(store.slots[0]);
    store.save(1, spareTable()); expect(store.activeSlot).toBe(1); expect(JSON.stringify(store.slots[0])).toBe(source);
    const reload = new RoomLayoutStore(memory); expect(reload.activeSlot).toBe(1); expect(reload.slots[1]).toEqual(spareTable());
    const previous = JSON.stringify(store.slots); memory.fail = true;
    expect(() => store.save(2, spareTable())).toThrow(/saved/);
    expect(JSON.stringify(store.slots)).toBe(previous); expect(store.activeSlot).toBe(1);
    store.useForSession(2, spareTable()); expect(store.activeSlot).toBe(2);
    expect(new RoomLayoutStore(memory).activeSlot).toBe(1);
  });

  it('reconciles on load without overwriting stored layouts and acknowledges notices separately', () => {
    const memory = new MemoryStorage(), saved = defaultRoomLayout();
    saved.placed['table-1'] = { x: 999, z: 999, turn: 0 };
    memory.values.set(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify({ formatVersion: 1, activeSlot: 0, slots: [saved, saved, saved] }));
    const raw = memory.getItem(ROOM_LAYOUT_STORAGE_KEY), store = new RoomLayoutStore(memory), resolved = store.load();
    expect(resolved.placed['table-1']).toBeUndefined(); expect(resolved.unplaced.some(item => item.id === 'table-1')).toBe(true);
    expect(memory.writes).toEqual([]); expect(store.noticeNeeded(0, resolved)).toBe(true);
    store.acknowledge(0, resolved); expect(memory.writes).toEqual([ROOM_LAYOUT_NOTICE_KEY]);
    expect(memory.getItem(ROOM_LAYOUT_STORAGE_KEY)).toBe(raw);
    const reload = new RoomLayoutStore(memory); expect(reload.noticeNeeded(0, reload.load())).toBe(false);
    expect(reload.noticeNeeded(1, resolved)).toBe(true);
  });

  it('keeps corrupt saves intact for recovery', () => {
    const memory = new MemoryStorage(); memory.values.set(ROOM_LAYOUT_STORAGE_KEY, '{broken');
    const store = new RoomLayoutStore(memory); expect(store.error).toBeTruthy();
    expect(memory.getItem(ROOM_LAYOUT_STORAGE_KEY)).toBe('{broken'); expect(memory.writes).toEqual([]);
  });
});

describe('editor camera and picking', () => {
  it('switches to an orbitable perspective and restores the overhead camera without changing the layout', () => {
    const view = new RoomEditorView(); view.resize({ x: 6, y: 108, w: 400, h: 650 });
    const overhead = view.camera, position = overhead.position.clone(), orientation = overhead.quaternion.clone();
    view.toggleView(); expect(view.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    const before = view.camera.position.clone(); view.orbitPixels(70, 25);
    expect(view.camera.position.distanceTo(before)).toBeGreaterThan(1);
    const hit = view.floorPoint({ x: 206, y: 433 })!;
    expect(hit.x).toBeCloseTo(view.target.x); expect(hit.z).toBeCloseTo(view.target.z);
    view.toggleView(); expect(view.camera).toBe(overhead);
    expect(overhead.position.distanceTo(position)).toBeLessThan(.0001);
    expect(overhead.quaternion.angleTo(orientation)).toBeLessThan(.0001); view.dispose();
  });
  it('anchors selection controls inside the room viewport in both camera modes', () => {
    const view = new RoomEditorView(), viewport = { x: 6, y: 108, w: 308, h: 350 }; view.resize(viewport);
    for (const free of [false, true]) {
      if (free) view.toggleView();
      const anchor = view.selectionAnchor('table-1', { x: -2, z: 0, turn: 1 }, .8)!;
      expect(anchor).toBeDefined(); expect(anchor.x).toBeGreaterThanOrEqual(viewport.x);
      expect(anchor.x + 94).toBeLessThanOrEqual(viewport.x + viewport.w);
      expect(anchor.y).toBeGreaterThanOrEqual(viewport.y); expect(anchor.y + 44).toBeLessThanOrEqual(viewport.y + viewport.h);
      expect(view.selectionAnchor('table-1', { x: 999, z: 999, turn: 0 }, .8)).toBeUndefined();
    }
    view.dispose();
  });
  it('maps floor points accurately after pan, zoom and view turns', () => {
    const view = new RoomEditorView(); view.resize({ x: 20, y: 80, w: 500, h: 650 });
    const center = { x: 270, y: 405 };
    expect(view.floorPoint(center)?.x).toBeCloseTo(view.target.x);
    expect(view.floorPoint(center)?.z).toBeCloseTo(view.target.z);
    view.panPixels(40, 20); view.zoomBy(2); view.turn();
    expect(view.floorPoint(center)?.x).toBeCloseTo(view.target.x);
    expect(view.floorPoint(center)?.z).toBeCloseTo(view.target.z);
    view.fit(); expect(view.camera.zoom).toBe(1); view.dispose();
  });
  it('ignores shadow meshes and hidden furniture when picking', () => {
    const view = new RoomEditorView(); view.resize({ x: 0, y: 0, w: 400, h: 400 });
    const root = new THREE.Group(), item = new THREE.Group(); item.userData.furnitureId = 'table-1'; root.add(item);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2), new THREE.MeshBasicMaterial());
    mesh.position.set(view.target.x, .5, view.target.z); item.add(mesh);
    const p = mesh.position.clone().project(view.camera), point = { x: (p.x + 1) * 200, y: (1 - p.y) * 200 };
    expect(view.pick(root, point)).toBe('table-1');
    mesh.userData.contactShadow = true; expect(view.pick(root, point)).toBeUndefined();
    mesh.userData.contactShadow = false; item.visible = false; expect(view.pick(root, point)).toBeUndefined();
    mesh.geometry.dispose(); mesh.material.dispose(); view.dispose();
  });
});
