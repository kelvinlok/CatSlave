import * as THREE from 'three';
import './style.css';
import { Game } from './simulation';
import { World } from './world';
import { Hud } from './hud';
import { Gesture, type GestureResult } from './gestures';
import { TOOLS, TOOL_BY_ID, toolMatches } from './config';
import type { Point, ToolId } from './types';
import { portraitViewport } from './layout';
import { GyroLook } from './gyro';

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
const gyro = new GyroLook(() => { hud.gyroStatus = gyro.status; hud.invalidate(); }, () => world.camera.quaternion);
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
  world.resize(width, height, hud.worldViewport(game));
  world.update(game, 0, performance.now() / 1000); hud.draw(game, world, 0, true);
  if (!contextLost) renderFrame();
}
function syncWorldViewport() {
  const next = hud.worldViewport(game), current = world.viewport;
  if (next.x !== current.x || next.y !== current.y || next.w !== current.w || next.h !== current.h) world.resize(width, height, next);
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
  // Resolve against the current screen, even if another input arrived before a frame.
  hud.draw(game, world, 0, true);
  if (contextLost || document.hidden || hud.rotateRequired || !hud.controls.some(hit => hit.id === id)) return;
  const keyboardFocus = hud.focusedId;
  cancelGesture();
  if (game.phase === 'paused' && ['help', 'restart', 'home'].includes(id)) {
    hud.modal = id as 'help' | 'restart' | 'home'; hud.clearInteraction();
    hud.draw(game, world, 0, true); return;
  }
  if (id === 'back') {
    hud.modal = undefined; hud.clearInteraction(); hud.draw(game, world, 0, true); return;
  }
  if (['learn', 'start', 'restart', 'home', 'confirm-restart', 'confirm-home'].includes(id)) { world.resetView(); gyro.recenter(world.camera.quaternion); }
  if (id === 'confirm-restart') { game.reset(game.resumePhase === 'tutorial'); }
  else if (id === 'learn') { game.reset(true); }
  else if (id === 'start' || id === 'restart') { game.reset(); }
  else if (id === 'home' || id === 'confirm-home') { game.reset(); game.phase = 'title'; }
  else if (id === 'pause') game.pause();
  else if (id === 'resume' && !contextLost && !document.hidden) { game.resume(); lastTime = performance.now(); }
  else if (id === 'tutorial-next') { game.advanceTutorial(); }
  else if (id === 'bonus-start') game.startBonus();
  else if (id === 'bonus-continue') game.continueBonus();
  else if (id.startsWith('pat:')) game.pat(Number(id.slice(4)));
  else if (id.startsWith('tool:')) game.select(id.slice(5) as ToolId);
  else if (id.startsWith('adopt:')) game.adopt(Number(id.slice(6)));
  else if (id.startsWith('upgrade:')) { game.upgrade(id.slice(8) as ToolId); }
  else if (game.active && id === 'view:in') world.zoomView(0.2);
  else if (game.active && id === 'view:out') world.zoomView(-0.2);
  else if (game.active && id === 'view:reset') { world.resetView(); gyro.recenter(world.camera.quaternion); }
  else if (game.active && id === 'view:gyro') void gyro.toggle();
  else if (game.active && id.startsWith('focus:')) {
    const care = game.events.find(e => e.id === Number(id.slice(6)));
    if (care) { world.focusOn(world.eventPosition(care)); gyro.recenter(world.camera.quaternion); }
  }
  syncWorldViewport(); world.update(game, 0, performance.now() / 1000, 0);
  hud.clearInteraction(); hud.draw(game, world, 0, true);
  if (keyboardFocus && hud.controls.some(hit => hit.id === keyboardFocus)) { hud.focusedId = keyboardFocus; hud.invalidate(); }
}
function applyGesture(result: GestureResult) {
  if (result.look && game.active) { world.lookView(result.look.x, result.look.y); gyro.recenter(world.camera.quaternion); }
  if (result.eventId !== undefined && result.work) {
    game.work(result.eventId, result.work);
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
function point(event: PointerEvent): Point { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
canvas.addEventListener('pointerdown', event => {
  if (hud.rotateRequired || pointerId !== undefined || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || contextLost) return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  hud.draw(game, world, 0, true);
  const p = point(event); const hit = hud.hit(p.x, p.y);
  hud.focusedId = undefined;
  if (hit?.disabled) return;
  if (game.phase === 'bonus' && hit?.id.startsWith('pat:')) { action(hit.id); return; }
  pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId);
  let eventId = hit?.eventId;
  if (!hit && game.active) {
    eventId = game.events.find(e => e.kind === 'boredom' && world.toyHit(e, p))?.id;
  }
  if (hit && eventId === undefined) { gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'ui', id: hit.id }); hud.pressedId = hit.id; }
  else if (game.active && eventId !== undefined) {
    gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'care', eventId, tool: TOOL_BY_ID[game.selected] });
    hud.pointer = p; hud.pointerTool = game.selected;
    const care = game.events.find(e => e.id === eventId);
    if (care && !toolMatches(TOOL_BY_ID[game.selected], care.kind)) game.rejectTool(care);
    updateCarePointer(p);
  } else if (game.active && p.x >= world.viewport.x && p.x <= world.viewport.x + world.viewport.w && p.y >= world.viewport.y && p.y <= world.viewport.y + world.viewport.h) {
    gesture.begin(p, event.timeStamp, Math.min(width, height), { kind: 'empty' });
  }
  hud.invalidate();
});
canvas.addEventListener('pointermove', event => {
  const p = point(event), hover = hud.hit(p.x, p.y);
  if (event.pointerType === 'mouse') {
    hud.hoveredId = hover?.eventId === undefined && !hover?.disabled ? hover?.id : undefined;
    canvas.style.cursor = hover?.disabled ? 'not-allowed' : hover ? 'pointer' : game.active ? 'grab' : 'default';
    hud.invalidate();
  }
  if (event.pointerId !== pointerId) return;
  const route = gesture.route;
  if (route?.kind === 'ui') { hud.pressedId = hover?.id === route.id ? route.id : undefined; hud.invalidate(); }
  const inTarget = route?.kind === 'care' && careTarget(route.eventId, p);
  updateCarePointer(p, hud.pointer ? Math.hypot(p.x - hud.pointer.x, p.y - hud.pointer.y) : 0);
  applyGesture(gesture.move(p, event.timeStamp, inTarget));
  if (route?.kind === 'care') hud.pointer = p;
});
canvas.addEventListener('pointerup', event => {
  if (event.pointerId !== pointerId) return;
  const p = point(event), route = gesture.route, hit = hud.hit(p.x, p.y);
  const inTarget = route?.kind === 'care' && careTarget(route.eventId, p);
  const result = gesture.end(p, hit?.id, inTarget);
  cancelGesture(); applyGesture(result);
});
canvas.addEventListener('pointercancel', event => { if (event.pointerId === pointerId) cancelGesture(); });
canvas.addEventListener('lostpointercapture', event => { if (event.pointerId === pointerId) cancelGesture(); });
canvas.addEventListener('pointerleave', () => { hud.hoveredId = undefined; hud.invalidate(); });
canvas.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('keydown', event => {
  if (event.repeat || hud.rotateRequired || contextLost || document.hidden || event.ctrlKey || event.metaKey || event.altKey) return;
  hud.draw(game, world, 0, true);
  if (event.key === 'Tab' || (hud.focusedId && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key))) {
    event.preventDefault(); cancelGesture(); canvas.focus({ preventScroll: true });
    hud.focusNext(event.shiftKey || event.key === 'ArrowUp' || event.key === 'ArrowLeft');
    const focused = hud.controls.find(hit => hit.id === hud.focusedId);
    canvas.setAttribute('aria-label', `CatSlave. ${focused?.label ?? focused?.id}. Enter to activate. Tab for next control. Escape to pause or go back.`);
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && hud.focusedId) { event.preventDefault(); action(hud.focusedId); return; }
  if (event.key === 'Escape') {
    event.preventDefault(); cancelGesture();
    if (hud.modal) { hud.modal = undefined; hud.clearInteraction(); }
    else if (game.running) game.pause(); else if (game.phase === 'paused') game.resume();
  }
  if (/^[1-5]$/.test(event.key)) {
    if (game.phase === 'bonus') {
      const id = game.bonus?.catIds[Number(event.key) - 1];
      if (id !== undefined) action(`pat:${id}`);
    } else {
      const tool = game.availableTools[Number(event.key) - 1];
      if (tool) { cancelGesture(); game.select(tool.id); }
    }
  }
  hud.draw(game, world, 0, true);
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
  if (realDt > 1 && game.running && !manualClock) { cancelGesture(); game.pause('A little interruption. Ready to continue?'); }
  const dt = Math.min(realDt, 0.1);
  if (!contextLost) {
    if (game.active && !hud.rotateRequired && gesture.route?.kind === 'care' && hud.pointer) {
      const inside = careTarget(gesture.route.eventId, hud.pointer);
      if (world.carePointer) world.carePointer.working = inside;
      const held = gesture.hold(dt, inside);
      if (held.work) applyGesture(held);
    }
    if (!manualClock && !hud.rotateRequired) game.tick(dt);
    if (game.phase !== previousPhase) {
      cancelGesture();
      if (game.phase === 'adoption' || game.phase === 'victory' || (game.phase === 'playing' && previousPhase === 'upgrade')) {
        // The two adoption previews need a wider frame than active play.
        world.resetView(game.phase === 'adoption' ? Math.min(1, world.camera.aspect / 0.65) : 1.65);
        gyro.recenter(world.camera.quaternion);
      }
      previousPhase = game.phase;
    }
    if (previousRevision !== game.revision) { hud.invalidate(); previousRevision = game.revision; }
    const gaze = gyro.step(world.camera.quaternion, game.active && !hud.rotateRequired && !document.hidden && pointerId === undefined);
    if (gaze && 1 - Math.abs(gaze.dot(world.camera.quaternion)) > 1e-12) { world.setViewOrientation(gaze); hud.invalidate(); }
    syncWorldViewport(); world.update(game, dt, now / 1000, manualClock ? 0 : dt); hud.draw(game, world, dt);
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
  const finishBonus = () => {
    if (game.phase !== 'bonus') return;
    game.startBonus(); game.tick(3);
    for (let second = 0; second < 10; second++) { game.cats.forEach(cat => game.pat(cat.id)); game.tick(1); }
    game.continueBonus();
  };
  Object.assign(window, { __CATSLAVE_TEST__: {
    game, world, hud,
    finishBonus,
    setManualClock(value: boolean) { manualClock = value; },
    refresh(effectsDt = 0) { syncWorldViewport(); world.update(game, 0, performance.now() / 1000, effectsDt); hud.draw(game, world, 0, true); },
    stats() { return { fps, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries }; },
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
      world.update(game, 0, 0); hud.draw(game, world, 0, true);
      return { state };
    },
  } });
  Object.defineProperty(window, '__THREE_GAME_DIAGNOSTICS__', { get: () => ({
    phase: game.phase, catCount: game.cats.length, renderer: { calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures },
    fps, dpr: renderer.getPixelRatio(), shadows: false, postPasses: 0,
  }) });
}
