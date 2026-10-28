/** Render the dex portraits from the shipped GLBs. Run: node scripts/render-cat-portraits.mjs */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const output = 'public/portraits';
await mkdir(output, { recursive: true });
const server = await createServer({ mode: 'test', server: { host: '127.0.0.1', port: 0 } });
await server.listen();
const browser = await chromium.launch({ args: ['--enable-webgl'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/tests/browser/cat-studio.html`);
  await page.waitForFunction(() => !!window.__CAT_STUDIO__, undefined, { timeout: 120000 });
  const portraits = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { PALETTE } = await import('/src/config.ts');
    const { updateBlenderCatRig } = await import('/src/blender-cat-rig.ts');
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(384, 384); renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    // Remove the torso and tail behind the head without changing the model.
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), -.28),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -.60)];
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff8ed', '#9a8c82', 2.4));
    const key = new THREE.DirectionalLight('#fff7ec', 3); key.position.set(-3, 4, 5); scene.add(key);
    const fill = new THREE.DirectionalLight('#dce8ff', 1); fill.position.set(3, 2, 2); scene.add(fill);
    const camera = new THREE.OrthographicCamera(-.55, .55, .55, -.55, .1, 10);
    camera.position.set(0, 1.06, 3); camera.lookAt(0, 1.06, .55);
    const result = [];
    for (const [index, cat] of PALETTE.entries()) {
      const studio = window.__CAT_STUDIO__; studio.pose('idle', 0, index, 0);
      const model = studio.model;
      if (model.root.userData.modelSource !== 'blender') throw Error(`Missing Blender model: ${cat.name}`);
      model.head.rotation.set(0, 0, 0); model.ears.forEach(ear => ear.rotation.set(0, 0, 0));
      model.eyes.forEach(eye => { eye.visible = true; eye.scale.y = model.eyeHeight; });
      model.closedEyes.forEach(eye => { eye.visible = false; });
      updateBlenderCatRig(model.root); scene.add(model.root); renderer.render(scene, camera);
      result.push({ kind: cat.appearance, name: cat.name, webp: renderer.domElement.toDataURL('image/webp', .92) });
      model.root.removeFromParent();
    }
    renderer.dispose(); return result;
  });
  const manifest = [];
  for (const { kind, name, webp } of portraits) {
    const bytes = Buffer.from(webp.split(',')[1], 'base64');
    await writeFile(`${output}/${kind}.webp`, bytes);
    const model = await readFile(`public/models/${kind}.glb`);
    manifest.push({ kind, name, width: 384, height: 384, bytes: bytes.length,
      modelSha256: createHash('sha256').update(model).digest('hex') });
  }
  await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
} finally { await browser.close(); await server.close(); }
