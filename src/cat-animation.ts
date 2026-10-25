import type { CatModel } from './cat-model';
import type { CatState } from './types';
import { ROOM } from './config';
import { jumpCurve, JUMP_TAKEOFF, JUMP_TOUCHDOWN } from './cat-jump';

const TAU = Math.PI * 2;
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const smooth = (n: number) => { const x = clamp(n); return x * x * (3 - 2 * x); };
const cycle = (n: number, period = TAU) => ((n % period) + period) % period;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Pose {
  bodyY: number; bodyZ: number; bodyPitch: number; hipY: number; frontHipDrop: number;
  headY: number; headZ: number; headPitch: number; headYaw: number; headRoll: number;
  tailPitch: number; tailCurl: number; tailSway: number;
  earBack: number; eyeOpen: number;
  feet: { y: number; z: number }[];
}
interface AnimationState {
  key: string; changedAt: number; lastTime: number;
  from: Pose; current: Pose; headRestY: number; headRestZ: number;
  attention: Attention;
}
interface Attention {
  yaw: number; pitch: number; strength: number;
  leftReach: number; rightReach: number; reachY: number; reachZ: number;
  crouch: number; lean: number;
}
interface AnimationOptions {
  angry?: boolean; happy?: boolean;
  buttPat?: { lift: number; side: number };
  /** Lure position in world space; independent of the model's render transform. */
  focus?: { x: number; y: number; z: number };
  engagement?: number;
}
const states = new WeakMap<CatModel, AnimationState>();

/** Foot-space blending preserves level soles and contacts while joints change pose. */
function blend(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const result = { ...b, feet: b.feet.map((foot, i) => ({ y: lerp(a.feet[i].y, foot.y, t), z: lerp(a.feet[i].z, foot.z, t) })) };
  for (const key of Object.keys(b) as (keyof Pose)[]) {
    if (key !== 'feet') result[key] = lerp(a[key], b[key], t);
  }
  return result;
}

function blink(time: number, id: number) {
  // Fast close, brief contact, slower open; stagger cats without random render state.
  const phase = cycle(time + id * 1.371 + 1.1, 4.7);
  if (phase < 0.07) return 1 - smooth(phase / 0.07);
  if (phase < 0.105) return 0;
  if (phase < 0.25) return smooth((phase - 0.105) / 0.145);
  return 1;
}

function crawlDirection(cat: CatState) {
  const visit = cat.visit;
  if (!visit) return 1;
  const target = visit.route[visit.index];
  const project = (from: { x: number; z: number }, to: { x: number; z: number }) =>
    (to.x - from.x) * Math.sin(cat.yaw) + (to.z - from.z) * Math.cos(cat.yaw);
  const forward = target ? project(visit.from, target) : 0;
  if (Math.abs(forward) > 0.000001) return Math.sign(forward);
  // At a waypoint the route can already point sideways to the next walking
  // segment while this frame still shows the last crawling pose.
  const previous = visit.route[visit.index - 2];
  const lastForward = previous ? project(previous, visit.from) : 0;
  return Math.abs(lastForward) > 0.000001 ? Math.sign(lastForward) : 1;
}

