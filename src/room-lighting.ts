import * as THREE from 'three';
import layout from '../assets/lounge/layout.json';

const smooth = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Local wall-clock hours, independent of gameplay time and the server timezone. */
export function sampleLocalDaylight(date: Date) {
  const localHour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const daylight = smooth(6, 7.5, localHour) * (1 - smooth(17.5, 19, localHour));
  const twilight = Math.max(0, 1 - Math.abs(localHour - 6.65) / 1.05,
    1 - Math.abs(localHour - 18.35) / 1.05);
  return { localHour, daylight, twilight, night: 1 - daylight };
}

// A small CPU-backed reflection map survives WebGL restoration. Warm ceiling
// strips remain visible in glass and metal even when the exterior is dark.
function indoorReflections() {
  const w = 128, h = 64, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ceiling = y > h * .52;
    const strip = y > h * .77 && y < h * .83 && (x % 32) > 3 && (x % 32) < 27;
    const c = strip ? [255, 232, 192] : ceiling ? [130, 121, 106] : [71, 65, 55];
    const i = (y * w + x) * 4; data.set([...c, 255], i);
  }
  const texture = new THREE.DataTexture(data, w, h);
  texture.name = 'Indoor ceiling light reflections';
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
  return texture;
}

export class RoomLighting {
  readonly indoorLights: THREE.Light[] = [];
  readonly daylight = new THREE.DirectionalLight('#f5e5c9', 1.4);
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  state = sampleLocalDaylight(new Date());
  private lastSecond = -Infinity;
  private boundRoom = false;
  private exterior: { material: THREE.MeshStandardMaterial; base: THREE.Color; lit: boolean }[] = [];
  private nightTop = new THREE.Color('#080e22');
  private dayTop = new THREE.Color('#6399ce');
  private nightHorizon = new THREE.Color('#233149');
  private dayHorizon = new THREE.Color('#d8e7ed');
  private sunset = new THREE.Color('#efa875');
  private pawdicureKey!: THREE.SpotLight;
  private pawdicure = false;

