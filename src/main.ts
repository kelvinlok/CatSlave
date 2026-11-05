import { restoreRoomTextures } from './room-asset';
import { MAIN_VIEW } from './room-camera';
import { getLanguage, setLanguage, syncDocumentLanguage, translate } from './i18n';
import * as THREE from 'three';
import './style.css';
import { Game } from './simulation';
import { World } from './world';
import { Hud } from './hud';
import { Gesture, type GestureResult } from './gestures';
import { PALETTE, TOOLS, TOOL_BY_ID, toolMatches } from './config';
import type { Point, ToolId } from './types';
import { portraitViewport } from './layout';
import { GyroLook } from './gyro';
import { GameAudio, RoomSounds } from './sound';
import { isBlenderCat, preloadBlenderCatAsset, restoreBlenderCatTextures } from './blender-cat-asset';
import { RoomEditor, RoomLayoutStore, ROOM_LAYOUT_MAX_BYTES } from './room-editor';
import { RoomEditorView } from './room-editor-view';
import { FURNITURE_DEFINITIONS, validateRoomLayout, type FurniturePose } from './room-layout';
import { furnitureGroups, type FurnitureFilter } from './furniture-catalog';
import { FurniturePreviews } from './furniture-previews';
import { RoomLayoutPreviews } from './room-layout-previews';
import { costumeItems, isCostumeSlot, isCostumeItemId } from './wardrobe';
import { wardrobeMaxOffset } from './wardrobe-ui';