function targetPose(model: CatModel, cat: CatState, time: number, angry: boolean, happy: boolean): Pose {
  const p: Pose = {
    bodyY: -0.04, bodyZ: 0, bodyPitch: 0, hipY: 0.53, frontHipDrop: 0,
    headY: -0.035, headZ: 0, headPitch: Math.sin(time * 0.63 + cat.id) * 0.018,
    headYaw: Math.sin(time * 0.48 + cat.id * 2) * 0.045, headRoll: 0,
    tailPitch: -0.48, tailCurl: 0.20, tailSway: Math.sin(time * 1.5 + cat.id) * 0.09,
    earBack: angry ? 0.65 : 0, eyeOpen: happy ? 0.17 : angry ? 0.52 : blink(time, cat.id),
    feet: Array.from({ length: 4 }, () => ({ y: 0.07, z: 0.085 })),
  };
  const walking = cat.activity === 'walking' || cat.activity === 'crawling';
  if (walking) {
    const crawl = cat.activity === 'crawling';
    const direction = crawl ? crawlDirection(cat) : 1;
    const phaseMultiplier = crawl ? 3 : 2;
    // Simulation stride is radians per ten world units. A 62% stance phase
    // moves each planted foot backwards at precisely the root's forward speed.
    const stance = 0.62, speed = 1 / (10 * Math.max(0.1, model.root.scale.z) * phaseMultiplier);
    const reach = speed * TAU * stance / 2;
    const offsets = [0, 0.5, 0.75, 0.25]; // Four-beat walk, always at least two supports.
    p.hipY = 0.50 + Math.sin(cat.stride * phaseMultiplier * 2) * 0.003;
    p.bodyY = p.hipY - 0.57; p.headY = p.bodyY * 0.55;
    p.headPitch = 0.035 + Math.sin(cat.stride * phaseMultiplier) * 0.018;
    p.tailPitch = -0.62; p.tailSway *= 0.65;
    p.feet.forEach((foot, i) => {
      const phase = cycle(cat.stride * phaseMultiplier / TAU + offsets[i], 1);
      if (phase < stance) foot.z += direction * (reach - speed * TAU * phase);
      else {
        const u = (phase - stance) / (1 - stance);
        // Hermite return matches the stance velocity at lift-off and touchdown.
        const m = -speed * TAU * (1 - stance);
        foot.z += direction * ((2 * u ** 3 - 3 * u ** 2 + 1) * -reach + (u ** 3 - 2 * u ** 2 + u) * m
          + (-2 * u ** 3 + 3 * u ** 2) * reach + (u ** 3 - u ** 2) * m);
        foot.y += Math.sin(Math.PI * u) ** 2 * (crawl ? 0.065 : 0.115);
      }
    });
  }
  switch (cat.activity) {
    case 'stretching': {
      // Reach, hold the bow, then unroll. The simulation owns progress and pause.
      const progress = clamp(cat.pose);
      const stretch = smooth(progress / 0.30) * (1 - smooth((progress - 0.70) / 0.30));
      p.bodyPitch = 0.35 * stretch; p.bodyY -= 0.035 * stretch; p.bodyZ = -0.20 * stretch;
      p.hipY += 0.015 * stretch; p.frontHipDrop = 0.24 * stretch;
      p.headY -= 0.40 * stretch; p.headZ = 0.24 * stretch;
      p.headPitch = lerp(p.headPitch, 0.15, stretch); p.headYaw *= 1 - stretch;
      p.eyeOpen = lerp(p.eyeOpen, 0.06, stretch); p.earBack = 0.06 * stretch;
      p.tailPitch = lerp(p.tailPitch, -0.25, stretch); p.tailCurl += 0.12 * stretch; p.tailSway *= 1 - stretch * 0.8;
      p.feet.slice(0, 2).forEach(foot => {
        foot.z += 0.43 * stretch;
        foot.y += 0.025 * Math.sin(Math.PI * stretch) ** 2;
      });
      break;
    }
    case 'jumping': {
      const progress = clamp(cat.pose);
      const curve = (keys: readonly (readonly [number, number])[]) => jumpCurve(progress, keys);
      const crouch = curve([[0, 0], [0.09, 1], [0.18, 0], [1, 0]]);
      const release = curve([[0, 0], [0.09, 0], [0.18, 1], [0.30, 1], [0.46, 0], [1, 0]]);
      const landing = curve([[0, 0], [0.77, 0], [0.88, 1], [1, 0]]);
      const airborne = curve([[0, 0], [0.25, 1], [0.72, 1], [1, 0]]);
      p.hipY += -0.17 * crouch + 0.12 * release - 0.12 * landing;
      p.frontHipDrop = 0.025 * landing;
      p.bodyY += -0.18 * crouch + 0.11 * release - 0.14 * landing;
      p.bodyZ = -0.08 * crouch + 0.045 * release + 0.025 * landing;
      p.bodyPitch = curve([[0, 0], [0.10, -0.055], [0.25, -0.21], [0.51, -0.02], [0.76, 0.12], [0.9, 0.045], [1, 0]]);
      // Carry the shoulders and hips with the pitched torso; otherwise folded
      // upper legs can visibly pull away from the chest during takeoff.
      p.hipY += p.bodyPitch * 0.55;
      p.frontHipDrop += p.bodyPitch;
      p.headY += -0.10 * crouch + 0.08 * release - 0.075 * landing;
      p.headPitch -= 0.07 * airborne; p.headYaw *= 1 - airborne * 0.8;
      p.tailPitch -= 0.35 * airborne; p.tailCurl += 0.09 * airborne;
      // A cat favours one forepaw, then gathers its hind legs slightly out of sync.
      // Reverse the lead between cats without changing it on each render.
      const lead = cat.id % 2;
      p.headRoll = (lead ? -1 : 1) * 0.025 * airborne;
      p.tailSway += (lead ? 1 : -1) * 0.055 * airborne;
      p.feet.forEach((foot, i) => {
        const front = i < 2, first = i % 2 === (front ? lead : 1 - lead);
        const delay = first ? 0 : 0.035;
        if (front) {
          foot.y += curve([[0, 0], [0.08 + delay, 0], [0.29 + delay, first ? 0.29 : 0.24],
            [0.50 + delay, first ? 0.27 : 0.23], [0.70 + delay, 0.09], [JUMP_TOUCHDOWN + delay, 0], [1, 0]]);
          foot.z += curve([[0, 0], [JUMP_TAKEOFF, 0.035], [0.32 + delay, first ? 0.04 : -0.025],
            [0.65 + delay, first ? 0.22 : 0.16], [JUMP_TOUCHDOWN + delay, 0], [1, 0]]);
        } else {
          // Hold a long, nearly straight rear-leg push as the chest springs up.
          // Only gather the hocks after that extension has had time to read.
          foot.y += curve([[0, 0], [0.30 + delay, 0],
            [0.49 + delay, first ? 0.28 : 0.23], [0.66 + delay, 0.22], [0.90 + delay, 0], [1, 0]]);
          foot.z += curve([[0, 0], [JUMP_TAKEOFF, 0], [0.22 + delay, -0.20], [0.32 + delay, -0.22],
            [0.52 + delay, first ? 0.19 : 0.13], [0.74 + delay, 0.12], [0.90 + delay, 0], [1, 0]]);
        }
      });
      break;
    }
    case 'sleeping':
      p.bodyY = -0.27; p.hipY = 0.34; p.headY = -0.35; p.headZ = -0.06;
      p.headPitch = 0.22; p.headYaw = 0.18; p.headRoll = -0.09;
      p.tailPitch = -1.30; p.tailCurl = 0.51; p.tailSway = 0;
      p.eyeOpen = 0.04; p.earBack = 0.12;
      p.feet.forEach((foot, i) => { foot.z = i < 2 ? 0.12 : -0.03; });
      break;
    case 'crawling': case 'hiding':
      p.bodyY = -0.18; p.hipY = 0.35; p.headY = -0.19; p.headPitch = -0.08;
      p.tailPitch = -1.12; p.tailCurl = 0.12; p.earBack = 0.20;
      break;
    case 'watching': case 'perching':
      p.headYaw = Math.sin(time * 0.68 + cat.id) * (cat.activity === 'watching' ? 0.65 : 0.23);
      p.headPitch = -0.12 + Math.sin(time * 0.43) * 0.04;
      p.tailPitch = -0.32; p.tailCurl = 0.3;
      break;
    case 'sniffing':
      p.headY = -0.12; p.headPitch = 0.31 + Math.sin(time * 4.2) * 0.025;
      p.headYaw = Math.sin(time * 1.5 + cat.id) * 0.12;
      break;
    case 'grooming': {
      const lick = Math.sin(time * 6.5 + cat.id);
      p.headPitch = 0.36 + lick * 0.09; p.headYaw = -0.15; p.headRoll = -0.14;
      p.headY = -0.09; p.headZ = -0.04; p.feet[0] = { y: 0.45 + lick * 0.018, z: 0.32 };
      p.eyeOpen *= 0.7; p.tailSway *= 0.35;
      break;
    }
    case 'scratching':
      p.bodyPitch = -0.12; p.headPitch = -0.14; p.headY = 0.015;
      p.feet[0] = { y: 0.66 + Math.sin(time * 11) * 0.085, z: 0.38 };
      p.feet[1] = { y: 0.66 - Math.sin(time * 11) * 0.085, z: 0.38 };
      p.tailSway = Math.sin(time * 2.8) * 0.13;
      break;
    case 'eating':
      p.headY = -0.23 + Math.sin(time * 7.5) * 0.012; p.headZ = 0.035;
      p.headPitch = 0.54 + Math.sin(time * 7.5) * 0.035; p.headYaw = 0;
      p.bodyPitch = 0.045; p.tailSway *= 0.4;
      break;
    case 'playing': {
      // Hold an expectant, grounded stance until an actual lure invites a reach.
      p.headPitch = 0.08; p.headYaw *= 0.4;
      p.tailSway = Math.sin(time * 2.4 + cat.id) * 0.07; p.tailCurl = 0.35;
      break;
    }
  }
  if (angry) { p.tailSway = Math.sin(time * 9 + cat.id) * 0.24; p.headPitch -= 0.07; }
  return p;
}