  constructor(private scene: THREE.Scene, private room: THREE.Group) {
    scene.environment = indoorReflections(); scene.environmentIntensity = .22;
    scene.fog = new THREE.Fog('#d8e7ed', 32, 75);
    const bounce = new THREE.HemisphereLight('#fff0d8', '#746453', .9);
    bounce.name = 'Indoor | warm bounced ceiling light';
    this.indoorLights.push(bounce); scene.add(bounce);
    // Real local lights at the existing central track fixtures. All stay on.
    for (const z of [-5.7, -.5, 5.8]) {
      const light = new THREE.SpotLight('#ffe4bb', 62, 11, 1.15, .65, 2);
      light.name = `Indoor | track light ${z}`;
      light.position.set(0, 4.57, z - .18); light.target.position.set(0, 0, z - .7);
      if (z === 5.8) this.pawdicureKey = light;
      scene.add(light, light.target); this.indoorLights.push(light);
    }
    const wing = new THREE.PointLight('#fff0d6', 42, 8, 2);
    for (const z of [-5.7, -.5, 5.8]) {
      const light = new THREE.SpotLight('#ffe4bb', 48, 10, 1.15, .65, 2);
      light.name = `Indoor | extension track light ${z}`;
      light.position.set(-5.8, 4.57, z - .18); light.target.position.set(-5.8, 0, z - .7);
      if (z === 5.8) {
        // Aim across the entire raised logo, with the lettering inside the
        // full-strength cone instead of on the fading edge of a floor beam.
        light.name = 'Indoor | entrance logo light';
        light.target.position.set(layout.mainRoom.minX + .027, 3.25, 5.9);
        light.angle = .9; light.penumbra = .3; light.intensity = 32;
      }
      this.scene.add(light, light.target); this.indoorLights.push(light);
    }
    wing.name = 'Indoor | sunroom ceiling light'; wing.position.set(7.2, 4.95, 2.5);
    scene.add(wing); this.indoorLights.push(wing);
    this.daylight.name = 'Exterior | daylight through window';
    this.daylight.target.position.set(3, 0, 2.5);
    scene.add(this.daylight, this.daylight.target);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: this.dayTop.clone() }, horizon: { value: this.dayHorizon.clone() },
        daylight: { value: 1 }, night: { value: 0 }, sunDirection: { value: new THREE.Vector3(1, 1, 0).normalize() } },
      vertexShader: `varying vec3 vDirection;
        void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform vec3 top;uniform vec3 horizon;uniform float daylight;uniform float night;
        uniform vec3 sunDirection;varying vec3 vDirection;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){vec3 d=normalize(vDirection);
          vec3 c=mix(horizon,top,smoothstep(-.08,.75,d.y));
          float sun=pow(max(0.,dot(d,sunDirection)),1100.);
          c+=vec3(1.,.85,.56)*sun*daylight*2.;
          vec2 grid=vec2(atan(d.z,d.x),asin(d.y))*160.;
          float star=step(.997,hash(floor(grid)))*(1.-smoothstep(.05,.22,length(fract(grid)-.5)));
          c+=vec3(.55,.65,.85)*star*night*smoothstep(.15,.55,d.y);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(72, 32, 16), material);
    this.sky.name = 'Exterior | live local-time sky'; this.sky.renderOrder = -10; scene.add(this.sky);
    this.update();
  }

  /** Reuse the front fixture as a face light; retain it while the round is paused. */
  setPawdicure(active: boolean) {
    if (active === this.pawdicure) return;
    this.pawdicure = active;
    this.pawdicureKey.target.position.set(0, active ? 2.5 : 0, active ? .55 : 5.1);
    this.pawdicureKey.intensity = active ? 92 : 62;
    this.pawdicureKey.angle = active ? .7 : 1.15;
    this.pawdicureKey.penumbra = active ? .5 : .65;
  }

  private bindMaterials() {
    const clones = new Map<THREE.Material, THREE.Material>();
    this.room.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const bind = (original: THREE.Material) => {
        if (!(original instanceof THREE.MeshStandardMaterial)) return original;
        if (!original.name.startsWith('Exterior |') && original.name !== 'Warm cove LED diffusers') return original;
        if (clones.has(original)) return clones.get(original)!;
        const material = original.clone(); clones.set(original, material);
        if (original.name === 'Warm cove LED diffusers') material.emissiveIntensity = 2.6;
        else this.exterior.push({ material, base: original.color.clone(), lit: /^Exterior \| lit windows(?:\.\d+)?$/.test(original.name) });
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(bind) : bind(object.material);
    });
    this.boundRoom = true;
  }

  /** Called even while gameplay is paused; clock jumps and resume update immediately. */
  update(now = Date.now()) {
    const justLoaded = this.room.userData.loaded && !this.boundRoom;
    const second = Math.floor(now / 1000);
    if (second === this.lastSecond && !justLoaded) return;
    this.lastSecond = second;
    if (justLoaded) this.bindMaterials();
    this.state = sampleLocalDaylight(new Date(now));
    const { localHour, daylight, twilight, night } = this.state;
    const u = this.sky.material.uniforms;
    u.top.value.copy(this.nightTop).lerp(this.dayTop, daylight);
    u.horizon.value.copy(this.nightHorizon).lerp(this.dayHorizon, daylight).lerp(this.sunset, twilight * .6);
    u.daylight.value = daylight; u.night.value = night;
    const angle = (localHour - 6) / 12 * Math.PI;
    u.sunDirection.value.set(.8, Math.max(.03, Math.sin(angle)), Math.cos(angle) * .65).normalize();
    this.daylight.position.set(18, 6 + 12 * Math.max(0, Math.sin(angle)), 2.5 + Math.cos(angle) * 12);
    this.daylight.intensity = daylight * 1.35;
    this.daylight.color.set('#edf5ff').lerp(this.sunset, twilight * .6);
    (this.scene.fog as THREE.Fog).color.copy(u.horizon.value);
    for (const { material, base, lit } of this.exterior) {
      material.color.copy(base).multiplyScalar(.18 + daylight * .82);
      if (lit) { material.emissive.set('#ffdca3'); material.emissiveIntensity = night * 1.6; }
    }
  }
}
