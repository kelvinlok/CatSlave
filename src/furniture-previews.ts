import * as THREE from 'three';
import { roomFurniture } from './room-layout-view';

/** Small cached pictures of the actual meshes; no additional models or WebGL context. */
export class FurniturePreviews {
  readonly images = new Map<string, HTMLCanvasElement>();
  renderNext(renderer: THREE.WebGLRenderer, room: THREE.Group, ids: string[]) {
    const roots = roomFurniture(room), id = ids.find(id => !this.images.has(id) && roots?.has(id));
    if (!id || !roots) return false;
    const scene = new THREE.Scene(), model = roots.get(id)!.clone(true);
    model.visible = true; model.position.set(0, 0, 0); model.quaternion.identity();
    // These clones share immutable geometry, materials and textures with the room.
    model.traverse(object => { if (object.userData.contactShadow) object.visible = false; });
    scene.add(model, new THREE.HemisphereLight('#fff8e8', '#b3a693', 2.5));
    const light = new THREE.DirectionalLight('#fff5df', 3); light.position.set(-3, 7, 5); scene.add(light);
    const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3());
    const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1, -1, .01, 100);
    const direction = id === 'sofa' ? [6, 4.5, -7] : id === 'loveseat' ? [-6, 4.5, 7] : [6, 4.5, 7];
    camera.position.copy(center).add(new THREE.Vector3(...direction)); camera.lookAt(center); camera.updateMatrixWorld(true);
    let halfWidth = 0, halfHeight = 0;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      halfWidth = Math.max(halfWidth, Math.abs(point.x)); halfHeight = Math.max(halfHeight, Math.abs(point.y));
    }
    const span = Math.max(halfHeight, halfWidth / 1.5, .1) * 1.08;
    camera.left = -span * 1.5; camera.right = span * 1.5; camera.top = span; camera.bottom = -span; camera.updateProjectionMatrix();
    this.images.set(id, renderPreview(renderer, scene, camera)); scene.clear();
    return true;
  }
}

export function renderPreview(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width = 288, height = 192) {
    const target = new THREE.WebGLRenderTarget(width, height);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    const previous = renderer.getRenderTarget(), viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
    const color = renderer.getClearColor(new THREE.Color()), alpha = renderer.getClearAlpha();
    try {
      // setRenderTarget uses physical target pixels; setViewport would apply the screen DPR again.
      renderer.setRenderTarget(target); renderer.setScissorTest(false);
      renderer.setClearColor('#000000', 0); renderer.clear(); renderer.render(scene, camera);
      const pixels = new Uint8Array(width * height * 4); renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d')!, data = context.createImageData(width, height);
      for (let y = 0; y < height; y++) data.data.set(pixels.subarray((height - y - 1) * width * 4, (height - y) * width * 4), y * width * 4);
      context.putImageData(data, 0, 0); return canvas;
    } finally {
      renderer.setRenderTarget(previous); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.setClearColor(color, alpha); target.dispose();
    }
}