function trackAttention(cat: CatState, pose: Pose, time: number, options: AnimationOptions,
  previous: AnimationState | undefined, headRestY: number, headRestZ: number): Attention {
  const next: Attention = { yaw: 0, pitch: 0, strength: 0, leftReach: 0, rightReach: 0, reachY: 0, reachZ: 0, crouch: 0, lean: 0 };
  const focus = options.focus;
  if (focus && [focus.x, focus.y, focus.z].every(Number.isFinite)) {
    const dx = (focus.x - cat.position.x) / ROOM.catScale;
    const dz = (focus.z - cat.position.z) / ROOM.catScale;
    const x = Math.cos(cat.yaw) * dx - Math.sin(cat.yaw) * dz;
    const z = Math.sin(cat.yaw) * dx + Math.cos(cat.yaw) * dz;
    const y = (focus.y - cat.elevation) / ROOM.catScale;
    next.yaw = clamp(Math.atan2(x, z - headRestZ - pose.headZ), -0.85, 0.85);
    next.pitch = clamp(-Math.atan2(y - headRestY - pose.headY, Math.hypot(x, z - headRestZ - pose.headZ)), -0.55, 0.65);
    next.strength = 1;
    const engagement = Number.isFinite(options.engagement) ? clamp(options.engagement!) : 0;
    // A held lure invites repeated attempts even when the player holds still.
    // Height sets the paw's reach, not whether the cat is interested in trying.
    // The screen-space arch owns eligibility. Its minimum touch size can put
    // distant targets beyond paw range, but the cat should still try to catch
    // them; the joint-space reach below remains physically bounded.
    const invitation = cat.activity === 'playing' ? smooth((engagement - 0.15) / 0.85) : 0;
    const phase = cycle(time * 1.45 + cat.id * 0.19, 1);
    const swat = smooth((phase - 0.12) / 0.22) * (1 - smooth((phase - 0.46) / 0.30));
    const prepare = 1 - smooth(phase / 0.22) + smooth((phase - 0.78) / 0.22);
    next[x < 0 ? 'leftReach' : 'rightReach'] = invitation * swat;
    next.reachY = clamp(y - 0.07, 0.18, 0.62);
    next.reachZ = clamp(z - 0.485, 0.12, 0.32);
    next.crouch = invitation * prepare;
    next.lean = invitation * swat;
  }
  if (!previous || time < previous.lastTime) return next;
  const dt = Math.max(0, time - previous.lastTime);
  const result = { ...previous.attention };
  for (const key of Object.keys(next) as (keyof Attention)[]) {
    // A repeated render at the same simulation time cannot advance attention.
    const value = lerp(previous.attention[key], next[key], 1 - Math.exp(-dt * 12));
    result[key] = dt > 0 && Math.abs(value - next[key]) < 0.00001 ? next[key] : value;
  }
  return result;
}

