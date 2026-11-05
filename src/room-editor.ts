import {
  FURNITURE_DEFINITIONS, cloneRoomLayout, defaultRoomLayout, reconcileRoomLayout, validateRoomLayout,
  type FurniturePose, type RoomLayout,
} from './room-layout';

export const ROOM_LAYOUT_STORAGE_KEY = 'catslave-room-layouts';
export const ROOM_LAYOUT_NOTICE_KEY = 'catslave-room-layout-notices';
export const ROOM_LAYOUT_FORMAT = 1;
export const ROOM_LAYOUT_MAX_BYTES = 100 * 1024;
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;
export interface RoomLayoutSave { formatVersion: 1; activeSlot: number; slots: RoomLayout[]; }
export interface RoomLayoutFile { formatVersion: 1; layout: RoomLayout; }

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function readPose(value: unknown): FurniturePose {
  if (!object(value) || !Number.isFinite(value.x) || !Number.isFinite(value.z)
    || !Number.isInteger(value.turn) || Number(value.turn) < 0 || Number(value.turn) > 3) {
    throw new Error('Invalid furniture position or rotation.');
  }
  return { x: Number(value.x), z: Number(value.z), turn: Number(value.turn) as FurniturePose['turn'] };
}
function readId(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 100 || ['__proto__', 'prototype', 'constructor'].includes(value)) {
    throw new Error('Invalid furniture ID.');
  }
  return value;
}
/** Validate data structure before reconciliation; unknown furniture IDs remain recoverable. */
export function parseRoomLayout(value: unknown): RoomLayout {
  if (!object(value) || !Number.isSafeInteger(value.roomRevision) || Number(value.roomRevision) < 1
    || !object(value.placed) || !Array.isArray(value.unplaced)) throw new Error('Invalid room layout file.');
  const placed: RoomLayout['placed'] = {}, unplaced: RoomLayout['unplaced'] = [], seen = new Set<string>();
  for (const [rawId, rawPose] of Object.entries(value.placed)) {
    const id = readId(rawId); seen.add(id); placed[id] = readPose(rawPose);
  }
  for (const entry of value.unplaced) {
    if (!object(entry)) throw new Error('Invalid unplaced furniture entry.');
    const id = readId(entry.id);
    if (seen.has(id)) throw new Error('Duplicate furniture ID.');
    if (typeof entry.reason !== 'string' || entry.reason.length > 500) throw new Error('Invalid unplaced furniture reason.');
    if (entry.stored !== undefined && typeof entry.stored !== 'boolean') throw new Error('Invalid inventory status.');
    seen.add(id); unplaced.push({ id, ...(entry.pose === undefined ? {} : { pose: readPose(entry.pose) }), reason: entry.reason,
      ...(entry.stored === true ? { stored: true } : {}) });
  }
  if (seen.size > 500) throw new Error('Too many furniture entries.');
  return { roomRevision: Number(value.roomRevision), placed, unplaced };
}

/** JSON.parse alone silently keeps the final occurrence of duplicate object keys. */
function parseJson(text: string): unknown {
  if (new TextEncoder().encode(text).byteLength > ROOM_LAYOUT_MAX_BYTES) throw new Error('Layout files must be smaller than 100 KB.');
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}\[\],:]|[^\s{}\[\],:]+/g) ?? [];
  const frames: { object: boolean; keys: Set<string>; expectKey: boolean }[] = [];
  for (const token of tokens) {
    const frame = frames.at(-1);
    if (token === '{' || token === '[') frames.push({ object: token === '{', keys: new Set(), expectKey: token === '{' });
    else if (token === '}' || token === ']') frames.pop();
    else if (token === ',') { if (frame?.object) frame.expectKey = true; }
    else if (frame?.object && frame.expectKey && token.startsWith('"')) {
      const key = JSON.parse(token) as string;
      if (frame.keys.has(key)) throw new Error('Duplicate furniture ID or JSON field.');
      frame.keys.add(key); frame.expectKey = false;
    }
  }
  try { return JSON.parse(text); } catch { throw new Error('Invalid room layout JSON.'); }
}

