import * as THREE from 'three';
import './style.css';
import { Game } from './simulation';
import { World } from './world';
import { Hud } from './hud';
import { Gesture, type GestureResult } from './gestures';
import { TOOLS, TOOL_BY_ID } from './config';
import type { Point, ToolId } from './types';
import { portraitViewport } from './layout';

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
  context.fillStyle = '#f8f0df'; context.fillRect(0, 0, innerWidth, innerHeight);
  context.fillStyle = '#493e38'; context.font = '28px Georgia'; context.textAlign = 'center';
  context.fillText('This room needs WebGL 2.', innerWidth / 2, innerHeight / 2 - 20);
  context.font = '14px Arial'; context.fillText('Try a browser with hardware acceleration enabled.', innerWidth / 2, innerHeight / 2 + 20);
  throw new Error('WebGL 2 is unavailable.');
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.autoClear = false;
renderer.info.autoReset = false;
renderer.setClearColor('#f8f0df');

const game = new Game(import.meta.env.MODE === 'test' ? 42 : undefined);
const world = new World();
const hud = new Hud();
const gesture = new Gesture();
let pointerId: number | undefined;
let contextLost = false;
let previousPhase = game.phase;
let previousRevision = game.revision;
let lastTime = performance.now();
let width = innerWidth, height = innerHeight;
let fpsFrames = 0, fpsTime = 0, fps = 60;
let manualClock = false;