function applyAttention(pose: Pose, attention: Attention, time: number, cat: CatState) {
  const weight = attention.strength;
  if (weight === 0) return;
  pose.headYaw = lerp(pose.headYaw, attention.yaw, weight);
  pose.headPitch = lerp(pose.headPitch, attention.pitch, weight);
  pose.headRoll *= 1 - weight;
  pose.eyeOpen = lerp(pose.eyeOpen, 0.95 + blink(time, cat.id) * 0.05, weight);
  pose.earBack = lerp(pose.earBack, -0.18, weight);
  pose.tailSway = lerp(pose.tailSway, Math.sin(time * 3.8 + cat.id) * 0.045, weight);
  pose.tailCurl = lerp(pose.tailCurl, 0.32, weight);
  if (cat.activity === 'playing') {
    // Shift the rig above its planted supports; the gameplay root never moves.
    pose.hipY -= attention.crouch * 0.055;
    pose.bodyY += attention.lean * 0.018 - attention.crouch * 0.065;
    pose.bodyPitch -= attention.lean * 0.10;
    pose.headY += attention.lean * 0.025 - attention.crouch * 0.035;
    [attention.leftReach, attention.rightReach].forEach((reach, i) => {
      pose.feet[i].y += attention.reachY * reach;
      pose.feet[i].z += attention.reachZ * reach;
    });
  }
}