export function importRoomLayout(text: string): RoomLayout {
  const value = parseJson(text);
  if (!object(value) || value.formatVersion !== ROOM_LAYOUT_FORMAT) throw new Error('Unsupported room layout file version.');
  return reconcileRoomLayout(parseRoomLayout(value.layout));
}

function browserStorage(): StorageAccess | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}
function checkSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 2) throw new Error('Choose room slot 1, 2 or 3.');
}
export function roomLayoutWarnings(layout: RoomLayout) { return layout.unplaced.filter(item => !item.stored); }
function noticeSignature(slot: number, layout: RoomLayout) {
  return JSON.stringify([slot, layout.roomRevision, roomLayoutWarnings(layout).map(item => [item.id, item.reason, item.pose]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}

/** Reads are side-effect free: a room update never overwrites the player's original slots. */
export class RoomLayoutStore {
  activeSlot = 0;
  slots = [defaultRoomLayout(), defaultRoomLayout(), defaultRoomLayout()];
  error?: string;
  private acknowledgements = new Set<string>();
  constructor(private storage: StorageAccess | undefined = browserStorage()) {
    try {
      const text = storage?.getItem(ROOM_LAYOUT_STORAGE_KEY);
      if (text) {
        const value = parseJson(text);
        if (!object(value) || value.formatVersion !== ROOM_LAYOUT_FORMAT || !Array.isArray(value.slots) || value.slots.length !== 3) {
          throw new Error('Unsupported or invalid room save. Original save kept.');
        }
        checkSlot(Number(value.activeSlot));
        if (typeof value.activeSlot !== 'number') throw new Error('Invalid active room slot.');
        const slots = value.slots.map(parseRoomLayout);
        this.activeSlot = value.activeSlot; this.slots = slots;
      }
    } catch (error) { this.error = error instanceof Error ? error.message : 'The saved room could not be read. Original save kept.'; }
    try {
      const values: unknown = JSON.parse(storage?.getItem(ROOM_LAYOUT_NOTICE_KEY) ?? '[]');
      if (Array.isArray(values)) this.acknowledgements = new Set(values.filter((x): x is string => typeof x === 'string').slice(-30));
    } catch { /* A failed acknowledgement read does not affect room data. */ }
  }
  load(slot = this.activeSlot) { checkSlot(slot); return reconcileRoomLayout(cloneRoomLayout(this.slots[slot])); }
  save(slot: number, layout: RoomLayout) {
    checkSlot(slot);
    const reason = validateRoomLayout(layout);
    if (reason) throw new Error(reason);
    const next = this.slots.map(cloneRoomLayout); next[slot] = cloneRoomLayout(layout);
    const record: RoomLayoutSave = { formatVersion: 1, activeSlot: slot, slots: next };
    if (!this.storage) throw new Error('Room storage is unavailable. Export or use this layout for this session.');
    try { this.storage.setItem(ROOM_LAYOUT_STORAGE_KEY, JSON.stringify(record)); }
    catch { throw new Error('Room could not be saved. Retry, export, or use it for this session.'); }
    this.slots = next; this.activeSlot = slot; this.error = undefined;
  }
  useForSession(slot: number, layout: RoomLayout) {
    checkSlot(slot);
    const reason = validateRoomLayout(layout); if (reason) throw new Error(reason);
    this.slots[slot] = cloneRoomLayout(layout); this.activeSlot = slot;
  }
  noticeNeeded(slot: number, layout: RoomLayout) {
    return roomLayoutWarnings(layout).length > 0 && !this.acknowledgements.has(noticeSignature(slot, layout));
  }
  acknowledge(slot: number, layout: RoomLayout) {
    this.acknowledgements.add(noticeSignature(slot, layout));
    const values = [...this.acknowledgements].slice(-30); this.acknowledgements = new Set(values);
    try { this.storage?.setItem(ROOM_LAYOUT_NOTICE_KEY, JSON.stringify(values)); } catch { /* Remember acknowledgement for this session. */ }
  }
}

/** Draft operations never mutate the active room or a stored slot. */
export class RoomEditor {
  draft: RoomLayout;
  selectedId?: string;
  snap = true;
  previewPose?: FurniturePose;
  previewError?: string;
  error?: string;
  private past: RoomLayout[] = [];
  private future: RoomLayout[] = [];
  private previewLayout?: RoomLayout;
  constructor(layout: RoomLayout) { this.draft = cloneRoomLayout(layout); }
  get displayLayout() { return this.previewLayout ?? this.draft; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  select(id?: string) {
    this.cancelPreview(); this.selectedId = id; this.error = undefined;
    if (id && !this.draft.placed[id]) {
      const definition = FURNITURE_DEFINITIONS.find(item => item.id === id);
      if (definition) this.preview(this.draft.unplaced.find(item => item.id === id)?.pose ?? definition.defaultPose, false);
    }
  }
  preview(pose: FurniturePose, snap = this.snap) {
    const id = this.selectedId;
    if (!id || !FURNITURE_DEFINITIONS.some(item => item.id === id)) return;
    const next = cloneRoomLayout(this.draft);
    this.previewPose = { ...pose, x: snap ? Math.round(pose.x * 4) / 4 : pose.x, z: snap ? Math.round(pose.z * 4) / 4 : pose.z };
    next.placed[id] = { ...this.previewPose }; next.unplaced = next.unplaced.filter(item => item.id !== id);
    this.previewLayout = next; this.previewError = validateRoomLayout(next); this.error = undefined;
  }
  commitPreview() {
    if (!this.previewLayout) return false;
    if (this.previewError) {
      const reason = this.previewError; this.cancelPreview(); this.error = reason; return false;
    }
    const next = this.previewLayout; this.cancelPreview(); this.replace(next); return true;
  }
  cancelPreview() { this.previewLayout = undefined; this.previewPose = undefined; this.previewError = undefined; }
  private replace(layout: RoomLayout) {
    if (JSON.stringify(layout) === JSON.stringify(this.draft)) return;
    this.past.push(cloneRoomLayout(this.draft)); if (this.past.length > 100) this.past.shift();
    this.future = []; this.draft = cloneRoomLayout(layout); this.error = undefined;
  }
  private selectedPose() {
    if (!this.selectedId) return undefined;
    return this.previewPose ?? this.draft.placed[this.selectedId]
      ?? this.draft.unplaced.find(item => item.id === this.selectedId)?.pose
      ?? FURNITURE_DEFINITIONS.find(item => item.id === this.selectedId)?.defaultPose;
  }
  rotate(direction = 1) {
    const pose = this.selectedPose(); if (!pose) return false;
    this.preview({ ...pose, turn: ((pose.turn + direction + 4) % 4) as FurniturePose['turn'] }, false);
    return this.commitPreview();
  }
  storeSelected() {
    const id = this.selectedId, pose = id ? this.draft.placed[id] : undefined;
    if (!id || !pose) return false;
    this.cancelPreview();
    const next = cloneRoomLayout(this.draft);
    delete next.placed[id];
    next.unplaced.push({ id, pose: { ...pose }, reason: 'Stored in inventory', stored: true });
    this.replace(next); this.selectedId = undefined;
    return true;
  }
  nudge(dx: number, dz: number) {
    const pose = this.selectedPose(); if (!pose) return false;
    const step = this.snap ? .25 : .05;
    this.preview({ ...pose, x: pose.x + dx * step, z: pose.z + dz * step }, false); return this.commitPreview();
  }
  undo() {
    this.cancelPreview(); const previous = this.past.pop(); if (!previous) return;
    this.future.push(cloneRoomLayout(this.draft)); this.draft = previous; this.error = undefined;
  }
  redo() {
    this.cancelPreview(); const next = this.future.pop(); if (!next) return;
    this.past.push(cloneRoomLayout(this.draft)); this.draft = next; this.error = undefined;
  }
  reset() { this.load(defaultRoomLayout()); }
  load(layout: RoomLayout) { this.cancelPreview(); this.replace(reconcileRoomLayout(cloneRoomLayout(layout))); this.selectedId = undefined; }
  import(text: string) { this.load(importRoomLayout(text)); }
  export() {
    const reason = validateRoomLayout(this.draft); if (reason) throw new Error(reason);
    return JSON.stringify({ formatVersion: 1, layout: this.draft } satisfies RoomLayoutFile, null, 2);
  }
}