function cancelGesture() {
  gesture.cancel(); hud.pointer = undefined; hud.pointerTool = undefined;
  if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  pointerId = undefined; hud.invalidate();
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
  world.resize(width, height, hud.layout.room);
  world.update(game, 0, performance.now() / 1000); hud.draw(game, world, 0, true);
  if (!contextLost) renderFrame();
}
function renderFrame() {
  renderer.info.reset(); renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height); renderer.clear();
  const v = world.viewport;
  renderer.setViewport(v.x, height - v.y - v.h, v.w, v.h);
  renderer.setScissor(v.x, height - v.y - v.h, v.w, v.h); renderer.setScissorTest(true);
  if (!hud.rotateRequired) renderer.render(world.scene, world.camera);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height);
  renderer.clearDepth(); if (!hud.rotateRequired) renderer.render(world.attackScene, world.attackCamera);
  renderer.clearDepth(); renderer.render(hud.scene, hud.camera);
}
function action(id: string) {
  cancelGesture();
  if (id === 'learn') { game.reset(true); }
  else if (id === 'start' || id === 'restart') { game.reset(); }
  else if (id === 'home') { game.reset(); game.phase = 'title'; }
  else if (id === 'pause') game.pause();
  else if (id === 'resume' && !contextLost && !document.hidden) { game.resume(); lastTime = performance.now(); }
  else if (id === 'tutorial-next') { game.advanceTutorial(); }
  else if (id.startsWith('tool:')) game.select(id.slice(5) as ToolId);
  else if (id.startsWith('adopt:')) game.adopt(Number(id.slice(6)));
  else if (id.startsWith('upgrade:')) { game.upgrade(id.slice(8) as ToolId); }
  hud.invalidate();
}
function applyGesture(result: GestureResult) {
  if (result.eventId !== undefined && result.work) game.work(result.eventId, result.work);
  if (result.click) action(result.click);
  hud.invalidate();
}
function point(event: PointerEvent): Point { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
canvas.addEventListener('pointerdown', event => {
  if (hud.rotateRequired || pointerId !== undefined || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || contextLost) return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  const p = point(event); const hit = hud.hit(p.x, p.y);
  pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId);
  let eventId = hit?.eventId;
  if (!hit && game.active) {
    const catId = world.pickCat(p.x, p.y); eventId = game.events.find(e => e.catId === catId && e.kind === 'boredom')?.id;
  }
  if (hit && eventId === undefined) gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'ui', id: hit.id });
  else if (game.active && eventId !== undefined) {
    gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'care', eventId, tool: TOOL_BY_ID[game.selected] });
    hud.pointer = p; hud.pointerTool = game.selected;
    const care = game.events.find(e => e.id === eventId);
    if (care && TOOL_BY_ID[game.selected].need !== care.kind) game.rejectTool(care);
  } else if (game.active) gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'empty' });
  hud.invalidate();
});
canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== pointerId) return;
  const p = point(event), route = gesture.route;
  const inTarget = route?.kind === 'care' && (hud.careHit(route.eventId, p) || game.events.some(e => e.id === route.eventId && e.kind === 'boredom' && world.pickCat(p.x, p.y) === e.catId));
  applyGesture(gesture.move(p, event.timeStamp, inTarget));
  if (route?.kind === 'care') hud.pointer = p;
});
canvas.addEventListener('pointerup', event => {
  if (event.pointerId !== pointerId) return;
  const p = point(event), route = gesture.route, hit = hud.hit(p.x, p.y);
  const inTarget = route?.kind === 'care' && (hud.careHit(route.eventId, p) || game.events.some(e => e.id === route.eventId && e.kind === 'boredom' && world.pickCat(p.x, p.y) === e.catId));
  const result = gesture.end(p, hit?.id, inTarget);
  cancelGesture(); applyGesture(result);
});
canvas.addEventListener('pointercancel', cancelGesture);
canvas.addEventListener('lostpointercapture', cancelGesture);
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('keydown', event => {
  if (event.repeat || hud.rotateRequired) return;
  if (event.key === 'Escape') { cancelGesture(); if (game.active) game.pause(); else if (game.phase === 'paused' && !contextLost && !document.hidden) game.resume(); }
  if (/^[1-5]$/.test(event.key)) { cancelGesture(); game.select(TOOLS[Number(event.key) - 1].id); }
  hud.invalidate();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelGesture(); game.pause('The room waited while you were away.'); }
  lastTime = performance.now(); hud.invalidate();
});
window.addEventListener('blur', () => { cancelGesture(); game.pause('The room waited while you were away.'); hud.invalidate(); });
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); contextLost = true; cancelGesture(); game.pause('Graphics paused. Resume when the room returns.');
});
canvas.addEventListener('webglcontextrestored', () => { contextLost = false; hud.texture.needsUpdate = true; lastTime = performance.now(); resize(); });
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
  const realDt = Math.max(0, (now - lastTime) / 1000); lastTime = now;
  // Long stalls never silently consume a cat's patience.
  if (realDt > 1 && game.active && !manualClock) { cancelGesture(); game.pause('A little interruption. Ready to continue?'); }
  const dt = Math.min(realDt, 0.1);
  if (!contextLost) {
    if (!manualClock && !hud.rotateRequired) game.tick(dt);
    if (game.phase !== previousPhase) {
      cancelGesture();
      previousPhase = game.phase;
    }
    if (previousRevision !== game.revision) { hud.invalidate(); previousRevision = game.revision; }
    world.update(game, dt, now / 1000, manualClock ? 0 : dt); hud.draw(game, world, dt);
    renderFrame();
    fpsFrames++; fpsTime += realDt;
    if (fpsTime >= 1) { fps = Math.round(fpsFrames / fpsTime); fpsTime = 0; fpsFrames = 0; }
  }
  requestAnimationFrame(frame);
}
resize(); requestAnimationFrame(frame);

// Only a dedicated `vite --mode test` server exposes deterministic browser fixtures.
// The production bundle eliminates this branch.
if (import.meta.env.MODE === 'test') {
  Object.assign(window, { __CATSLAVE_TEST__: {
    game, world, hud,
    setManualClock(value: boolean) { manualClock = value; },
    refresh(effectsDt = 0) { world.update(game, 0, performance.now() / 1000, effectsDt); hud.draw(game, world, 0, true); },
    stats() { return { fps, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }; },
  } });
}