/** Analytic two-bone IK in the leg's sagittal plane, with a level paw. */
function placeFoot(model: CatModel, i: number, hipY: number, y: number, z: number) {
  const upperLength = 0.25, lowerLength = 0.25, down = hipY - y;
  // Solve for the ankle, then keep the toe offset horizontal. Rotating the
  // original +Z offset with a deeply folded shin would bury its cuff in the floor.
  const ankleZ = z - 0.085;
  const distance = clamp(Math.hypot(down, ankleZ), 0.02, upperLength + lowerLength - 0.00001);
  const direction = Math.atan2(ankleZ, down);
  const elbow = Math.acos(clamp((upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance), -1, 1));
  const upperAngle = direction + (i < 2 ? -elbow : elbow);
  const targetZ = Math.sin(direction) * distance, targetDown = Math.cos(direction) * distance;
  const lowerAngle = Math.atan2(targetZ - Math.sin(upperAngle) * upperLength, targetDown - Math.cos(upperAngle) * upperLength);
  const upper = -upperAngle, lower = -lowerAngle - upper;
  model.legs[i].position.y = hipY;
  model.legs[i].rotation.set(upper, 0, 0);
  model.lowerLegs[i].rotation.set(lower, 0, 0);
  model.paws[i].position.set(0, -0.25 + Math.sin(upper + lower) * 0.085, Math.cos(upper + lower) * 0.085);
  model.paws[i].rotation.set(-upper - lower, 0, 0);
}

