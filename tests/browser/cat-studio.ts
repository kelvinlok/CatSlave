import * as THREE from 'three';
import { createCat, disposeCat } from '../../src/cat-model';
import { animateCat } from '../../src/cat-animation';
import { PALETTE } from '../../src/config';
import { Game } from '../../src/simulation';
import type { CatActivity } from '../../src/types';

/** Test-only inspection stage using the production rig, materials and animator. */
export function mountCatStudio() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e8ddca');
  scene.add(new THREE.HemisphereLight('#fffaf0', '#b4a695', 2.6));
  const sun = new THREE.DirectionalLight('#fff1db', 3.2); sun.position.set(-3, 8, 4); scene.add(sun);
  const fill = new THREE.DirectionalLight('#d4e9ed', 1.2); fill.position.set(5, 3, -4); scene.add(fill);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1200, 700); renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
  renderer.domElement.id = 'cat-studio'; renderer.domElement.style.cssText = 'position:fixed;inset:0;width:1200px;height:700px;z-index:999';
  document.body.append(renderer.domElement);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#d7cbb8', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.005; scene.add(floor);
  const cat = new Game(42).cats[0]; let index = -1, model = createCat(PALETTE[0]);
  const camera = new THREE.PerspectiveCamera(32, 400 / 700, 0.1, 200);
  const pose = (activity: CatActivity, time: number, variant = 0, stride = time * 7.2, jump = 0.5) => {
    if (index !== variant) { model.root.removeFromParent(); disposeCat(model); model = createCat(PALETTE[variant]); scene.add(model.root); index = variant; }
    cat.activity = activity; cat.stride = stride; cat.pose = jump;
    animateCat(model, cat, time);
    renderer.setScissorTest(true); renderer.info.autoReset = false; renderer.info.reset();
    for (const [i, angle] of [0, -0.75, 1.05].entries()) {
      camera.position.set(Math.sin(angle) * 5.5, 1.6, Math.cos(angle) * 5.5); camera.lookAt(0, 0.76, 0);
      renderer.setViewport(i * 400, 0, 400, 700); renderer.setScissor(i * 400, 0, 400, 700); renderer.render(scene, camera);
    }
    return { calls: renderer.info.render.calls / 3, triangles: renderer.info.render.triangles / 3,
      geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  };
  pose('idle', 1);
  return { pose, renderer, scene, get model() { return model; } };
}

declare global { interface Window { __CAT_STUDIO__: ReturnType<typeof mountCatStudio>; } }