syncDocumentLanguage();
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch {
  // If WebGL cannot initialize, the same canvas communicates the limitation.
  // It is the only non-WebGL screen; the actual game never uses DOM UI.
  const replacement = canvas.cloneNode() as HTMLCanvasElement; canvas.replaceWith(replacement);
  replacement.width = innerWidth; replacement.height = innerHeight;
  const context = replacement.getContext('2d')!;
  context.fillStyle = '#f6f1e7'; context.fillRect(0, 0, innerWidth, innerHeight);
  context.fillStyle = '#203e36'; context.font = '28px Georgia'; context.textAlign = 'center';
  context.fillText(translate('This room needs WebGL 2.'), innerWidth / 2, innerHeight / 2 - 20);
  context.font = '14px Arial'; context.fillText(translate('Try a browser with hardware acceleration enabled.'), innerWidth / 2, innerHeight / 2 + 20);
  throw new Error('WebGL 2 is unavailable.');
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.autoClear = false;
renderer.info.autoReset = false;
renderer.setClearColor('#f6f1e7');
renderer.clear();
const game = new Game(import.meta.env.MODE === 'test' ? 42 : undefined);
try { game.restoreFreePlay(JSON.parse(localStorage.getItem('catslave-free-play') ?? 'null')); } catch { /* Storage may be unavailable. */ }
try { game.restoreAdoptedCats(JSON.parse(localStorage.getItem('catslave-cat-dex') ?? 'null')); } catch { /* Keep session progress when storage is unavailable. */ }
try { const saved = localStorage.getItem('catslave-wardrobe'); if (saved) game.wardrobe.restore(saved); } catch { /* Dressing still works for this session. */ }
let savedAdoptedCats = '';
let savedFreeRoster = JSON.stringify(game.freePlayRoster);
// Standalone entry is a test fixture; players encounter Pawdicure in bonus rounds.
if (import.meta.env.MODE === 'test' && new URLSearchParams(location.search).get('minigame') === 'pawdicure') game.startPawdicurePractice();
const world = new World();
const hud = new Hud();
const furniturePreviews = new FurniturePreviews();
hud.roomThumbnails = furniturePreviews.images;
const layoutPreviews = new RoomLayoutPreviews();
hud.roomLayoutImages = layoutPreviews.images;
const gesture = new Gesture();
const audio = new GameAudio();
audio.bindTouchUnlock(canvas);
const roomSounds = new RoomSounds();
hud.soundLabel = audio.label;
const gyro = new GyroLook(() => { hud.gyroStatus = gyro.status; hud.invalidate(); }, () => world.camera.quaternion);
let pointerId: number | undefined;
let contextLost = false;
let previousPhase = game.phase;
let previousRevision = game.revision;
let lastTime = performance.now();
let width = innerWidth, height = innerHeight;
let fpsFrames = 0, fpsTime = 0, fps = 60;
let manualClock = false;
let resetFrameClock = false;

function finishEntrance() {
  world.finishEntrance(); resetFrameClock = true;
  gyro.recenter(world.camera.quaternion); hud.invalidate();
}

let freeDrag: { point: Point; pan: boolean; mode: 'camera' | 'pet' | 'wand' } | undefined;
const freeCameraTouches = new Map<number, Point>();
let dexDrag: Point | undefined;
let wardrobeDrag: { start: Point; offset: number; item?: string; moved: boolean } | undefined;
const movementKeys = new Set<string>();
const roomStore = new RoomLayoutStore();
let editorView: RoomEditorView | undefined;
const editorPointers = new Map<number, Point>();
let editorDrag: { offset: Point; pose: FurniturePose } | undefined;
let editorPointerMode: 'move' | 'pan' | 'orbit' | undefined;
const furnitureHeights = new Map<string, number>();
let lastRoomEditable = false;

function refreshEditor() {
  const editor = hud.roomEditor;
  hud.roomSelection = undefined;
  world.editorLayout = editor?.displayLayout;
  if (editor && editorView) {
    editorView.resize(hud.worldViewport(game));
    const id = editor.selectedId, pose = editor.previewPose ?? (id ? editor.draft.placed[id] : undefined);
    editorView.highlight(id, pose, !editor.previewError);
    editorView.setGridVisible(editor.snap);
    hud.roomFreeView = editorView.freeView;
    if (id && pose && !editorPointers.size) {
      if (!furnitureHeights.has(id)) {
        const root = world.roomRoot.getObjectByName(`furniture:${id}`);
        if (root) furnitureHeights.set(id, new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y);
      }
      hud.roomSelection = editorView.selectionAnchor(id, pose, furnitureHeights.get(id) ?? 1);
    }
  }
  hud.invalidate();
}
function cancelEditorPointers() {
  if (editorDrag) hud.roomEditor?.cancelPreview();
  editorDrag = undefined; editorPointerMode = undefined;
  const captured = [...editorPointers.keys()]; editorPointers.clear();
  for (const id of captured) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  if (hud.roomEditor) refreshEditor();
}
function enterRoomEditor() {
  if (!world.roomEditable || !['free-play', 'room-notice'].includes(game.phase)) return;
  if (game.phase === 'room-notice' && hud.roomNotice) roomStore.acknowledge(roomStore.activeSlot, hud.roomNotice);
  cancelGesture();
  hud.roomEditor = new RoomEditor(hud.roomResumeBlocked && hud.roomNotice ? hud.roomNotice : game.roomLayout.layout);
  hud.roomPanel = 'none'; hud.roomPage = 0; hud.roomSlot = roomStore.activeSlot;
  hud.roomMessage = ''; hud.roomToast = undefined; if (!hud.roomResumeBlocked) hud.roomNotice = undefined;
  game.phase = 'room-editor'; previousPhase = game.phase; game.revision++;
  if (!editorView) { editorView = new RoomEditorView(); world.scene.add(editorView.overlay); }
  editorView.freeView = false; editorView.overlay.visible = true; editorView.resize(hud.worldViewport(game)); editorView.fit();
  refreshEditor();
}
function leaveRoomEditor(apply: boolean) {
  const editor = hud.roomEditor;
  if (!editor) return;
  if (apply && !game.applyRoomLayout(editor.draft)) { editor.error = 'There is not enough clear floor for the cats.'; refreshEditor(); return; }
  cancelEditorPointers();
  hud.roomEditor = undefined; hud.roomPanel = 'none'; hud.roomToast = undefined; world.editorLayout = undefined;
  if (editorView) editorView.overlay.visible = false;
  if (apply) hud.roomResumeBlocked = false;
  game.phase = hud.roomResumeBlocked ? 'room-notice' : 'free-play'; previousPhase = game.phase; game.revision++;
  if (hud.roomResumeBlocked) hud.roomMessage = 'There is not enough clear floor for the cats.';
  lastTime = performance.now(); resetFrameClock = true; gyro.recenter(world.camera.quaternion);
  hud.invalidate();
}
function loadFreeRoom() {
  const layout = roomStore.load();
  hud.roomResumeBlocked = !game.applyRoomLayout(layout);
  hud.roomSlot = roomStore.activeSlot;
  if (roomStore.noticeNeeded(roomStore.activeSlot, layout) || roomStore.error || hud.roomResumeBlocked) {
    hud.roomNotice = layout; hud.roomMessage = hud.roomResumeBlocked ? 'There is not enough clear floor for the cats.' : roomStore.error ?? ''; hud.roomPage = 0;
    game.phase = 'room-notice'; game.revision++;
  }
}
function saveRoom(slot: number, session = false) {
  const editor = hud.roomEditor;
  if (!editor) return;
  editor.cancelPreview();
  const reason = validateRoomLayout(editor.draft);
  if (reason) { editor.error = reason; hud.roomPanel = 'none'; refreshEditor(); return; }
  if (!game.canApplyRoomLayout(editor.draft)) {
    editor.error = 'There is not enough clear floor for the cats.'; hud.roomPanel = 'none'; refreshEditor(); return;
  }
  hud.roomPendingSlot = slot;
  try {
    if (session) roomStore.useForSession(slot, editor.draft); else roomStore.save(slot, editor.draft);
    roomStore.acknowledge(slot, editor.draft); hud.roomSlot = slot; leaveRoomEditor(true);
  } catch (error) {
    hud.roomMessage = error instanceof Error ? error.message : 'Layout could not be saved';
    hud.roomPanel = 'storage'; hud.invalidate();
  }
}
function exportRoom() {
  if (!hud.roomEditor) return;
  try {
    const blob = new Blob([hud.roomEditor.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `catslave-room-${roomStore.activeSlot + 1}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    hud.roomMessage = 'Layout exported.';
  } catch (error) { hud.roomMessage = error instanceof Error ? error.message : 'Export failed.'; }
  hud.invalidate();
}
function importRoom() {
  const editor = hud.roomEditor;
  if (!editor) return;
  // The game HUD stays on canvas; only file selection uses a native browser control.
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file || hud.roomEditor !== editor) return;
    try {
      if (file.size > ROOM_LAYOUT_MAX_BYTES) throw new Error('Layout files must be smaller than 100 KB.');
      const contents = await file.text(); if (hud.roomEditor !== editor) return;
      editor.import(contents);
      if (editor.error) throw new Error(editor.error);
      hud.roomPanel = editor.draft.unplaced.length ? 'unplaced' : 'none'; hud.roomFilter = 'inventory'; hud.roomPage = 0;
      hud.roomMessage = 'Layout imported into your draft. Save to apply.';
    } catch (error) { hud.roomMessage = error instanceof Error ? error.message : 'Import failed.'; }
    refreshEditor();
  };
  input.click();
}
function roomAction(id: string) {
  if (editorPointers.size) cancelEditorPointers();
  if (game.phase === 'room-notice' && (id === 'room:prev' || id === 'room:next')) {
    hud.roomPage = Math.max(0, hud.roomPage + (id === 'room:next' ? 1 : -1)); hud.invalidate(); return;
  }
  if (id === 'room:open' || id === 'room:notice-edit') { enterRoomEditor(); return; }
  if (id === 'room:notice-continue') {
    if (hud.roomResumeBlocked) return;
    if (hud.roomNotice) roomStore.acknowledge(roomStore.activeSlot, hud.roomNotice);
    hud.roomNotice = undefined; roomStore.error = undefined; game.phase = 'free-play'; game.revision++; lastTime = performance.now(); return;
  }
  const editor = hud.roomEditor; if (!editor || !editorView) return;
  const command = id.slice(5);
  if (command === 'cancel') { leaveRoomEditor(false); return; }
  if (['items', 'unplaced', 'slots', 'save'].includes(command)) {
    hud.roomPanel = command as typeof hud.roomPanel; hud.roomPage = 0;
    hud.roomFilter = command === 'unplaced' ? 'inventory' : 'all';
    if (command === 'slots' || command === 'save') {
      hud.roomSlotLayouts = roomStore.slots.map((_, i) => roomStore.load(i));
      layoutPreviews.prepare([{ id: 'draft', layout: editor.draft }, ...hud.roomSlotLayouts.map((layout, i) => ({ id: `slot:${i}`, layout }))]);
    }
  }
  else if (command.startsWith('filter:')) { hud.roomFilter = command.slice(7) as FurnitureFilter; hud.roomPage = 0; }
  else if (command === 'close-panel') { hud.roomPanel = 'none'; }
  else if (command === 'prev') hud.roomPage = Math.max(0, hud.roomPage - 1);
  else if (command === 'next') hud.roomPage++;
  else if (command.startsWith('item:') || command.startsWith('group:')) {
    const group = command.startsWith('group:') ? furnitureGroups(editor.draft).find(group => group.id === command.slice(6)) : undefined;
    const itemId = group ? (hud.roomFilter === 'room' ? group.ids.find(id => editor.draft.placed[id])
      : group.ids.find(id => !editor.draft.placed[id])) ?? group.ids[0] : command.slice(5);
    editor.select(itemId); hud.roomPanel = 'none'; hud.roomMessage = '';
    if (!editor.draft.placed[itemId]) {
      const pose = editor.previewPose ?? FURNITURE_DEFINITIONS.find(def => def.id === itemId)!.defaultPose;
      editor.preview({ ...pose, x: editorView.target.x, z: editorView.target.z });
    }
  }
  else if (command === 'undo') editor.undo();
  else if (command === 'redo') editor.redo();
  else if (command === 'reset') editor.reset();
  else if (command === 'rotate') editor.rotate();
  else if (command === 'store') {
    const label = FURNITURE_DEFINITIONS.find(def => def.id === editor.selectedId)?.label;
    if (editor.storeSelected() && label) { hud.showRoomToast(label); hud.roomMessage = ''; }
  }
  else if (command === 'snap') editor.snap = !editor.snap;
  else if (['left', 'right', 'up', 'down'].includes(command)) {
    const direction = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[command]!;
    editor.nudge(direction[0], direction[1]);
  }
  else if (command === 'view') { editorView.toggleView(); hud.roomMessage = ''; }
  else if (command === 'fit') editorView.fit();
  else if (command === 'in' || command === 'out') editorView.zoomBy(command === 'in' ? 1.2 : 1 / 1.2);
  else if (command.startsWith('load-slot:')) {
    editor.load(roomStore.load(Number(command.slice(10)))); hud.roomPanel = editor.draft.unplaced.length ? 'unplaced' : 'none'; hud.roomFilter = 'inventory';
    hud.roomMessage = 'Layout loaded into your draft. Save to apply.'; hud.roomPage = 0;
  }
  else if (command.startsWith('save-slot:')) {
    const slot = Number(command.slice(10)); hud.roomPendingSlot = slot;
    if (slot !== roomStore.activeSlot) hud.roomPanel = 'confirm'; else saveRoom(slot);
  }
  else if (command === 'confirm-save' || command === 'retry') saveRoom(hud.roomPendingSlot);
  else if (command === 'session') saveRoom(hud.roomPendingSlot, true);
  else if (command === 'export') exportRoom();
  else if (command === 'import') importRoom();
  if (['undo', 'redo', 'reset'].includes(command) || command.startsWith('load-slot:')) { hud.roomToast = undefined; hud.roomMessage = ''; }
  refreshEditor();
}
function updateWorld(dt: number, time: number, effectsDt = dt) {
  const profile = game.phase === 'wardrobe' ? PALETTE[game.wardrobeCatIndex]
    : game.phase === 'cat-dex' && hud.dexCat !== undefined ? PALETTE[hud.dexCat] : undefined;
  if (profile && game.adoptedCats.includes(profile.name) && isBlenderCat(profile.appearance)) {
    void preloadBlenderCatAsset(profile.appearance);
  }
  // Residents go first; prefetch the exact next adoption pair during their stage.
  // Title screens and saved free-play rosters do not trigger speculative loads.
  const cats = game.phase === 'adoption' ? [...game.cats, ...game.candidates] : game.cats;
  for (const cat of cats) if (isBlenderCat(cat.appearance)) void preloadBlenderCatAsset(cat.appearance);
  if (game.phase === 'playing') {
    for (const cat of game.upcomingAdoption) if (isBlenderCat(cat.appearance)) void preloadBlenderCatAsset(cat.appearance);
  }
  world.update(game, dt, time, effectsDt);
  if (world.roomEditable !== lastRoomEditable) { lastRoomEditable = world.roomEditable; hud.invalidate(); }
}
function cancelGesture() {
  cancelEditorPointers();
  const touches = [...freeCameraTouches.keys()]; freeCameraTouches.clear();
  for (const id of touches) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  dexDrag = undefined;
  wardrobeDrag = undefined;
  freeDrag = undefined; world.setFreePointer(undefined); movementKeys.clear();
  gesture.cancel(); hud.pointer = undefined; hud.pointerTool = undefined;
  hud.pressedId = undefined;
  world.carePointer = undefined;
  const captured = pointerId; pointerId = undefined;
  if (captured !== undefined && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
  hud.invalidate();
}
function safeInsets() {
  // Read env() values from the canvas itself; there are no hidden HTML controls.
  canvas.style.setProperty('padding-top', 'env(safe-area-inset-top, 0px)');
  canvas.style.setProperty('padding-bottom', 'env(safe-area-inset-bottom, 0px)');
  canvas.style.setProperty('padding-left', 'env(safe-area-inset-left, 0px)');
  canvas.style.setProperty('padding-right', 'env(safe-area-inset-right, 0px)');
  const computed = getComputedStyle(canvas);
  const top = parseFloat(computed.paddingTop) || 0, bottom = parseFloat(computed.paddingBottom) || 0;
  const left = parseFloat(computed.paddingLeft) || 0, right = parseFloat(computed.paddingRight) || 0;
  canvas.style.padding = '0';
  return { top, bottom, left, right };
}
function resize() {
  cancelGesture();
  const visible = window.visualViewport;
  const viewport = portraitViewport({ x: visible?.offsetLeft ?? 0, y: visible?.offsetTop ?? 0,
    w: Math.round(Math.min(innerWidth, visible?.width ?? innerWidth)), h: Math.round(Math.min(innerHeight, visible?.height ?? innerHeight)) }, matchMedia('(pointer: coarse)').matches);
  width = viewport.w; height = viewport.h;
  hud.rotateRequired = viewport.rotateRequired;
  if (hud.rotateRequired) game.pause('Back in portrait. Ready to continue?');
  canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
  canvas.style.left = viewport.x + 'px'; canvas.style.top = viewport.y + 'px';
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setSize(width, height, false);
  const safe = safeInsets(); hud.resize(width, height, safe.top, safe.bottom, safe.left, safe.right);
  world.resize(width, height, hud.worldViewport(game), game.phase === 'wardrobe');
  if (hud.roomEditor) refreshEditor();
  updateWorld(0, performance.now() / 1000); hud.draw(game, world, 0, true);
  if (!contextLost) renderFrame();
}
function syncWorldViewport() {
  world.dexCatIndex = game.phase === 'cat-dex' ? hud.dexCat : undefined;
  const next = hud.worldViewport(game), current = world.viewport;
  const presentation = game.phase === 'wardrobe';
  if (presentation !== world.isPresentationViewport || next.x !== current.x || next.y !== current.y || next.w !== current.w || next.h !== current.h)
    world.resize(width, height, next, presentation);
}
function renderFrame() {
  const furnitureGallery = game.phase === 'room-editor' && ['items', 'unplaced'].includes(hud.roomPanel);
  const layoutGallery = game.phase === 'room-editor' && ['save', 'slots'].includes(hud.roomPanel);
  const gallery = furnitureGallery || layoutGallery;
  if (furnitureGallery && furniturePreviews.renderNext(renderer, world.roomRoot, hud.roomThumbnailIds)
    || layoutGallery && layoutPreviews.renderNext(renderer, world.roomRoot, hud.roomLayoutRequests)) {
    hud.invalidate(); hud.draw(game, world, 0, true);
  }
  renderer.info.reset(); renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.clear();
  const v = world.viewport;
  renderer.setViewport(v.x, height - v.y - v.h, v.w, v.h);
  renderer.setScissor(v.x, height - v.y - v.h, v.w, v.h); renderer.setScissorTest(true);
  if (!hud.rotateRequired && !gallery) {
    if (game.phase === 'wardrobe' || game.phase === 'cat-dex' && hud.dexCat !== undefined) renderer.render(world.dexScene, world.dexCamera);
    else renderer.render(world.scene, game.phase === 'room-editor' && editorView ? editorView.camera : world.camera);
  }
  renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height);
  renderer.clearDepth(); if (!hud.rotateRequired && game.phase !== 'wardrobe') renderer.render(world.attackScene, world.attackCamera);
  renderer.clearDepth(); renderer.render(hud.scene, hud.camera);
}
function saveWardrobe() {
  try { localStorage.setItem('catslave-wardrobe', JSON.stringify(game.wardrobe.serialize())); game.wardrobeSaveFailed = false; }
  catch { game.wardrobeSaveFailed = true; }
  hud.invalidate();
}
function scrollWardrobe(offset: number) {
  const layout = hud.wardrobeLayout;
  const maximum = wardrobeMaxOffset(costumeItems(game.wardrobeSlot).length, layout);
  game.wardrobeItemOffset = THREE.MathUtils.clamp(offset, 0, maximum);
  hud.invalidate();
}
function wardrobeAction(id: string) {
  if (id === 'wardrobe:open' || id === 'wardrobe:dress') {
    game.openWardrobe(id === 'wardrobe:dress' ? hud.dexCat : undefined);
  } else if (game.phase !== 'wardrobe') return;
  else if (id === 'wardrobe:close') { if (game.wardrobeSaveFailed) saveWardrobe(); game.closeWardrobe(); lastTime = performance.now(); }
  else if (id === 'wardrobe:previous-cat' || id === 'wardrobe:next-cat') game.cycleWardrobeCat(id.includes('previous') ? -1 : 1);
  else if (id.startsWith('wardrobe:category:')) {
    const slot = id.slice('wardrobe:category:'.length); if (isCostumeSlot(slot)) game.chooseWardrobeCategory(slot);
  } else if (id.startsWith('wardrobe:item:')) {
    const item = id.slice('wardrobe:item:'.length); if (isCostumeItemId(item) && game.equipWardrobe(item)) saveWardrobe();
  } else if (id === 'wardrobe:reset') { game.resetWardrobe(); saveWardrobe(); }
  else if (id === 'wardrobe:previous-items' || id === 'wardrobe:next-items') {
    scrollWardrobe(game.wardrobeItemOffset + (id.includes('previous') ? -1 : 1));
  }
  hud.clearInteraction(); audio.setBlocked(!game.running || document.hidden);
  syncWorldViewport(); updateWorld(0, performance.now() / 1000, 0); hud.draw(game, world, 0, true);
}
function action(id: string) {
  // Resolve against the current screen, even if another input arrived before a frame.
  hud.draw(game, world, 0, true);
  if (contextLost || document.hidden || hud.rotateRequired || !hud.controls.some(hit => hit.id === id)) return;
  const keyboardFocus = hud.focusedId;
  if (world.enteringRoom && game.active && !['pause', 'sound', 'language'].includes(id)) finishEntrance();
  const hadVacuum = game.vacuumUnlocked;
  cancelGesture();
  if (id === 'language') {
    setLanguage(getLanguage() === 'yue-Hant' ? 'en' : 'yue-Hant');
    hud.draw(game, world, 0, true);
    syncDocumentLanguage(hud.controls.find(hit => hit.id === hud.focusedId)?.label);
    return;
  }
  if (id === 'sound') { audio.cycleVolume(); hud.soundLabel = audio.label; hud.invalidate(); return; }
  if (id.startsWith('wardrobe:')) {
    wardrobeAction(id);
    if (keyboardFocus && hud.controls.some(hit => hit.id === keyboardFocus)) { hud.focusedId = keyboardFocus; hud.invalidate(); }
    return;
  }
  if (id.startsWith('room:')) {
    roomAction(id); syncWorldViewport(); updateWorld(0, performance.now() / 1000, 0); hud.draw(game, world, 0, true); return;
  }
  if (['learn', 'start', 'restart', 'home', 'confirm-restart', 'confirm-home'].includes(id)) { audio.stop(); roomSounds.reset(); }
  if (game.phase === 'paused' && ['help', 'restart', 'home'].includes(id)) {
    hud.modal = id as 'help' | 'restart' | 'home'; hud.clearInteraction();
    hud.draw(game, world, 0, true); return;
  }
  if (id === 'back') {
    hud.modal = undefined; hud.clearInteraction(); hud.draw(game, world, 0, true); return;
  }
  if (['learn', 'start', 'restart', 'home', 'confirm-restart', 'confirm-home'].includes(id)) { world.resetView(); gyro.recenter(world.camera.quaternion); }
  if (id === 'confirm-restart') { if (game.practiceBonus) game.startPawdicurePractice(); else if (game.resumePhase === 'free-play') { game.phase = 'title'; game.startFreePlay(); loadFreeRoom(); } else game.reset(game.resumePhase === 'tutorial'); }
  else if (id === 'learn') { game.reset(true); }
  else if (id === 'start' || id === 'restart') { game.reset(); }
  else if (id === 'home' || id === 'confirm-home') { game.reset(); game.phase = 'title'; }
  else if (id === 'cat-dex') { game.phase = 'cat-dex'; hud.dexCat = undefined; }
  else if (id === 'dex-back') { if (hud.dexCat !== undefined) hud.dexCat = undefined; else game.phase = 'title'; }
  else if (id === 'dex-reset') world.resetDexRotation();
  else if (id.startsWith('dex-cat:')) hud.dexCat = Number(id.slice(8));
  else if (id === 'free-play') { if (game.startFreePlay()) { loadFreeRoom(); world.resetView(); } }
  else if (id === 'pawdicure-practice') { game.startPawdicurePractice(); world.resetView(); }
  else if (id.startsWith('paw-cat:')) { game.bonus?.paw?.selectCat(Number(id.slice(8))); game.revision++; }
  else if (id === 'paw-clip') {
    const result = game.bonus?.paw?.snip();
    if (result === 'success') { audio.play('pat'); if (game.bonus?.won) audio.play('purr'); }
    else if (result === 'miss') audio.play('reject');
    game.revision++;
  }
  else if (id.startsWith('free-cat:')) { game.chooseFreeCat(Number(id.slice(9))); const cat = game.cats.find(c => c.id === game.selectedFreeCatId); if (cat) world.focusOn(new THREE.Vector3(cat.position.x, cat.elevation + 0.5, cat.position.z)); }
  else if (id.startsWith('free-mode:') && game.phase === 'free-play') { game.freeInteraction = id.slice(10) as 'pet' | 'wand' | 'camera'; game.revision++; }
  else if (id === 'free-camera:look') hud.freeCameraMode = 'look';
  else if (id === 'free-camera:move') hud.freeCameraMode = 'move';
  else if (id === 'pause') game.pause();
  else if (id === 'resume' && !contextLost && !document.hidden) { game.resume(); lastTime = performance.now(); }
  else if (id === 'tutorial-next') { game.advanceTutorial(); }
  else if (id === 'bonus-start') game.startBonus();
  else if (id === 'bonus-continue') game.continueBonus();
  else if (id.startsWith('pat:')) {
    const catId = Number(id.slice(4));
    if (game.pat(catId)) { const cat = game.cats.find(c => c.id === catId); audio.play('pat', cat?.position); audio.play('purr', cat?.position); }
  }
  else if (id.startsWith('tool:')) game.select(id.slice(5) as ToolId);
  else if (id.startsWith('adopt:')) game.adopt(Number(id.slice(6)));
  else if (id.startsWith('upgrade:')) { game.upgrade(id.slice(8) as ToolId); }
  else if ((game.active || game.phase === 'free-play') && id === 'view:in') world.zoomView(0.2);
  else if ((game.active || game.phase === 'free-play') && id === 'view:out') world.zoomView(-0.2);
  else if ((game.active || game.phase === 'free-play') && id === 'view:reset') { world.resetView(); gyro.recenter(world.camera.quaternion); }
  else if ((game.active || game.phase === 'free-play') && id === 'view:gyro') void gyro.toggle();
  else if ((game.active || game.phase === 'free-play') && id.startsWith('focus:')) {
    const care = game.events.find(e => e.id === Number(id.slice(6)));
    if (care) { world.focusOn(world.eventPosition(care)); gyro.recenter(world.camera.quaternion); }
  }
  syncWorldViewport(); updateWorld(0, performance.now() / 1000, 0);
  if (game.active && ['start', 'learn', 'restart', 'confirm-restart'].includes(id)
    && !matchMedia('(prefers-reduced-motion: reduce)').matches) world.startEntrance();
  if (!hadVacuum && game.vacuumUnlocked) hud.celebrateVacuumUnlock();
  audio.setBlocked(!game.running || document.hidden);
  if (id.startsWith('tool:')) audio.play('select');
  hud.clearInteraction(); hud.draw(game, world, 0, true);
  if (keyboardFocus && hud.controls.some(hit => hit.id === keyboardFocus)) { hud.focusedId = keyboardFocus; hud.invalidate(); }
}
function applyGesture(result: GestureResult) {
  if (result.look && game.active) { world.lookView(result.look.x, result.look.y); gyro.recenter(world.camera.quaternion); }
  if (result.eventId !== undefined && result.work) {
    const care = game.events.find(e => e.id === result.eventId);
    if (game.work(result.eventId, result.work) && care) {
      const cat = game.cats.find(c => c.id === care.catId);
      audio.play(game.selected, care.kind === 'boredom' ? cat?.position : care.position);
    }
    if (!game.events.some(e => e.id === result.eventId)) cancelGesture();
  }
  if (result.click) action(result.click);
  hud.invalidate();
}
function careTarget(eventId: number, p: Point) {
  const care = game.events.find(e => e.id === eventId);
  if (!care) return false;
  const hit = hud.hit(p.x, p.y);
  if (hit && hit.eventId === undefined) return false;
  return care.kind === 'boredom' ? world.toyHit(care, p) : hud.careHit(eventId, p);
}
function updateCarePointer(p: Point, movement = 0) {
  const route = gesture.route;
  if (route?.kind !== 'care') return;
  const care = game.events.find(e => e.id === route.eventId);
  if (!care || !toolMatches(route.tool, care.kind)) { world.carePointer = undefined; return; }
  world.setCarePointer(care, p, careTarget(care.id, p), movement);
}
function waveWand(p: Point) {
  world.setFreePointer(p);
  for (const target of world.freeWandTargets(game, p)) game.interactFreeCat('wand', target.catId);
}
function point(event: PointerEvent): Point { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function inDexPreview(p: Point) {
  const v = world.viewport;
  return (game.phase === 'wardrobe' || game.phase === 'cat-dex' && hud.dexCat !== undefined)
    && p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h;
}
function dragFreeCamera(dx: number, dy: number, pan = false) {
  if (pan) world.translateView(-dx * .012, dy * .012, 0);
  else if (hud.freeCameraMode === 'move') world.translateView(dx * .012, 0, dy * .018);
  else world.lookView(dx, dy);
  hud.invalidate();
}
canvas.addEventListener('pointerdown', event => {
  if (game.phase === 'room-editor' && hud.roomPanel === 'none' && pointerId === undefined && !contextLost && !hud.rotateRequired && editorView) {
    const p = point(event), v = world.viewport;
    if (!hud.hit(p.x, p.y) && p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h) {
      event.preventDefault(); canvas.focus({ preventScroll: true }); hud.focusedId = undefined;
      if (editorPointers.size >= 2) return;
      editorPointers.set(event.pointerId, p); canvas.setPointerCapture(event.pointerId);
      const editor = hud.roomEditor!;
      if (editorPointers.size === 2) {
        editor.cancelPreview(); editorDrag = undefined; editorPointerMode = 'pan'; refreshEditor(); return;
      }
      const recovering = editor.selectedId && !editor.draft.placed[editor.selectedId];
      const hitId = recovering ? editor.selectedId : editorView.pick(world.roomRoot, p);
      const floorPoint = editorView.floorPoint(p);
      if (hitId && floorPoint && event.button !== 2) {
        editor.select(hitId);
        const pose = editor.previewPose ?? editor.draft.placed[hitId];
        if (pose) {
          editorDrag = { pose: { ...pose }, offset: recovering ? { x: 0, y: 0 } : { x: pose.x - floorPoint.x, y: pose.z - floorPoint.z } };
          editorPointerMode = 'move';
          if (recovering) editor.preview({ ...pose, x: floorPoint.x, z: floorPoint.z });
        }
      } else { editorPointerMode = editorView.freeView && event.button !== 2 && !event.shiftKey ? 'orbit' : 'pan'; }
      refreshEditor(); return;
    }
  }
  // Camera touches have their own capture set so a second finger can pan/zoom.
  if (event.pointerType === 'touch' && game.phase === 'free-play' && game.freeInteraction === 'camera'
    && !hud.rotateRequired && !contextLost && pointerId === undefined) {
    const p = point(event), v = world.viewport;
    if (p.x >= v.x && p.x <= v.x + v.w && p.y >= v.y && p.y <= v.y + v.h && !hud.hit(p.x, p.y)) {
      event.preventDefault();
      if (freeCameraTouches.size < 2) {
        canvas.focus({ preventScroll: true }); audio.unlock(); hud.focusedId = undefined;
        freeCameraTouches.set(event.pointerId, p); canvas.setPointerCapture(event.pointerId);
      }
      return;
    }
  }
  if (freeCameraTouches.size) return;
  if (hud.rotateRequired || pointerId !== undefined || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0 && !(game.phase === 'free-play' && event.button === 2)) || contextLost) return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  audio.unlock();
  hud.draw(game, world, 0, true);
  const p = point(event); const hit = hud.hit(p.x, p.y);
  if (world.enteringRoom && game.active && !hit) { finishEntrance(); return; }
  hud.focusedId = undefined;
  if (hit?.disabled) return;
  if (game.phase === 'bonus' && hit?.id.startsWith('pat:')) { action(hit.id); return; }
  if (game.phase === 'bonus' && hit?.id === 'paw-clip') { action(hit.id); return; }
  pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId);
  if (game.phase === 'wardrobe') {
    const r = hud.wardrobeLayout.carousel;
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
      wardrobeDrag = { start: p, offset: game.wardrobeItemOffset,
        item: hit?.id.startsWith('wardrobe:item:') ? hit.id : undefined, moved: false };
      hud.pressedId = wardrobeDrag.item; hud.invalidate(); return;
    }
  }
  if (!hit && inDexPreview(p)) { dexDrag = p; canvas.style.cursor = 'grabbing'; return; }
  if (game.phase === 'free-play' && !hit && p.x >= world.viewport.x && p.x <= world.viewport.x + world.viewport.w && p.y >= world.viewport.y && p.y <= world.viewport.y + world.viewport.h) {
    const catId = world.freeCatHit(p);
    if (catId !== undefined && game.freeInteraction === 'pet') game.chooseFreeCat(catId);
    const mode = event.button === 2 ? 'camera' : game.freeInteraction;
    if (mode === 'pet' && catId === undefined && world.wheelHit(p)) {
      game.inviteFreeCatToWheel();
      hud.invalidate(); return;
    }
    freeDrag = { point: p, pan: event.button === 2 || event.shiftKey, mode };
    if (mode === 'pet' && game.selectedFreeCatId !== undefined && world.freePetHit(game.selectedFreeCatId, p)) {
      game.interactFreeCat('pet'); world.freePat(game.selectedFreeCatId); audio.play('pat'); audio.play('purr');
    } else if (mode === 'wand') { waveWand(p); }
    return;
  }
  let eventId = hit?.eventId;
  if (!hit && game.active) {
    eventId = game.events.find(e => e.kind === 'boredom' && world.toyHit(e, p))?.id;
  }
  if (hit && eventId === undefined) { gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'ui', id: hit.id }); hud.pressedId = hit.id; }
  else if (game.active && eventId !== undefined) {
    gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'care', eventId, tool: TOOL_BY_ID[game.selected] });
    hud.pointer = p; hud.pointerTool = game.selected;
    const care = game.events.find(e => e.id === eventId);
    if (care && !toolMatches(TOOL_BY_ID[game.selected], care.kind)) { game.rejectTool(care); audio.play('reject'); }
    updateCarePointer(p);
  } else if (game.active && p.x >= world.viewport.x && p.x <= world.viewport.x + world.viewport.w && p.y >= world.viewport.y && p.y <= world.viewport.y + world.viewport.h) {
    gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'empty' });
  }
  hud.invalidate();
});
canvas.addEventListener('pointermove', event => {
  if (editorPointers.has(event.pointerId) && editorView && hud.roomEditor) {
    const p = point(event), previous = editorPointers.get(event.pointerId)!;
    const before = [...editorPointers.values()]; editorPointers.set(event.pointerId, p);
    const after = [...editorPointers.values()];
    if (after.length === 2) {
      editorView.panPixels((after[0].x + after[1].x - before[0].x - before[1].x) / 2,
        (after[0].y + after[1].y - before[0].y - before[1].y) / 2);
      const distance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
      if (distance > 1) editorView.zoomBy(Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y) / distance);
    } else if (editorDrag && editorPointerMode === 'move') {
      const floorPoint = editorView.floorPoint(p);
      if (floorPoint) hud.roomEditor.preview({ ...editorDrag.pose, x: floorPoint.x + editorDrag.offset.x, z: floorPoint.z + editorDrag.offset.y });
    } else if (editorPointerMode === 'orbit') editorView.orbitPixels(p.x - previous.x, p.y - previous.y);
    else editorView.panPixels(p.x - previous.x, p.y - previous.y);
    refreshEditor(); return;
  }
  const p = point(event), hover = hud.hit(p.x, p.y);
  const touch = freeCameraTouches.get(event.pointerId);
  if (touch) {
    event.preventDefault();
    const other = [...freeCameraTouches].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(touch.x - other.x, touch.y - other.y);
      const after = Math.hypot(p.x - other.x, p.y - other.y);
      dragFreeCamera((p.x - touch.x) / 2, (p.y - touch.y) / 2, true);
      if (before > 8 && after > 8) world.zoomView(world.camera.zoom * (after / before - 1));
    } else dragFreeCamera(p.x - touch.x, p.y - touch.y);
    freeCameraTouches.set(event.pointerId, p); return;
  }
  if (event.pointerType === 'mouse') {
    const hoveredId = hover?.eventId === undefined && !hover?.disabled ? hover?.id : undefined;
    if (hud.hoveredId !== hoveredId) { hud.hoveredId = hoveredId; hud.invalidate(); }
    const wheelHover = !hover && game.phase === 'free-play' && game.freeInteraction === 'pet' && world.wheelHit(p);
    const cameraHover = game.phase === 'free-play' && game.freeInteraction === 'camera';
    canvas.style.cursor = dexDrag || freeDrag?.mode === 'camera' ? 'grabbing' : hover?.disabled ? 'not-allowed' : hover || wheelHover ? 'pointer' : game.active || inDexPreview(p) || cameraHover ? 'grab' : 'default';
  }
  if (event.pointerId !== pointerId) return;
  if (wardrobeDrag && game.phase === 'wardrobe') {
    const dx = p.x - wardrobeDrag.start.x, dy = p.y - wardrobeDrag.start.y;
    if (Math.hypot(dx, dy) > 7) wardrobeDrag.moved = true;
    if (wardrobeDrag.moved) {
      const layout = hud.wardrobeLayout;
      scrollWardrobe(wardrobeDrag.offset - (Math.abs(dx) >= Math.abs(dy) ? dx : dy) / (layout.cardWidth + layout.cardGap));
      hud.pressedId = undefined;
    }
    return;
  }
  if (dexDrag) { world.rotateDex(dexDrag, p); dexDrag = p; return; }
  if (freeDrag && game.phase === 'free-play') {
    const dx = p.x - freeDrag.point.x, dy = p.y - freeDrag.point.y;
    if (freeDrag.mode === 'camera') {
      dragFreeCamera(dx, dy, freeDrag.pan);
    } else if (freeDrag.mode === 'wand') { waveWand(p); }
    else if (game.selectedFreeCatId !== undefined && world.freePetHit(game.selectedFreeCatId, p) && game.clock >= game.freePatUntil) {
      game.interactFreeCat('pet'); world.freePat(game.selectedFreeCatId); audio.play('pat'); audio.play('purr');
    }
    freeDrag.point = p; hud.invalidate(); return;
  }
  const route = gesture.route;
  if (route?.kind === 'ui') { hud.pressedId = hover?.id === route.id ? route.id : undefined; hud.invalidate(); }
  const inTarget = route?.kind === 'care' && careTarget(route.eventId, p);
  updateCarePointer(p, hud.pointer ? Math.hypot(p.x - hud.pointer.x, p.y - hud.pointer.y) : 0);
  applyGesture(gesture.move(p, event.timeStamp, inTarget));
  if (route?.kind === 'care') hud.pointer = p;
});
canvas.addEventListener('pointerup', event => {
  if (editorPointers.delete(event.pointerId)) {
    if (editorDrag && hud.roomEditor) hud.roomEditor.commitPreview();
    editorDrag = undefined;
    if (!editorPointers.size) editorPointerMode = undefined;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    refreshEditor(); return;
  }
  if (freeCameraTouches.delete(event.pointerId)) {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    return;
  }
  if (event.pointerId !== pointerId) return;
  if (wardrobeDrag) {
    const p = point(event), drag = wardrobeDrag;
    const item = !drag.moved && hud.hit(p.x, p.y)?.id === drag.item ? drag.item : undefined;
    cancelGesture(); if (item) action(item); return;
  }
  if (dexDrag) { cancelGesture(); canvas.style.cursor = 'grab'; return; }
  const p = point(event), route = gesture.route, hit = hud.hit(p.x, p.y);
  const inTarget = route?.kind === 'care' && careTarget(route.eventId, p);
  const result = gesture.end(p, hit?.id, inTarget);
  cancelGesture(); applyGesture(result);
});
canvas.addEventListener('pointercancel', event => { if (event.pointerId === pointerId || freeCameraTouches.has(event.pointerId) || editorPointers.has(event.pointerId)) cancelGesture(); });
canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === pointerId || freeCameraTouches.has(event.pointerId) || editorPointers.has(event.pointerId)) cancelGesture(); });
canvas.addEventListener('pointerleave', () => { hud.hoveredId = undefined; hud.invalidate(); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('wheel', event => {
  if (game.phase === 'wardrobe') {
    const bounds = canvas.getBoundingClientRect(), r = hud.wardrobeLayout.carousel;
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? r.w : 1;
      scrollWardrobe(game.wardrobeItemOffset + delta * unit / (hud.wardrobeLayout.cardWidth + hud.wardrobeLayout.cardGap));
    }
    return;
  }
  if (game.phase === 'room-editor' && editorView && hud.roomPanel === 'none') {
    event.preventDefault(); editorView.zoomBy(Math.exp(-event.deltaY * .002)); hud.invalidate(); return;
  }
  if (game.phase !== 'free-play') return;
  event.preventDefault(); world.zoomView(-event.deltaY * 0.002); hud.invalidate();
}, { passive: false });
window.addEventListener('keyup', event => movementKeys.delete(event.key.toLowerCase()));
window.addEventListener('keydown', event => {
  if (hud.rotateRequired || contextLost || document.hidden) return;
  if (game.phase === 'room-editor') {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(key)) {
      event.preventDefault(); roomAction(key === 'y' || event.shiftKey ? 'room:redo' : 'room:undo'); return;
    }
    if (event.key === 'Escape') {
      event.preventDefault(); cancelGesture();
      roomAction(hud.roomPanel === 'none' ? 'room:cancel' : 'room:close-panel'); return;
    }
    const commands: Record<string, string> = { r: 'rotate', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'in', '=': 'in', '-': 'out' };
    const command = commands[event.key] ?? commands[key];
    if (command && hud.roomPanel === 'none' && !hud.focusedId && !event.ctrlKey && !event.metaKey) {
      event.preventDefault(); roomAction(`room:${command}`); return;
    }
  }
  if (game.phase === 'free-play' && !event.ctrlKey && !event.metaKey && !event.altKey && ['+', '=', '-', '_'].includes(event.key)) {
    event.preventDefault(); world.zoomView(['+', '='].includes(event.key) ? .2 : -.2); hud.invalidate(); return;
  }
  if (game.phase === 'free-play' && !event.ctrlKey && !event.metaKey && !event.altKey && ['w','a','s','d','q','e'].includes(event.key.toLowerCase())) {
    event.preventDefault(); movementKeys.add(event.key.toLowerCase()); return;
  }
  if (event.repeat || hud.rotateRequired || contextLost || document.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  if (world.enteringRoom && game.active && !hud.focusedId && ['Enter', ' '].includes(event.key)) {
    event.preventDefault(); finishEntrance(); return;
  }
  audio.unlock();
  hud.draw(game, world, 0, true);
  if (event.key === 'Tab' || (hud.focusedId && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key))) {
    event.preventDefault(); cancelGesture(); canvas.focus({ preventScroll: true });
    hud.focusNext(event.shiftKey || event.key === 'ArrowUp' || event.key === 'ArrowLeft');
    const focused = hud.controls.find(hit => hit.id === hud.focusedId);
    syncDocumentLanguage(focused?.label ?? focused?.id);
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && hud.focusedId) { event.preventDefault(); action(hud.focusedId); return; }
  if (event.key === ' ' && game.phase === 'bonus' && game.bonus?.paw) { event.preventDefault(); action('paw-clip'); return; }
  if (event.key === 'Escape') {
    event.preventDefault(); cancelGesture();
    if (game.phase === 'wardrobe') { action('wardrobe:close'); return; }
    if (game.phase === 'cat-dex') { action('dex-back'); return; }
    if (hud.modal) { hud.modal = undefined; hud.clearInteraction(); }
    else if (game.running) game.pause(); else if (game.phase === 'paused') game.resume();
  }
  if (/^[1-5]$/.test(event.key)) {
    if (game.phase === 'bonus') {
      const id = game.bonus?.catIds[Number(event.key) - 1];
      if (id !== undefined) action(`pat:${id}`);
    } else {
      const tool = game.availableTools[Number(event.key) - 1];
      if (tool) { cancelGesture(); game.select(tool.id); if (game.active) audio.play('select'); }
    }
  }
  hud.draw(game, world, 0, true);
});
function restoreGraphics() {
  restoreBlenderCatTextures(); restoreRoomTextures(); hud.texture.needsUpdate = true;
  lastTime = performance.now(); hud.invalidate();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { audio.setBlocked(true); cancelGesture(); game.pause('The room waited while you were away.'); }
  else restoreGraphics();
  lastTime = performance.now(); hud.invalidate();
});
window.addEventListener('blur', () => { audio.setBlocked(true); cancelGesture(); game.pause('The room waited while you were away.'); hud.invalidate(); });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); contextLost = true; audio.setBlocked(true); cancelGesture(); game.pause('Graphics paused. Resume when the room returns.');
});
canvas.addEventListener('webglcontextrestored', () => { contextLost = false; restoreGraphics(); resize(); });
window.addEventListener('pageshow', event => { if (event.persisted) restoreGraphics(); });
let resizePending = false;
function scheduleResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => { resizePending = false; resize(); });
}
window.addEventListener('resize', scheduleResize);
window.visualViewport?.addEventListener('resize', scheduleResize);
window.visualViewport?.addEventListener('scroll', scheduleResize);

function frame(now: number) {
  const enteringRoom = world.enteringRoom;
  const realDt = Math.max(0, (now - lastTime) / 1000); lastTime = now;
  // Long stalls never silently consume a cat's patience. Free play has no
  // deadlines, so loading / shader stalls should only use the clamped dt below.
  const timedPlay = game.running && game.phase !== 'free-play' && !enteringRoom && !resetFrameClock
    && !(game.phase === 'bonus' && ['intro', 'result'].includes(game.bonus?.status ?? ''));
  if (realDt > 1 && timedPlay && !manualClock) { cancelGesture(); game.pause('A little interruption. Ready to continue?'); }
  const dt = Math.min(realDt, 0.1);
  if (!contextLost) {
    if (game.active && !hud.rotateRequired && gesture.route?.kind === 'care' && hud.pointer) {
      const inside = careTarget(gesture.route.eventId, hud.pointer);
      if (world.carePointer) world.carePointer.working = inside;
      const held = gesture.hold(dt, inside);
      if (held.work) applyGesture(held);
    }
    if (game.phase === 'free-play' && freeDrag?.mode === 'wand') waveWand(freeDrag.point);
    if (!manualClock && !hud.rotateRequired && !world.enteringRoom) game.tick(dt);
    audio.setBlocked(!game.running || document.hidden || hud.rotateRequired);
    roomSounds.update(game, audio);
    if (game.phase === 'free-play') {
      const speed = dt * 4;
      world.translateView((Number(movementKeys.has('d')) - Number(movementKeys.has('a'))) * speed,
        (Number(movementKeys.has('e')) - Number(movementKeys.has('q'))) * speed,
        (Number(movementKeys.has('s')) - Number(movementKeys.has('w'))) * speed);
    }
    const adopted = JSON.stringify(game.adoptedCats);
    if (adopted !== savedAdoptedCats) {
      try { localStorage.setItem('catslave-cat-dex', adopted); savedAdoptedCats = adopted; } catch { /* Keep session progress. */ }
    }
    const roster = JSON.stringify(game.freePlayRoster);
    if (game.freePlayUnlocked && roster !== savedFreeRoster) {
      try { localStorage.setItem('catslave-free-play', roster); savedFreeRoster = roster; } catch { /* Keep the unlock for this session. */ }
    }
    if (game.phase !== previousPhase) {
      cancelGesture();
      if (game.phase === 'adoption' || game.phase === 'victory' || (game.phase === 'playing' && previousPhase === 'upgrade')) {
        // The two adoption previews need a wider frame than active play.
        world.resetView(game.phase === 'adoption' ? Math.min(1, world.camera.aspect / 0.65) : MAIN_VIEW.zoom);
        gyro.recenter(world.camera.quaternion);
      }
      previousPhase = game.phase;
    }
    if (previousRevision !== game.revision) { hud.invalidate(); previousRevision = game.revision; }
    const gaze = gyro.step(world.camera.quaternion, game.active && !world.enteringRoom && !hud.rotateRequired && !document.hidden && pointerId === undefined);
    if (gaze && 1 - Math.abs(gaze.dot(world.camera.quaternion)) > 1e-12) { world.setViewOrientation(gaze); hud.invalidate(); }
    syncWorldViewport(); updateWorld(dt, now / 1000, manualClock ? 0 : dt); hud.draw(game, world, dt);
    renderFrame();
    // Start timing gameplay after the final cinematic render (or a skip), so
    // its shader/loading cost cannot immediately open the interruption screen.
    if (resetFrameClock || enteringRoom && !world.enteringRoom) {
      lastTime = performance.now(); resetFrameClock = false;
      gyro.recenter(world.camera.quaternion);
    }
    fpsFrames++; fpsTime += realDt;
    if (fpsTime >= 1) { fps = Math.round(fpsFrames / fpsTime); fpsTime = 0; fpsFrames = 0; }
  }
  requestAnimationFrame(frame);
}
resize(); lastTime = performance.now(); requestAnimationFrame(frame);

// Only a dedicated `vite --mode test` server exposes deterministic browser fixtures.
// The production bundle eliminates this branch.
if (import.meta.env.MODE === 'test') {
  const finishBonus = () => {
    if (game.phase !== 'bonus') return;
    const paw = game.bonus?.paw;
    if (paw) paw.selectCat(game.cats[0].id);
    game.startBonus(); game.tick(3);
    if (paw) {
      for (let step = 0; step < 3000 && game.bonus?.status === 'playing'; step++) {
        if (paw.canSnip && paw.aim > paw.safeStart + .04 && paw.aim < paw.safeEnd - .04) paw.snip();
        else game.tick(.02);
      }
    } else for (let second = 0; second < 10; second++) { game.cats.forEach(cat => game.pat(cat.id)); game.tick(1); }
    game.continueBonus();
  };
  Object.assign(window, { __CATSLAVE_TEST__: {
    game, world, hud, audio, roomStore, get editorView() { return editorView; },
    finishBonus,
    setManualClock(value: boolean) { manualClock = value; },
    refresh(effectsDt = 0) { syncWorldViewport(); updateWorld(0, performance.now() / 1000, effectsDt); hud.draw(game, world, 0, true); },
    stats() { return { fps, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }; },
    captureFrame() { renderFrame(); return canvas.toDataURL('image/png'); },
  } });
  // State-aware visual inspection is confined to the test build, like the input fixtures.
  Object.assign(window, { __THREE_GAME_TEST_HOOKS__: {
    seed(value: number) { Object.assign(game, new Game(value)); },
    setPausedForScreenshot(paused: boolean) { manualClock = paused; },
    setState(state: string) {
      if (state !== 'active-play' && state !== 'five-cats') throw new Error(`Unknown inspection state: ${state}`);
      game.reset();
      if (state === 'five-cats') for (const tool of ['sweeper', 'mop', 'brush', 'food'] as const) {
        game.cats.forEach(cat => { cat.nextNeedAt = Infinity; }); game.tick(game.timeLeft); finishBonus();
        game.adopt(game.candidates[0].id); game.upgrade(tool); game.upgrade(tool);
      }
      game.cats.forEach((cat, i) => {
        cat.nextNeedAt = Infinity; cat.decisionAt = Infinity; cat.activity = 'idle'; cat.yaw = 0.15;
        if (state === 'five-cats') { cat.position = { x: (i - 2) * 1.15, z: 1 - Math.abs(i - 2) * 0.45 }; cat.destination = { ...cat.position }; }
        game.spawn(cat, (['hunger', 'fur', 'poop', 'vomit', 'boredom'] as const)[i]);
      });
      world.resetView(); if (state === 'five-cats') world.zoomView(-10);
      updateWorld(0, 0); hud.draw(game, world, 0, true);
      return { state };
    },
  } });
  Object.defineProperty(window, '__THREE_GAME_DIAGNOSTICS__', { get: () => ({
    phase: game.phase, catCount: game.cats.length, renderer: { calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
    fps, dpr: renderer.getPixelRatio(), shadows: false, postPasses: 0,
  }) });
}