/** Evaluate from simulation time, so pause/repeated renders never advance or drift. */
export function animateCat(model: CatModel, cat: CatState, time: number, options: AnimationOptions = {}) {
  const angry = options.angry ?? false, happy = options.happy ?? false;
  const key = `${cat.activity}:${angry}:${happy}:${!!options.buttPat}`;
  const target = targetPose(model, cat, time, angry, happy);
  if (options.buttPat) {
    const lift = options.buttPat.lift;
    target.bodyY = 0.02 + lift * 0.055; target.bodyZ = 0; target.bodyPitch = 0.03 + lift * 0.16;
    // Extend the rear legs within their reach so the paws stay planted.
    target.hipY = 0.53 + lift * 0.035; target.frontHipDrop = lift * 0.035;
    target.headY = 0.24 + lift * 0.05; target.headZ = -0.10;
    target.headYaw = options.buttPat.side * 2.55; target.headPitch = -0.06; target.headRoll = options.buttPat.side * 0.1;
    target.tailPitch = -0.9; target.tailCurl = 0.45; target.tailSway = options.buttPat.side * 0.48;
    target.feet = Array.from({ length: 4 }, () => ({ y: 0.07, z: 0.085 }));
  }
  let state = states.get(model);
  const headRestY = state?.headRestY ?? model.head.position.y;
  const headRestZ = state?.headRestZ ?? model.head.position.z;
  const attention = trackAttention(cat, target, time, options, state, headRestY, headRestZ);
  applyAttention(target, attention, time, cat);
  if (!state || time < state.lastTime) {
    state = { key, changedAt: time - 1, lastTime: time, from: target, current: target,
      headRestY, headRestZ, attention };
    states.set(model, state);
  }
  state.attention = attention;
  if (state.key !== key) {
    state.from = state.current; state.key = key; state.changedAt = time;
  }
  // Let the brief takeoff crouch read before the simulation leaves the floor.
  const blendDuration = cat.activity === 'jumping' ? 0.07 : 0.20;
  const p = blend(state.from, target, smooth((time - state.changedAt) / blendDuration));
  state.current = p; state.lastTime = time;
  model.root.rotation.x = 0; model.root.rotation.z = 0;
  const breath = Math.sin(time * (cat.activity === 'sleeping' ? 1.8 : 2.4) + cat.id) * 0.006;
  model.body.position.y = p.bodyY; model.body.position.z = p.bodyZ;
  model.body.rotation.set(p.bodyPitch, 0, 0); model.body.scale.set(1 + breath * 0.45, 1 + breath, 1);
  model.head.position.y = state.headRestY + p.headY + breath * 0.20;
  model.head.position.x = options.buttPat ? options.buttPat.side * 0.24 : 0;
  model.head.position.z = state.headRestZ + p.headZ;
  model.head.rotation.set(p.headPitch, p.headYaw, p.headRoll);
  model.eyes.forEach((eye, i) => {
    eye.scale.y = model.eyeHeight * Math.max(0.04, p.eyeOpen);
    // Use the readable curved lid for happy squints as well as full blinks.
    eye.visible = p.eyeOpen > 0.2;
    model.closedEyes[i].visible = !eye.visible;
  });
  model.anger.visible = angry;
  p.feet.forEach((foot, i) => placeFoot(model, i, p.hipY - (i < 2 ? p.frontHipDrop : 0), foot.y, foot.z));
  // Keep the tail attached to the rump as the torso bows or leans.
  model.tail.position.y = 0.82 * Math.cos(p.bodyPitch) + 0.76 * Math.sin(p.bodyPitch) + p.bodyY;
  model.tail.position.z = -0.76 * Math.cos(p.bodyPitch) + 0.82 * Math.sin(p.bodyPitch) + p.bodyZ;
  model.tail.rotation.set(p.tailPitch, 0, p.tailSway);
  model.tailJoints.forEach((joint, i) => {
    const follow = Math.sin(time * (angry ? 8 : 1.5) + cat.id - i * 0.38);
    joint.rotation.set(i < 2 ? -0.10 : 0.10 + i * 0.035, 0,
      p.tailCurl * (i < 2 ? 0.35 : 1) + follow * (cat.activity === 'sleeping' ? 0.008 : 0.035) * i);
  });
  model.ears.forEach((ear, i) => {
    const twitchPhase = cycle(time + cat.id * 0.83 + i * 2.1, 6.3);
    const twitch = twitchPhase < 0.34 ? Math.sin(twitchPhase / 0.34 * TAU) * 0.13 : 0;
    ear.rotation.set(-p.earBack * 0.35, (i ? -1 : 1) * p.earBack * 0.38, (i ? 1 : -1) * p.earBack + twitch);
  });
}

/** Kept for callers outside World; the animator now owns the complete pose. */
export const animateInteraction = animateCat;
