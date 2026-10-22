import type { CatModel } from './cat-model';
import type { CatState } from './types';

/** Additive furniture/care poses; the normal gait is reset by World each frame. */
export function animateInteraction(model: CatModel, cat: CatState, time: number) {
  const { activity } = cat;
  model.root.rotation.x = 0; model.head.rotation.y = 0;
  if (activity === 'jumping') {
    const lift = Math.sin(cat.pose * Math.PI);
    model.root.rotation.x = -0.16 * Math.sin(cat.pose * Math.PI * 2);
    model.legs.forEach((leg, i) => { leg.rotation.x = (i < 2 ? -0.65 : 0.65) * lift; });
    model.tail.rotation.x = -0.55;
  }
  if (activity === 'crawling' || activity === 'hiding' || activity === 'sleeping') {
    // Lower the shoulders and fold the legs, keeping the paws on the surface.
    model.root.position.y -= model.root.scale.y * 0.21;
    model.legs.forEach((leg, i) => {
      leg.rotation.x = (i < 2 ? -1 : 1) * 0.85;
      if (activity === 'crawling') leg.rotation.x += Math.sin(cat.stride + i * Math.PI) * 0.16;
    });
    model.tail.rotation.x = -1.1; model.tail.rotation.z *= 0.25;
    model.head.rotation.x = activity === 'sleeping' ? 0.28 : -0.12;
    if (activity === 'sleeping') {
      model.root.position.y += Math.sin(time * 2) * 0.005;
      model.eyes.forEach(eye => { eye.scale.y = 0.009; });
    }
  }
  if (activity === 'watching' || activity === 'perching') {
    model.head.rotation.y = (activity === 'watching' ? Math.PI / 2 : 0) + Math.sin(time * 0.8 + cat.id) * 0.25;
    model.head.rotation.x = -0.12 + Math.sin(time * 0.6) * 0.08;
  }
  if (activity === 'grooming') {
    model.legs[0].rotation.x = -1.1;
    model.head.rotation.x = 0.45 + Math.sin(time * 6) * 0.12;
    model.head.rotation.z = -0.25;
  }
  if (activity === 'scratching') {
    model.root.rotation.x = -0.28;
    model.legs[0].rotation.x = -1.05 + Math.sin(time * 12) * 0.25;
    model.legs[1].rotation.x = -1.05 - Math.sin(time * 12) * 0.25;
    model.head.rotation.x = -0.16;
    model.tail.rotation.z = Math.sin(time * 3) * 0.2;
  }
  if (activity === 'eating') model.head.rotation.x = 0.6 + Math.sin(time * 8) * 0.07;
  if (activity === 'playing') {
    model.head.rotation.y = Math.sin(time * 2) * 0.22;
    model.head.rotation.x = 0.38;
    model.legs[Math.floor(time * 1.2) % 2].rotation.x = -0.7 * Math.max(0, Math.sin(time * 5));
    model.tail.rotation.z = Math.sin(time * 4) * 0.28;
  }
}
