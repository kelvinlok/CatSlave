import { translate, languageLabel, gameTitle } from './i18n';
import * as THREE from 'three';
import { CLEANING_TOOLS, EFFICIENCY, PALETTE, TOOLS, TOOL_BY_ID, toolMatches } from './config';
import { Game } from './simulation';
import { World, inPlayArea, type PlayArea } from './world';
import { needIcon } from './need-icons';
import type { CareEvent, Point, ToolId } from './types';
import { gameLayout, type GameLayout } from './layout';
import { BONUS_DURATION, PAT_PATIENCE } from './bonus';
import { PAWDICURE_DURATION } from './pawdicure';

const C = { ink: '#493e38', muted: '#756658', paper: '#fff9eb', cream: '#f7efdf', line: '#e1d5bf', coral: '#a9583d', green: '#526b4c', paleGreen: '#e6eadb', red: '#ad4239' };
export interface Hit { id: string; x: number; y: number; w: number; h: number; eventId?: number; tool?: ToolId; arch?: PlayArea; regions?: { x: number; y: number; rx: number; ry: number }[]; label?: string; disabled?: boolean; }
export type HudModal = 'help' | 'restart' | 'home';

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), r); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 14, color = C.ink, align: CanvasTextAlign = 'left', font = 'sans', maxWidth?: number) {
  value = translate(value);
  const face = font === 'serif' ? "Georgia, 'Times New Roman', 'Noto Serif TC', 'PMingLiU', serif" : "'Trebuchet MS', Arial, 'Noto Sans TC', 'Microsoft JhengHei', sans-serif";
  ctx.font = `${font === 'bold' ? 700 : 500} ${size}px ${face}`;
  if (maxWidth && ctx.measureText(value).width > maxWidth) {
    size = Math.max(11, size * maxWidth / ctx.measureText(value).width);
    ctx.font = `${font === 'bold' ? 700 : 500} ${size}px ${face}`;
  }
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(value, x, y);
}
function line(ctx: CanvasRenderingContext2D, points: number[][], color: string, width = 3) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, rotation = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
}
function paw(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color = C.coral) {
  ellipse(ctx, x, y + size * 0.15, size * 0.25, size * 0.20, color);
  [-0.31, -0.11, 0.11, 0.31].forEach((p, i) => ellipse(ctx, x + size * p, y - size * (i === 1 || i === 2 ? 0.21 : 0.08), size * 0.09, size * 0.12, color, p));
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color = C.coral) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24); ctx.beginPath();
  ctx.moveTo(0, 10); ctx.bezierCurveTo(-21, -3, -8, -15, 0, -6); ctx.bezierCurveTo(8, -15, 21, -3, 0, 10);
  ctx.fillStyle = color; ctx.fill(); ctx.restore();
}
function toolIcon(ctx: CanvasRenderingContext2D, id: ToolId, x: number, y: number, size: number) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 40, size / 40);
  const wood = '#a7835e', outline = '#67584c';
  if (id === 'vacuum') {
    round(ctx, -15, -5, 20, 20, 7, '#81a6a1', outline);
    round(ctx, -11, -1, 12, 5, 2, '#cde0d8');
    ellipse(ctx, -10, 15, 4, 4, outline); ellipse(ctx, 1, 15, 4, 4, outline);
    ctx.beginPath(); ctx.moveTo(-5, -5); ctx.bezierCurveTo(-16, -25, 15, -26, 13, -9);
    ctx.strokeStyle = outline; ctx.lineWidth = 3; ctx.stroke();
    line(ctx, [[13, -9], [10, 10]], '#a9b9b5', 4);
    round(ctx, 4, 10, 18, 6, 2, '#526b67', outline);
  } else if (id === 'sweeper') {
    line(ctx, [[8, -16], [-1, 6]], wood, 4);
    ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(4, 6); ctx.lineTo(6, 17); ctx.quadraticCurveTo(-5, 23, -17, 12); ctx.closePath(); ctx.fillStyle = '#d6ad69'; ctx.fill();
    for (let i = 0; i < 4; i++) line(ctx, [[-5 + i * 2, 8], [-12 + i * 5, 16]], '#a7835e', 1.3);
    line(ctx, [[-7, 3], [4, 7]], outline, 3);
  } else if (id === 'mop') {
    line(ctx, [[7, -17], [-2, 5]], wood, 4);
    for (let i = 0; i < 6; i++) line(ctx, [[-3, 4], [-13 + i * 4, 14 + (i % 2) * 4]], '#91b9bd', 4);
    line(ctx, [[-9, 4], [3, 8]], '#5d8b94', 4);
  } else if (id === 'brush') {
    line(ctx, [[8, -15], [-1, 2]], wood, 6);
    ctx.save(); ctx.rotate(0.4);
    round(ctx, -13, -1, 24, 13, 5, '#af98c3');
    for (let i = 0; i < 6; i++) line(ctx, [[-10 + i * 4, 10], [-10 + i * 4, 16]], '#81718d', 2);
    ctx.restore();
  } else if (id === 'food') {
    round(ctx, -9, -19, 18, 20, 3, '#d9aa7b'); round(ctx, -8, -18, 16, 5, 2, '#a87b55');
    ellipse(ctx, 0, -8, 4, 3, '#f6e9cf');
    round(ctx, -17, 4, 34, 14, 6, '#bf806d');
    ellipse(ctx, 0, 5, 17, 5, '#efc5a1'); ellipse(ctx, 0, 5, 12, 3, '#9d7358');
  } else {
    line(ctx, [[-13, 17], [2, -15]], wood, 3);
    ctx.beginPath(); ctx.moveTo(2, -15); ctx.quadraticCurveTo(19, -22, 15, 1); ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke();
    ellipse(ctx, 12, 8, 4, 9, '#b6a2c8', 0.4); ellipse(ctx, 18, 7, 3, 8, '#91b9bd', -0.25);
    ellipse(ctx, 15, 2, 3, 3, '#d6ad69');
  }
  ctx.restore();
}

/** The same pictorial gesture guide appears in practice and the pause help. */
function careGuide(ctx: CanvasRenderingContext2D, id: ToolId, x: number, y: number, time: number) {
  if (id === 'vacuum') {
    toolIcon(ctx, id, x - 62, y, 30);
    for (const [i, kind] of (['poop', 'vomit', 'fur'] as const).entries()) needIcon(ctx, kind, x - 20 + i * 29, y, 21, '#604239');
    ctx.beginPath(); ctx.arc(x + 72, y, 9, 0, Math.PI * 2);
    ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.stroke();
    ellipse(ctx, x + 72, y, 3, 3, C.green); return;
  }
  const moving = id !== 'food', wave = Math.sin(time * 4) * 10;
  toolIcon(ctx, id, x - 62, y, 25);
  line(ctx, [[x - 41, y], [x - 27, y], [x - 32, y - 4]], C.muted, 1.5);
  line(ctx, [[x - 27, y], [x - 32, y + 4]], C.muted, 1.5);
  if (id === 'toy') {
    ctx.beginPath(); ctx.ellipse(x + 4, y + 9, 24, 20, 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = C.green; ctx.lineWidth = 1.5; ctx.stroke();
    ellipse(ctx, x + 4, y + 7, 9, 7, '#a7835e');
    line(ctx, [[x - 4, y + 3], [x - 4, y - 2], [x, y + 1]], '#a7835e', 2);
    line(ctx, [[x + 8, y + 1], [x + 12, y - 2], [x + 12, y + 3]], '#a7835e', 2);
    ellipse(ctx, x + 1, y + 6, 1, 1.5, C.ink); ellipse(ctx, x + 7, y + 6, 1, 1.5, C.ink);
    toolIcon(ctx, id, x + 4 + wave, y - 7, 20);
  } else {
    needIcon(ctx, TOOL_BY_ID[id].need, x + 4, y + 2, 24, '#604239');
    toolIcon(ctx, id, x + 4 + (moving ? wave : 0), y - 4, 23);
  }
  if (moving) {
    line(ctx, [[x + 40, y], [x + 68, y]], C.green, 2);
    line(ctx, [[x + 45, y - 5], [x + 40, y], [x + 45, y + 5]], C.green, 2);
    line(ctx, [[x + 63, y - 5], [x + 68, y], [x + 63, y + 5]], C.green, 2);
  } else {
    ctx.beginPath(); ctx.arc(x + 52, y, 9, -Math.PI / 2, -Math.PI / 2 + (time % 2) * Math.PI);
    ctx.strokeStyle = C.green; ctx.lineWidth = 3; ctx.stroke();
    ellipse(ctx, x + 52, y, 3, 3, C.green);
  }
}

export class Hud {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
  canvas = document.createElement('canvas');
  ctx = this.canvas.getContext('2d')!;
  texture = new THREE.CanvasTexture(this.canvas);
  private plane: THREE.Mesh;
  private hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  private hitGeometry = new THREE.PlaneGeometry(1, 1);
  private hitMeshes: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  hits: Hit[] = [];
  width = 1;
  height = 1;
  layout: GameLayout = gameLayout(390, 844);
  rotateRequired = false;
  gyroStatus = 'off';
  soundLabel = 'Sound: on';
  top = 12;
  bottom = 12;
  left = 0;
  right = 0;
  private dpr = 1;
  pointer?: Point;
  pointerTool?: ToolId;
  damageFlash = 0;

  private elapsed = 0;
  private animationTime = 0;
  private vacuumUnlockAge = Infinity;
  private reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private dirty = true;
  private lastPhase = '';
  private selectedTool: ToolId = 'sweeper';
  private bubbleCenters: Point[] = [];
  dexCat?: number;
  private dexPortraits = new Map<string, HTMLImageElement>();
  modal?: HudModal;
  hoveredId?: string;
  pressedId?: string;
  focusedId?: string;

  get controls() { return this.hits.filter(hit => hit.eventId === undefined && !hit.disabled).sort((a, b) => a.y - b.y || a.x - b.x); }
  focusNext(backward = false) {
    const controls = this.controls;
    if (!controls.length) return;
    const index = controls.findIndex(hit => hit.id === this.focusedId);
    this.focusedId = controls[(index < 0 ? (backward ? controls.length - 1 : 0) : (index + (backward ? -1 : 1) + controls.length) % controls.length)].id;
    this.invalidate();
  }
  clearInteraction() { this.hoveredId = undefined; this.pressedId = undefined; this.focusedId = undefined; this.invalidate(); }

  constructor() {
    this.camera.near = 0; this.camera.far = 10; this.camera.position.z = 5;
    this.hitMaterial.visible = false;
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.minFilter = THREE.LinearFilter; this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.plane.renderOrder = 1; this.scene.add(this.plane);
  }
  resize(width: number, height: number, safeTop: number, safeBottom: number, safeLeft = 0, safeRight = 0) {
    this.width = width; this.height = height; this.top = Math.max(12, safeTop); this.bottom = Math.max(12, safeBottom);
    this.left = safeLeft; this.right = safeRight;
    this.layout = gameLayout(width, height, { top: safeTop, bottom: safeBottom, left: safeLeft, right: safeRight });
    this.dpr = Math.min(devicePixelRatio || 1, 1.5, 2048 / Math.max(width, height));
    this.canvas.width = Math.round(width * this.dpr); this.canvas.height = Math.round(height * this.dpr);
    // A texture's storage dimensions are immutable after upload on some WebGL drivers.
    this.texture.dispose(); this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter; this.texture.generateMipmaps = false;
    (this.plane.material as THREE.MeshBasicMaterial).map = this.texture;
    (this.plane.material as THREE.MeshBasicMaterial).needsUpdate = true;
    this.camera.left = 0; this.camera.right = width; this.camera.top = 0; this.camera.bottom = height; this.camera.updateProjectionMatrix();
    this.plane.position.set(width / 2, height / 2, 0); this.plane.scale.set(width, -height, 1);
    this.dirty = true;
  }
  invalidate() { this.dirty = true; }
  celebrateVacuumUnlock() { this.vacuumUnlockAge = 0; this.invalidate(); }
  get vacuumUnlockVisible() { return this.vacuumUnlockAge < 2.6; }
  get compact() { return this.height < 540; }
  get panelWidth() { return Math.min(this.width - this.left - this.right - 32, 500); }
  get center() { return (this.left + this.width - this.right) / 2; }
  private addHit(hit: Hit) { this.hits.push({ ...hit, label: hit.label ? translate(hit.label) : undefined }); }
  hit(x: number, y: number): Hit | undefined {
    this.camera.updateMatrixWorld(); this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(x / this.width * 2 - 1, 1 - y / this.height * 2), this.camera);
    const intersections = this.raycaster.intersectObjects(this.hitMeshes.filter(m => m.visible), false);
    const hits = intersections.map(i => i.object.userData.hit as Hit).filter(h => (!h.arch || inPlayArea(h.arch, { x, y }))
      && (!h.regions || h.regions.some(p => ((x - p.x) / p.rx) ** 2 + ((y - p.y) / p.ry) ** 2 <= 1)));
    const ui = hits.find(h => h.eventId === undefined);
    if (ui) return ui; // Disabled controls still block input to the world below them.
    // Nearby roaming cats can overlap in perspective. Prefer the selected tool,
    // then the closest actual target, rather than whichever quad was added last.
    return hits.sort((a, b) => Number(b.tool === this.selectedTool) - Number(a.tool === this.selectedTool)
      || Math.hypot(x - a.x - a.w / 2, y - a.y - a.h / 2) - Math.hypot(x - b.x - b.w / 2, y - b.y - b.h / 2))[0];
  }
  careHit(eventId: number, point: Point) {
    return this.hits.filter(h => h.eventId === eventId).some(hit => hit.arch ? inPlayArea(hit.arch, point)
      : point.x >= hit.x - 32 && point.x <= hit.x + hit.w + 32 && point.y >= hit.y - 40 && point.y <= hit.y + hit.h + 36);
  }
  private syncHits() {
    this.hits.forEach((hit, i) => {
      let mesh = this.hitMeshes[i];
      if (!mesh) { mesh = new THREE.Mesh(this.hitGeometry, this.hitMaterial); this.hitMeshes.push(mesh); this.scene.add(mesh); }
      mesh.visible = true; mesh.position.set(hit.x + hit.w / 2, hit.y + hit.h / 2, 1 + i * 0.001);
      mesh.scale.set(hit.w, hit.h, 1); mesh.userData.hit = hit;
    });
    this.hitMeshes.slice(this.hits.length).forEach(mesh => { mesh.visible = false; });
  }
  private button(id: string, label: string, x: number, y: number, w: number, h = 52, primary = false) {
    round(this.ctx, x, y + 3, w, h, 15, primary ? '#a45f45' : '#d9cdb9');
    round(this.ctx, x, y, w, h, 15, primary ? C.coral : C.paper, primary ? undefined : C.line);
    text(this.ctx, label, x + w / 2, y + h / 2, 15, primary ? '#fffaf0' : C.ink, 'center', 'bold', w - 20);
    this.addHit({ id, label, x, y, w, h });
  }
  private upgradeRewards(game: Game, y: number) {
    const total = game.bonus?.won ? 2 : 1;
    for (let i = 0; i < total; i++) {
      const x = this.center + (i - (total - 1) / 2) * 40;
      const available = i < game.upgradesRemaining;
      round(this.ctx, x - 14, y - 14, 28, 28, 8, available ? '#e7c681' : C.cream, available ? '#b89553' : C.line);
      line(this.ctx, available ? [[x - 6, y + 3], [x, y - 4], [x + 6, y + 3]]
        : [[x - 6, y], [x - 2, y + 4], [x + 6, y - 4]], available ? C.ink : C.muted, 2.5);
    }
  }
  private backdrop() {
    const ctx = this.ctx;
    const top = ctx.createLinearGradient(0, 0, 0, this.height * 0.55);
    top.addColorStop(0, 'rgba(248,240,224,0.98)'); top.addColorStop(0.57, 'rgba(248,240,224,0.90)'); top.addColorStop(1, 'rgba(248,240,224,0)');
    ctx.fillStyle = top; ctx.fillRect(0, 0, this.width, this.height * 0.55);
    const bottom = ctx.createLinearGradient(0, this.height * 0.6, 0, this.height);
    bottom.addColorStop(0, 'rgba(248,240,224,0)'); bottom.addColorStop(0.54, 'rgba(248,240,224,0.93)'); bottom.addColorStop(1, 'rgba(248,240,224,1)');
    ctx.fillStyle = bottom; ctx.fillRect(0, this.height * 0.6, this.width, this.height * 0.4);
  }
  private brand() {
    paw(this.ctx, this.left + 29, this.top + 15, 23);
    text(this.ctx, gameTitle(), this.left + 48, this.top + 16, 11, C.ink, 'left', 'bold');
  }

  private rotationScreen() {
    const { ctx, width: w, height: h } = this;
    ctx.fillStyle = C.cream; ctx.fillRect(0, 0, w, h);
    const x = w / 2, y = h / 2;
    round(ctx, x - 22, y - 83, 44, 70, 9, C.paper, C.green);
    line(ctx, [[x - 8, y - 22], [x + 8, y - 22]], C.green, 3);
    paw(ctx, x, y - 52, 27, C.green);
    text(ctx, 'Rotate to portrait', x, y + 15, Math.min(27, w * 0.055), C.ink, 'center', 'serif');
  }

  private title(game: Game) {
    const { height: h, ctx } = this;
    this.backdrop(); this.brand();
    const center = this.center, panel = this.panelWidth, x = center - panel / 2;
    const titleY = this.top + (this.compact ? 96 : Math.min(155, h * 0.18));
    text(ctx, gameTitle(), center, titleY, Math.min(72, panel * 0.2), C.ink, 'center', 'serif', panel);
    const gap = 10, cellWidth = (panel - gap) / 2, rowHeight = 48;
    const bottomY = h - this.bottom - (rowHeight * 3 + gap * 2 + 4);
    const rightX = x + cellWidth + gap;
    this.button('start', 'Play  →', x, bottomY, cellWidth, rowHeight, true);
    this.button('learn', 'Practice', rightX, bottomY, cellWidth, rowHeight);
    this.button('cat-dex', 'Cat dex', x, bottomY + rowHeight + gap, cellWidth, rowHeight);
    if (game.freePlayUnlocked) this.button('free-play', 'Free play →', rightX, bottomY + rowHeight + gap, cellWidth, rowHeight);
    this.button('sound', this.soundLabel, x, bottomY + 2 * (rowHeight + gap), cellWidth, rowHeight);
    this.button('language', languageLabel(), rightX, bottomY + 2 * (rowHeight + gap), cellWidth, rowHeight);
  }

  private dexPortrait(index: number, x: number, y: number, size: number, unlocked: boolean) {
    const ctx = this.ctx, cat = PALETTE[index];
    if (unlocked && cat.appearance) {
      let portrait = this.dexPortraits.get(cat.appearance);
      if (!portrait) {
        portrait = new Image();
        portrait.onload = () => this.invalidate();
        portrait.onerror = () => this.invalidate();
        this.dexPortraits.set(cat.appearance, portrait);
        portrait.src = `${import.meta.env.BASE_URL}portraits/${cat.appearance}.webp`;
      }
      if (portrait.complete && portrait.naturalWidth > 0) {
        ctx.drawImage(portrait, x - size / 2, y - size / 2, size, size);
      } else {
        // Keep the name/card usable while the small portrait loads or is offline.
        paw(ctx, x, y, size * .45, cat.color);
      }
      return;
    }
    // Unknown cats keep an anonymous silhouette and do not request a portrait.
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
    ctx.beginPath(); ctx.moveTo(-36, -12); ctx.lineTo(-39, -44); ctx.lineTo(-15, -28);
    ctx.quadraticCurveTo(0, -34, 15, -28); ctx.lineTo(39, -44); ctx.lineTo(36, -12);
    ctx.bezierCurveTo(51, 36, -51, 36, -36, -12); ctx.fillStyle = '#514b48'; ctx.fill();
    ctx.restore();
  }

  private catDex(game: Game) {
    const { ctx } = this, width = this.panelWidth, x = this.center - width / 2;
    ctx.fillStyle = C.cream; ctx.fillRect(0, 0, this.width, this.height);
    this.button('dex-back', 'Back', x, this.top, 84, 44);
    text(ctx, 'Cat dex', this.center, this.top + 70, 34, C.ink, 'center', 'serif');
    const selected = this.dexCat === undefined ? undefined : PALETTE[this.dexCat];
    if (selected && game.adoptedCats.includes(selected.name)) {
      this.button('dex-reset', 'Reset rotation', x + width - 128, this.top, 128, 44);
      text(ctx, 'Drag to rotate · edges to roll', this.center, this.top + 99, 12, C.muted, 'center', 'sans', width);
      const preview = this.worldViewport(game), y = preview.y + preview.h;
      ctx.clearRect(preview.x, preview.y, preview.w, preview.h);
      text(ctx, selected.name, this.center, y + 26, 30, C.ink, 'center', 'serif', width);
      text(ctx, 'Adopted · Profile unlocked', this.center, y + 60, 14, C.green, 'center', 'bold', width);
      const coats = ['Chocolate brown', 'Cream with dark accents', 'Slate grey', 'Golden ginger', 'Amber ginger', 'Brown with dark accents', 'Taupe with dark accents', 'White with grey-brown tabby patches', 'Grey-brown tabby with white toe tips'];
      text(ctx, 'Coat', x + 16, y + 106, 13, C.muted, 'left', 'bold');
      text(ctx, coats[this.dexCat!], x + 16, y + 134, 18, C.ink, 'left', 'serif', width - 32);
      text(ctx, 'Care', x + 16, y + 176, 13, C.muted, 'left', 'bold');
      text(ctx, 'Keep fed, brushed and entertained.', x + 16, y + 204, 14, C.ink, 'left', 'sans', width - 32);
      text(ctx, 'Enjoys butt pats and chasing the wand.', x + 16, y + 232, 14, C.ink, 'left', 'sans', width - 32);
      return;
    }
    text(ctx, `${game.adoptedCats.length} / ${PALETTE.length} adopted`, this.center, this.top + 106, 14, C.green, 'center', 'bold');
    text(ctx, 'Adopt cats to reveal their profiles.', this.center, this.top + 132, 13, C.muted, 'center', 'sans', width);
    const startY = this.top + 158, gap = 8;
    const cellW = (width - gap * 2) / 3;
    const cellH = Math.min(150, (this.height - this.bottom - startY - gap * 2 - 4) / 3);
    Array.from({ length: 9 }, (_, index) => {
      const cat = PALETTE[index];
      const cx = x + (index % 3) * (cellW + gap), cy = startY + Math.floor(index / 3) * (cellH + gap);
      if (!cat) {
        round(ctx, cx, cy, cellW, cellH, 14, C.cream, C.line);
        paw(ctx, cx + cellW / 2, cy + cellH * .38, 28, C.line);
        text(ctx, 'Coming soon', cx + cellW / 2, cy + cellH - 24, 11, C.muted, 'center', 'sans', cellW - 12);
        return;
      }
      const unlocked = game.adoptedCats.includes(cat.name);
      round(ctx, cx, cy, cellW, cellH, 14, unlocked ? C.paper : '#e2dbcf', C.line);
      this.dexPortrait(index, cx + cellW / 2, cy + cellH * .36, Math.min(112, cellW - 10, cellH * .65), unlocked);
      text(ctx, unlocked ? cat.name : '???', cx + cellW / 2, cy + cellH - 33, 17, unlocked ? C.ink : C.muted, 'center', 'bold', cellW - 16);
      text(ctx, unlocked ? 'View profile' : 'Not adopted', cx + cellW / 2, cy + cellH - 13, 11, C.muted, 'center', 'sans', cellW - 16);
      this.addHit({ id: `dex-cat:${index}`, label: unlocked ? cat.name + ' · ' + translate('View profile') : translate('Not adopted'), x: cx, y: cy, w: cellW, h: cellH, disabled: !unlocked });
    });
  }

  worldViewport(game: Game): GameLayout['room'] {
    if (game.phase === 'cat-dex' && this.dexCat !== undefined) {
      return { x: this.center - this.panelWidth / 2, y: this.top + 110, w: this.panelWidth,
        h: Math.max(120, Math.min(280, this.height - this.top - this.bottom - 370)) };
    }
    if (game.inBonus && game.bonus?.id === 'pawdicure') {
      const y = this.top + 132;
      const footer = game.bonus.status === 'intro' || game.bonus.status === 'result' ? 220 : 90;
      return { x: this.left + 6, y, w: this.width - this.left - this.right - 12,
        h: Math.max(90, this.height - this.bottom - footer - y) };
    }
    if (game.inFreePlay) {
      const y = this.top + 110;
      return { x: this.left + 6, y, w: this.width - this.left - this.right - 12,
        h: Math.max(90, this.height - this.bottom - 224 - y) };
    }
    if (game.phase === 'victory') {
      const y = this.top + 96;
      return { x: this.left + 6, y, w: this.width - this.left - this.right - 12,
        h: Math.max(90, this.height - this.bottom - 204 - y) };
    }
    if (!game.inBonus) return this.layout.room;
    const y = this.top + 120;
    return { x: this.left + 6, y, w: this.width - this.left - this.right - 12,
      h: Math.max(90, this.height - this.bottom - 150 - y) };
  }

  private bonusRound(game: Game, world: World) {
    const bonus = game.bonus!;
    if (bonus.id === 'pawdicure') { this.pawRound(game, world); return; }
    const { ctx } = this, center = this.center, width = this.panelWidth;
    const urgent = bonus.status === 'playing' && bonus.timeLeft <= 3;
    text(ctx, 'BONUS · BUTT PATS', center, this.top + 15, 13, C.ink, 'center', 'bold');
    const value = bonus.status === 'intro' ? '10' : bonus.status === 'countdown' ? String(Math.ceil(bonus.countdown))
      : bonus.status === 'playing' ? bonus.timeLeft.toFixed(1) : bonus.won ? '✓' : '×';
    const pulse = urgent ? Math.sin(bonus.clock * 14) * 3 : 0;
    text(ctx, value, center, this.top + 66, 65 + pulse, urgent || bonus.failedCatId !== undefined ? C.red : C.green, 'center', 'bold');
    if (bonus.status === 'playing') {
      round(ctx, center - width / 2, this.top + 108, width, 6, 3, C.line);
      round(ctx, center - width / 2, this.top + 108, width * bonus.timeLeft / BONUS_DURATION, 6, 3, urgent ? C.red : C.green);
    }
    const pause = this.layout.pause;
    round(ctx, pause.x, pause.y, pause.w, pause.h, 12, C.paper, C.line);
    line(ctx, [[pause.x + 19, pause.y + 15], [pause.x + 19, pause.y + 32]], C.ink, 3);
    line(ctx, [[pause.x + 28, pause.y + 15], [pause.x + 28, pause.y + 32]], C.ink, 3);
    this.addHit({ id: 'pause', label: 'Pause bonus round', ...pause });

    if (bonus.status === 'playing' || bonus.status === 'intro' || bonus.status === 'countdown') {
      const points = bonus.catIds.map(id => world.bonusPatTarget(id));
      const spacing = Math.min(...points.slice(1).map((point, i) => point && points[i] ? Math.abs(point.x - points[i]!.x) : Infinity));
      const targetSize = Math.max(44, Math.min(64, spacing - 6, world.viewport.w / bonus.catIds.length - 12));
      for (const id of bonus.catIds) {
        const point = world.bonusPatTarget(id);
        if (!point?.visible) continue;
        const patience = bonus.patience(id) / PAT_PATIENCE, radius = Math.min(world.viewport.h < 240 ? 16 : 21, targetSize / 2 - 3);
        const color = patience <= 1 / 3 ? C.red : C.green;
        ellipse(ctx, point.x, point.y, radius, radius, 'rgba(255,249,235,0.30)');
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.strokeStyle = C.paper; ctx.lineWidth = 6; ctx.stroke();
        ctx.beginPath(); ctx.arc(point.x, point.y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * patience);
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
        // A palm and fingers mark the actual rump, rather than a remote button.
        ellipse(ctx, point.x, point.y + 3, 5, 6, C.paper);
        for (let i = 0; i < 4; i++) line(ctx, [[point.x - 4 + i * 2.6, point.y + 1], [point.x - 4 + i * 2.6, point.y - 6 - (i === 1 || i === 2 ? 2 : 0)]], C.paper, 2);
        line(ctx, [[point.x - 4, point.y + 5], [point.x - 8, point.y]], C.paper, 3);
        const lift = bonus.lift(id);
        if (lift > 0) heart(ctx, point.x + radius - 2, point.y - radius - (1 - lift) * 12, 12 * lift + 5);
        if (bonus.status === 'playing') this.addHit({ id: `pat:${id}`, label: `Pat ${game.cats.find(cat => cat.id === id)!.name}`,
          x: point.x - targetSize / 2, y: point.y - targetSize / 2, w: targetSize, h: targetSize });
      }
    }
    const bottom = this.height - this.bottom, x = center - width / 2;
    if (bonus.status === 'intro') {
      text(ctx, 'Tap every cat’s butt.', center, bottom - 128, 15, C.ink, 'center', 'bold', width);
      text(ctx, 'Pat each cat at least once every 3 seconds.', center, bottom - 105, 12, C.ink, 'center', 'sans', width);
      text(ctx, 'Last 10 seconds to win +1 upgrade.', center, bottom - 83, 12, C.muted, 'center', 'sans', width);
      this.button('bonus-start', 'Ready', x, bottom - 59, width, 52, true);
    } else if (bonus.status === 'countdown') {
      text(ctx, 'Get ready', center, bottom - 80, 24, C.ink, 'center', 'serif');
    } else if (bonus.status === 'result') {
      text(ctx, bonus.won ? '+1 upgrade' : 'Bonus over', center, bottom - 120, 26, bonus.won ? C.green : C.ink, 'center', 'serif');
      text(ctx, `${bonus.pats} ${bonus.pats === 1 ? 'pat' : 'pats'}`, center, bottom - 87, 15, C.muted, 'center');
      this.button('bonus-continue', 'Adopt  →', x, bottom - 59, width, 52, true);
    } else {
      text(ctx, `${bonus.pats} ${bonus.pats === 1 ? 'pat' : 'pats'}`, center, bottom - 85, 24, C.ink, 'center', 'bold');
    }
  }

  private pawRound(game: Game, world: World) {
    const bonus = game.bonus!, trim = bonus.paw!;
    const { ctx } = this, center = this.center, width = this.panelWidth, x = center - width / 2;
    const bottom = this.height - this.bottom;
    const selected = game.cats.find(cat => cat.id === trim.selectedCatId);
    const urgent = bonus.status === 'playing' && bonus.timeLeft <= 10;
    text(ctx, 'PAWDICURE', x + 2, this.top + 18, 20, C.ink, 'left', 'serif');
    text(ctx, game.practiceBonus ? 'MINI-GAME PRACTICE' : 'PERFECT-STAGE BONUS', x + 2, this.top + 42, 10, C.muted);
    const pause = this.layout.pause;
    this.button('pause', 'Ⅱ', pause.x, pause.y, pause.w, pause.h);
    const timer = bonus.status === 'countdown' ? String(Math.ceil(bonus.countdown))
      : bonus.status === 'result' ? bonus.won ? '✓' : '0' : String(Math.ceil(bonus.timeLeft));
    text(ctx, timer, x + width - 26, this.top + 83, 35, urgent ? C.red : C.green, 'center', 'bold');
    if (bonus.status !== 'countdown' && bonus.status !== 'result') text(ctx, 'SECONDS', x + width - 26, this.top + 110, 9, C.muted, 'center');
    const pawsX = x + 17;
    for (let i = 0; i < 4; i++) {
      const done = trim.trimmed[i].every(Boolean), active = i === trim.pawIndex;
      const px = pawsX + i * 35;
      if (active && bonus.status !== 'intro') ellipse(ctx, px, this.top + 80, 17, 17, C.paleGreen);
      paw(ctx, px, this.top + 80, 27, done ? C.green : active ? C.coral : C.line);
      if (done) text(ctx, '✓', px, this.top + 80, 15, C.paper, 'center', 'bold');
    }
    text(ctx, `${trim.totalTrimmed} / 18 claws`, x + 2, this.top + 110, 12, C.muted);
    if (bonus.status === 'intro') {
      text(ctx, 'Choose your cat', center, bottom - 203, 17, C.ink, 'center', 'serif');
      const gap = 6, cw = (width - gap * (game.cats.length - 1)) / game.cats.length;
      game.cats.forEach((cat, i) => {
        const bx = x + i * (cw + gap), chosen = cat.id === trim.selectedCatId;
        round(ctx, bx, bottom - 182, cw, 46, 12, chosen ? C.paleGreen : C.paper, chosen ? C.green : C.line);
        paw(ctx, bx + cw / 2, bottom - 169, 18, cat.color);
        text(ctx, cat.name, bx + cw / 2, bottom - 147, 12, C.ink, 'center', chosen ? 'bold' : 'sans', cw - 8);
        this.addHit({ id: `paw-cat:${cat.id}`, label: `Choose ${cat.name}`, x: bx, y: bottom - 182, w: cw, h: 46 });
      });
      text(ctx, 'Watch the ring around the toe.', center, bottom - 115, 14, C.ink, 'center', 'bold', width);
      text(ctx, 'Tap the paw when the dot enters green.', center, bottom - 94, 12, C.muted, 'center', 'sans', width);
      text(ctx, `Finish all four paws in ${PAWDICURE_DURATION} seconds.`, center, bottom - 74, 12, C.muted, 'center', 'sans', width);
      ctx.save(); if (!selected) ctx.globalAlpha = 0.5;
      this.button('bonus-start', selected ? `Ready, ${selected.name}  →` : 'Choose a cat first', x, bottom - 55, width, 48, true);
      ctx.restore(); this.hits[this.hits.length - 1].disabled = !selected;
      return;
    }
    const pawName = ['Front left', 'Front right', 'Back left', 'Back right'][Math.min(3, trim.pawIndex)];
    text(ctx, `${selected?.name ?? ''} · ${pawName}`, center, this.top + 127, 12, C.muted, 'center', 'sans', width);
    if (bonus.status === 'result') {
      text(ctx, bonus.won ? 'Perfectly pampered!' : 'Time for a break', center, bottom - 190, 26, bonus.won ? C.green : C.ink, 'center', 'serif', width);
      const reward = game.practiceBonus ? `${trim.totalTrimmed} of 18 claws trimmed` : bonus.won ? '+1 extra upgrade' : 'Your normal upgrade is still waiting';
      text(ctx, reward, center, bottom - 155, 14, C.muted, 'center', 'sans', width);
      if (game.practiceBonus) {
        this.button('pawdicure-practice', 'Play again  →', x, bottom - 119, width, 48, true);
        this.button('bonus-continue', 'Main menu', x, bottom - 57, width, 48);
      } else this.button('bonus-continue', 'Adopt  →', x, bottom - 63, width, 52, true);
      return;
    }
    if (bonus.status === 'countdown') {
      text(ctx, 'One paw at a time', center, bottom - 62, 24, C.ink, 'center', 'serif', width);
      text(ctx, 'Tap the paw when the dot enters green.', center, bottom - 29, 13, C.muted, 'center', 'sans', width);
      return;
    }
    for (let i = 0; i < trim.clawCount; i++) {
      const target = world.pawClawTarget(i);
      if (!target) continue;
      const done = trim.trimmed[trim.pawIndex]?.[i], active = trim.activeClaw === i;
      if (done) {
        ellipse(ctx, target.x, target.y, 10, 10, C.green);
        text(ctx, '✓', target.x, target.y, 14, C.paper, 'center', 'bold');
      } else if (!active) ellipse(ctx, target.x, target.y, 3, 3, 'rgba(255,249,235,.5)');
    }
    const timing = world.pawTimingTarget(trim), tapArea = world.pawTapArea();
    if (tapArea) this.addHit({ id: 'paw-clip', label: 'Tap paw to snip', ...tapArea, disabled: !trim.canSnip });
    if (timing) {
      const { x: tx, y: ty, radius } = timing;
      const angle = (value: number) => Math.PI * .75 + value * Math.PI * 1.5;
      const arc = (start: number, end: number, color: string, thickness: number) => {
        ctx.beginPath(); ctx.arc(tx, ty, radius, angle(start), angle(end));
        ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.lineCap = 'round'; ctx.stroke();
      };
      ctx.save(); if (!trim.canSnip) ctx.globalAlpha = .55;
      arc(0, 1, C.paper, this.focusedId === 'paw-clip' ? 15 : 13);
      arc(0, 1, '#b6a98f', 7);
      arc(trim.safeStart, trim.safeEnd, C.green, 10);
      // End ticks make the reversal points explicit; the pad stays visible inside the ring.
      for (const value of [0, 1]) {
        const a = angle(value);
        line(ctx, [[tx + Math.cos(a) * (radius - 6), ty + Math.sin(a) * (radius - 6)],
          [tx + Math.cos(a) * (radius + 6), ty + Math.sin(a) * (radius + 6)]], C.ink, 2);
      }
      const a = angle(trim.aim), mx = tx + Math.cos(a) * radius, my = ty + Math.sin(a) * radius;
      ellipse(ctx, mx, my, 8, 8, C.paper);
      ellipse(ctx, mx, my, 5.5, 5.5, trim.aim >= trim.safeStart && trim.aim <= trim.safeEnd ? C.green : C.ink);
      ctx.restore();
      const note = trim.mood === 'moving' ? 'Wait…' : trim.mood === 'warning' ? 'Paw twitch' : trim.snipAge < .7 && trim.lastSnip ? (trim.lastSnip.success ? '✓ Snip!' : 'Try again') : '';
      if (note) {
        const v = world.viewport;
        text(ctx, note, Math.max(v.x + 48, Math.min(v.x + v.w - 48, tx)), Math.min(v.y + v.h - 12, ty + radius + 21), 13,
          trim.mood !== 'calm' || trim.lastSnip?.success === false ? C.red : C.green, 'center', 'bold');
      }
    }
    text(ctx, 'Tap anywhere on the paw when the dot enters green.', center, bottom - 58, 13, C.ink, 'center', 'bold', width);
    text(ctx, trim.combo > 1 ? `${trim.combo} clean snips · Space also works` : 'The next claw is selected for you · Space also works', center, bottom - 29, 12, C.muted, 'center', 'sans', width);
  }

  private freePlay(game: Game, world: World) {
    const { ctx, layout } = this, center = this.center, width = this.panelWidth, x = center - width / 2;
    const { header, pause } = layout;
    round(ctx, header.x, header.y, header.w, header.h, 12, C.paper, C.line);
    text(ctx, 'FREE PLAY', header.x + 14, header.y + 17, 14, C.green, 'left', 'bold');
    text(ctx, 'No mess · always-fed cats', header.x + 14, header.y + 35, 11, C.muted);
    this.button('pause', 'Ⅱ', pause.x, pause.y, pause.w, pause.h);
    const catWidth = width / Math.max(1, game.cats.length);
    game.cats.forEach((cat, i) => {
      const cx = x + i * catWidth, selected = cat.id === game.selectedFreeCatId;
      round(ctx, cx + 2, this.top + 55, catWidth - 4, 44, 10, selected ? C.green : C.paper, C.line);
      ellipse(ctx, cx + catWidth / 2, this.top + 66, 4, 4, cat.color);
      text(ctx, cat.name, cx + catWidth / 2, this.top + 84, 11, selected ? C.paper : C.ink, 'center', 'bold', catWidth - 8);
      this.addHit({ id: `free-cat:${cat.id}`, label: `Choose ${cat.name}${selected ? ', selected' : ''}`, x: cx + 2, y: this.top + 55, w: catWidth - 4, h: 44 });
    });
    const room = this.worldViewport(game);
    ctx.save(); ctx.beginPath(); ctx.rect(room.x, room.y, room.w, room.h); ctx.clip();
    const cat = game.cats.find(c => c.id === game.selectedFreeCatId);
    if (cat) {
      const rump = game.freeInteraction === 'pet' ? world.bonusPatTarget(cat.id) : undefined;
      if (rump?.visible) {
        ellipse(ctx, rump.x, rump.y, 20, 20, 'rgba(255,249,235,0.45)');
        ctx.beginPath(); ctx.arc(rump.x, rump.y, 21, 0, Math.PI * 2);
        ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.stroke();
        paw(ctx, rump.x, rump.y, 24, C.green);
      }
      const anchor = world.catLabelPosition(cat.id), point = anchor && world.project(anchor);
      if (point?.visible) {
        round(ctx, point.x - 40, point.y - 18, 80, 24, 9, C.paper, C.green);
        text(ctx, cat.name, point.x, point.y - 6, 12, C.green, 'center', 'bold');
        if (cat.happyUntil > game.clock) heart(ctx, point.x + 47, point.y - 7, 16);
      }
    }
    ctx.restore();
    const y = this.height - this.bottom - 212;
    const modeWidth = width / 3;
    ([['pet', 'Butt pats'], ['wand', 'Wand'], ['camera', 'Camera']] as const).forEach(([id, label], i) =>
      this.button(`free-mode:${id}`, label, x + i * modeWidth + 2, y, modeWidth - 4, 44, game.freeInteraction === id));
    const directionWidth = width / 6;
    ([['left', '←'], ['right', '→'], ['up', '↑'], ['down', '↓'], ['forward', 'Near'], ['back', 'Far']] as const).forEach(([id, label], i) =>
      this.button(`free-move:${id}`, label, x + i * directionWidth + 2, y + 52, directionWidth - 4, 44));
    const viewWidth = width / 3;
    ([['out', '− Zoom'], ['in', '+ Zoom'], ['reset', 'Reset view']] as const).forEach(([id, label], i) =>
      this.button(`view:${id}`, label, x + i * viewWidth + 2, y + 104, viewWidth - 4, 44));
    const instruction = game.freeInteraction === 'pet' ? 'Tap or stroke the selected cat’s butt.'
      : game.freeInteraction === 'wand' ? 'Wave near any cat to catch its attention.' : 'Drag to look · right-drag to pan';
    text(ctx, instruction, center, y + 165, 12, C.ink, 'center', 'sans', width);
    text(ctx, 'Wheel: zoom · WASD / Q E: move · arrows above: move', center, y + 187, 11, C.muted, 'center', 'sans', width);
    if (game.feedbackUntil > game.clock) text(ctx, game.feedback, center, y + 207, 11, C.green, 'center', 'sans', width);
  }

  private gameplay(game: Game, world: World) {
    const { ctx, width: w, height: h, layout } = this;
    const { header, room, pause } = layout;
    const seconds = Math.ceil(game.timeLeft);
    const timer = game.phase === 'tutorial' ? 'Practice' : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
    const tutorial = game.phase === 'tutorial' || (game.phase === 'paused' && game.resumePhase === 'tutorial');
    round(ctx, header.x, header.y, header.w, header.h, 12, C.paper, C.line);
    heart(ctx, header.x + 17, header.y + 19, 15, game.hp <= 30 ? C.red : C.coral);
    text(ctx, `${game.hp} HP`, header.x + 31, header.y + 19, 13, C.ink, 'left', 'bold');
    round(ctx, header.x + 12, header.y + 34, 70, 5, 2, C.line);
    round(ctx, header.x + 12, header.y + 34, 70 * game.hp / 100, 5, 2, game.hp <= 30 ? C.red : C.green);
    const stageX = header.x + header.w * 0.54;
    text(ctx, tutorial ? `Lesson ${game.tutorialStep + 1}/5` : `Stage ${game.stage + 1}/5`, stageX, header.y + 18, 12, C.ink, 'center', 'bold');
    for (let i = 0; i < 5; i++) ellipse(ctx, stageX + (i - 2) * 10, header.y + 36, 3, 3,
      i <= (tutorial ? game.tutorialStep : game.stage) ? C.green : C.line);
    text(ctx, tutorial ? 'Untimed' : timer, header.x + header.w - 12, header.y + 18, 13, C.ink, 'right', 'bold');
    if (!tutorial) {
      round(ctx, header.x + header.w - 62, header.y + 34, 50, 5, 2, C.line);
      round(ctx, header.x + header.w - 62, header.y + 34, 50 * game.timeLeft / game.config.duration, 5, 2, C.coral);
    }

    this.bubbleCenters = [];
    ctx.save(); ctx.beginPath(); ctx.rect(room.x, room.y, room.w, room.h); ctx.clip();
    const inView = (event: CareEvent) => {
      const p = world.project(world.eventPosition(event));
      return p.visible && p.x >= room.x + 32 && p.x <= room.x + room.w - 32 && p.y >= room.y + 32 && p.y <= room.y + room.h - 32;
    };
    // Reserve visible care targets before placing edge navigation markers.
    [...game.events].sort((a, b) => Number(inView(b)) - Number(inView(a)))
      .forEach(event => this.eventCard(game, world, event, game.events.length));
    for (const cat of game.cats) if (cat.happyUntil > game.clock) {
      const anchor = world.catLabelPosition(cat.id);
      if (!anchor) continue;
      const p = world.project(anchor), age = 1.8 - (cat.happyUntil - game.clock);
      if (p.visible) {
        ctx.save(); ctx.globalAlpha = Math.min(1, (1.8 - age) * 2);
        heart(ctx, p.x + 19, p.y - 12 - age * 22, 15 + Math.sin(Math.min(1, age * 3) * Math.PI) * 5);
        if (age > 0.2) heart(ctx, p.x - 13, p.y - age * 16, 10);
        ctx.restore();
      }
    }
    ctx.restore();
    const gyroLabel = ({ off: 'Gyro off', on: 'Gyro on', waiting: 'Connecting…', denied: 'Retry gyro', unavailable: 'No gyro' } as Record<string, string>)[this.gyroStatus] ?? 'Gyro off';
    const controls = [['out', '−'], ['in', '+'], ['reset', 'Reset view'], ['gyro', gyroLabel]];
    controls.forEach(([id, label], i) => {
      const r = layout.viewControls[i];
      const disabled = id === 'in' && world.viewZoom >= 2.5 - 1e-6 || id === 'out' && world.viewZoom <= 1 + 1e-6 || id === 'gyro' && this.gyroStatus === 'waiting';
      round(ctx, r.x + 2, r.y, r.w - 4, r.h, 10, disabled ? C.cream : id === 'gyro' && this.gyroStatus === 'on' ? C.paleGreen : C.paper, C.line);
      text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, i < 2 ? 24 : 12, disabled ? C.muted : C.ink, 'center', 'bold', r.w - 12);
      this.addHit({ id: 'view:' + id, label: i === 0 ? 'Zoom out' : i === 1 ? 'Zoom in' : label, disabled, x: r.x + 2, y: r.y, w: r.w - 4, h: r.h });
    });
    const status = layout.status;
    if (tutorial && !game.tutorialDone) careGuide(ctx, TOOLS[game.tutorialStep].id, status.x + status.w / 2, status.y + status.h / 2, this.animationTime);
    else if (game.selected === 'vacuum') careGuide(ctx, 'vacuum', status.x + status.w / 2, status.y + status.h / 2, this.animationTime);
    const tray = game.availableTools, first = layout.tools[0], last = layout.tools.at(-1)!;
    const slotWidth = (last.x + last.w - first.x) / tray.length;
    tray.forEach((tool, i) => {
      const r = { x: first.x + i * slotWidth, y: first.y, w: slotWidth, h: first.h }, selected = game.selected === tool.id;
      round(ctx, r.x + 2, r.y, r.w - 4, r.h, 10, selected ? C.green : C.paper, selected ? C.green : C.line);
      toolIcon(ctx, tool.id, r.x + r.w / 2, r.y + 20, 29);
      text(ctx, tool.name, r.x + r.w / 2, r.y + 43, 11, selected ? C.paper : C.ink, 'center', 'bold');
      if (tool.id === 'vacuum') text(ctx, '3-IN-1', r.x + r.w / 2, r.y + 56, 10, selected ? C.paper : C.green, 'center', 'bold');
      else for (let level = 0; level < 3; level++) ellipse(ctx, r.x + r.w / 2 + (level - 1) * 7, r.y + 56, 2, 2,
        level < game.levels[tool.id] ? (selected ? C.paper : C.green) : (selected ? '#809478' : C.line));
      const needs = game.events.filter(e => toolMatches(tool, e.kind)).length;
      if (needs) {
        ellipse(ctx, r.x + r.w - 11, r.y + 10, 8, 8, C.coral);
        text(ctx, String(needs), r.x + r.w - 11, r.y + 10, 10, C.paper, 'center', 'bold');
      }
      this.addHit({ id: 'tool:' + tool.id, label: `${tool.name}, ${tool.id === 'vacuum' ? 'one-tap cleanup' : `level ${game.levels[tool.id]}`}${selected ? ', selected' : ''}`, ...r });
    });
    round(ctx, pause.x, pause.y, pause.w, pause.h, 12, C.paper, C.line);
    line(ctx, [[pause.x + pause.w / 2 - 4, pause.y + 13], [pause.x + pause.w / 2 - 4, pause.y + 30]], C.ink, 3);
    line(ctx, [[pause.x + pause.w / 2 + 4, pause.y + 13], [pause.x + pause.w / 2 + 4, pause.y + 30]], C.ink, 3);
    this.addHit({ id: 'pause', label: 'Pause', ...pause });
    if (tutorial && game.tutorialDone) this.tutorialCaption(game, room.y + 4);
    if (game.events.some(e => game.warning(e))) {
      ctx.strokeStyle = 'rgba(168,48,40,' + (0.25 + Math.sin(game.clock * 18) * 0.12) + ')'; ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, w - 8, h - 8);
    }
  }

  private tutorialCaption(game: Game, y: number) {
    const center = this.layout.room.x + this.layout.room.w / 2, bw = Math.min(this.layout.room.w - 16, 180);
    this.button('tutorial-next', game.tutorialStep === 4 ? '✓  Play  →' : '✓  Next  →', center - bw / 2, y, bw, 48, true);
  }
  private eventCard(game: Game, world: World, event: CareEvent, count: number) {
    const ctx = this.ctx, cat = game.cats.find(c => c.id === event.catId)!;
    const screen = world.project(world.eventPosition(event));
    const anchor = world.catLabelPosition(cat.id);
    if (!anchor) return;
    const thought = world.project(anchor), radius = 24;
    const area = this.layout.room;
    const minX = area.x + 32, maxX = area.x + area.w - 32;
    const minY = area.y + 32, maxY = area.y + area.h - 32;
    if (!screen.visible || screen.x < minX || screen.x > maxX || screen.y < minY || screen.y > maxY) {
      // An edge marker brings the actual target into view; it never performs care remotely.
      let x = Math.max(minX, Math.min(maxX, screen.x));
      let y = Math.max(minY, Math.min(maxY, screen.y));
      const candidates = [{ x, y }];
      for (let cy = minY; cy <= maxY; cy += 58) for (const cx of [minX, maxX]) candidates.push({ x: cx, y: cy });
      for (let cx = minX; cx <= maxX; cx += 58) for (const cy of [minY, maxY]) candidates.push({ x: cx, y: cy });
      candidates.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
      for (const candidate of candidates) {
        const clearTargets = this.hits.every(hit => candidate.x + 32 <= hit.x || candidate.x - 32 >= hit.x + hit.w
          || candidate.y + 32 <= hit.y || candidate.y - 32 >= hit.y + hit.h);
        if (clearTargets && this.bubbleCenters.every(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) > 57)) {
          x = candidate.x; y = candidate.y; break;
        }
      }
      this.bubbleCenters.push({ x, y });
      round(ctx, x - 26, y - 26, 52, 52, 14, C.paper, game.urgency(event) === 'calm' ? C.green : C.red);
      needIcon(ctx, event.kind, x, y - 4, 25, cat.color);
      text(ctx, '↗', x + 17, y + 17, 13, C.ink, 'center');
      this.addHit({ id: 'focus:' + event.id, x: x - 26, y: y - 26, w: 52, h: 52 });
      return;
    }
    let x = Math.max(minX, Math.min(maxX, thought.x));
    const playArea = event.kind === 'boredom' ? world.playArea(event) : undefined;
    let y = Math.max(minY, Math.min(maxY, playArea ? playArea.y - playArea.outerY - 35 : thought.y - 29));
    const preferred = { x, y };
    for (const [dx, dy] of [[0, 0], [-58, 0], [58, 0], [0, -58], [-58, -58], [58, -58], [0, -116]]) {
      const candidate = { x: Math.max(minX, Math.min(maxX, preferred.x + dx)), y: Math.max(minY, Math.min(maxY, preferred.y + dy)) };
      if (this.bubbleCenters.every(p => Math.hypot(p.x - candidate.x, p.y - candidate.y) > 57)) { x = candidate.x; y = candidate.y; break; }
    }
    this.bubbleCenters.push({ x, y });
    if (thought.visible && (Math.abs(x - thought.x) > 30 || Math.abs(y - thought.y) > 65)) line(ctx, [[x, y + radius], [thought.x, thought.y + 18]], 'rgba(255,249,235,0.65)', 1.5);
    const urgency = game.urgency(event), color = urgency === 'calm' ? C.green : C.red;
    const patience = Number.isFinite(event.deadline) ? Math.max(0, (event.deadline - game.clock) / (event.deadline - event.createdAt)) : 1;
    // Two trailing dots attach the cloud to the cat. No written need or tool name.
    ellipse(ctx, x - 8, y + radius + 14, 4, 4, C.paper);
    ellipse(ctx, x - 4, y + radius + 5, 7, 7, C.paper);
    ellipse(ctx, x, y, radius + 7, radius, 'rgba(73,62,56,0.12)');
    ellipse(ctx, x, y - 2, radius + 5, radius, C.paper);
    needIcon(ctx, event.kind, x, y - 4, radius * 1.18, cat.color);
    ctx.beginPath(); ctx.arc(x, y - 2, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * patience);
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
    if (urgency === 'angry') {
      for (let i = 0; i < 3; i++) line(ctx, [[x + radius - 5 + i * 5, y - radius - 1], [x + radius - 8 + i * 5, y - radius + 11]], C.red, 2);
    }
    if (playArea) {
      const a = playArea, active = world.carePointer?.eventId === event.id && world.carePointer.working;
      // A hollow arch keeps the cat's face clear and offers a generous hold area.
      ctx.beginPath(); ctx.ellipse(a.x, a.y, a.outerX, a.outerY, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(a.x + a.innerX, a.y);
      ctx.ellipse(a.x, a.y, a.innerX, a.innerY, 0, 0, -Math.PI, true); ctx.closePath();
      ctx.fillStyle = active ? 'rgba(165,185,154,0.32)' : 'rgba(255,249,235,0.22)'; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,249,235,0.9)'; ctx.stroke();
      ctx.setLineDash([6, 5]); ctx.lineWidth = 2; ctx.strokeStyle = active ? C.green : '#97412a'; ctx.stroke(); ctx.setLineDash([]);
      if (event.progress > 0) {
        ctx.beginPath(); ctx.ellipse(a.x, a.y, a.outerX + 5, a.outerY + 5, 0, Math.PI, Math.PI + Math.PI * event.progress);
        ctx.lineWidth = 4; ctx.strokeStyle = C.green; ctx.stroke();
      }
      if (!active) {
        toolIcon(ctx, 'toy', a.x + a.outerX * 0.67, a.y - a.outerY * 0.48, 30);
        if (game.selected === 'toy') {
          const cy = a.y - (a.outerY + a.innerY) / 2;
          line(ctx, [[a.x - 15, cy], [a.x + 15, cy]], C.green, 2);
          line(ctx, [[a.x - 10, cy - 4], [a.x - 15, cy], [a.x - 10, cy + 4]], C.green, 2);
          line(ctx, [[a.x + 10, cy - 4], [a.x + 15, cy], [a.x + 10, cy + 4]], C.green, 2);
        }
      }
      if (game.wrongToolEventId === event.id && game.clock < game.wrongToolUntil && game.selected !== 'toy') {
        toolIcon(ctx, 'toy', a.x, a.y - (a.outerY + a.innerY) / 2, 38);
      }
      this.addHit({ id: 'event:' + event.id, eventId: event.id, tool: 'toy', arch: a,
        x: a.x - a.outerX, y: a.y - a.outerY, w: a.outerX * 2, h: a.outerY });
      return;
    }
    const width = count > 1 ? 84 : 112, height = 52;
    const left = Math.max(area.x, Math.min(area.x + area.w - width, screen.x - width / 2));
    const top = Math.max(area.y, Math.min(area.y + area.h - height - 4, screen.y - height / 2));
    // Only the floor target cleans a mess. A distant cat never moves or cleans its old mess.
    ctx.beginPath(); ctx.ellipse(left + width / 2, top + height / 2, width / 2 - 7, height / 2 - 5, 0, 0, Math.PI * 2);
    // Deep terracotta echoes the room's warm wood; a pale keyline separates it
    // from dark coats and furniture as well as the light floor and sage rug.
    ctx.fillStyle = 'rgba(151,65,42,0.10)'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,239,214,0.95)'; ctx.stroke();
    ctx.setLineDash([7, 5]); ctx.lineWidth = 3; ctx.strokeStyle = '#97412a'; ctx.stroke(); ctx.setLineDash([]);
    if (event.progress > 0) {
      round(ctx, left + 14, top + height - 2, width - 28, 4, 2, '#e5d9c1');
      round(ctx, left + 14, top + height - 2, (width - 28) * event.progress, 4, 2, C.green);
    }
    if (game.wrongToolEventId === event.id && game.clock < game.wrongToolUntil && !toolMatches(TOOL_BY_ID[game.selected], event.kind)) {
      toolIcon(ctx, game.toolFor(event.kind).id, left + width / 2, top - 18, 27);
      line(ctx, [[left + width - 22, top + 7], [left + width - 10, top + 19]], C.red, 3);
      line(ctx, [[left + width - 10, top + 7], [left + width - 22, top + 19]], C.red, 3);
    }
    this.addHit({ id: 'event:' + event.id, eventId: event.id, tool: game.toolFor(event.kind).id, x: left, y: top, w: width, h: height });
    if (event.kind === 'hunger') this.addHit({ id: 'thought:' + event.id, eventId: event.id, tool: game.toolFor(event.kind).id, x: x - radius, y: y - radius, w: radius * 2, h: radius * 2 });
  }

  private adoption(game: Game) {
    this.backdrop(); this.brand();
    const ctx = this.ctx, h = this.height, center = this.center;
    const top = this.top + (this.compact ? 48 : 76);
    text(ctx, `✓  ${game.stage + 1} / 5`, center, top, 18, C.green, 'center', 'bold');
    text(ctx, 'Adopt', center, top + 40, 34, C.ink, 'center', 'serif');
    heart(ctx, center - 46, top + 73, 17);
    text(ctx, `${game.hp} / 100`, center + 10, top + 73, 15, C.green, 'center', 'bold');
    const panel = this.panelWidth, x = center - panel / 2, gap = 12, cw = (panel - gap) / 2;
    const y = h - this.bottom - 130;
    game.candidates.forEach((cat, i) => {
      const cx = x + i * (cw + gap);
      round(ctx, cx, y, cw, 100, 14, C.paper, C.line);
      ellipse(ctx, cx + 18, y + 24, 6, 6, cat.color);
      text(ctx, cat.name, cx + 32, y + 24, 21, C.ink, 'left', 'serif', cw - 44);
      this.button(`adopt:${cat.id}`, `Adopt ${cat.name}`, cx + 8, y + 43, cw - 16, 48, true);
    });
    this.upgradeRewards(game, h - this.bottom - 15);
  }

  private upgrade(game: Game) {
    const { ctx, height: h } = this, center = this.center;
    ctx.fillStyle = C.cream; ctx.fillRect(0, 0, this.width, h); this.brand();
    const width = this.panelWidth, x = center - width / 2;
    const top = this.top + (this.compact ? 51 : 74);
    text(ctx, 'Upgrade', center, top, Math.min(36, width * 0.105), C.ink, 'center', 'serif');
    this.upgradeRewards(game, top + 35);
    if (!game.vacuumUnlocked) {
      const ready = CLEANING_TOOLS.filter(tool => game.levels[tool] >= 3).length;
      text(ctx, 'Sweeper + Mop + Brush → Vacuum', center, top + 64, 12, C.muted, 'center', 'sans', width - 8);
      text(ctx, `Get each to level 3 · ${ready}/3 ready`, center, top + 81, 11, C.muted, 'center', 'sans', width - 8);
    }
    const y = top + (game.vacuumUnlocked ? 62 : 110), gap = 8;
    const rowTools = game.availableTools;
    const rowH = Math.min(76, (h - this.bottom - 40 - y - gap * (rowTools.length - 1)) / rowTools.length);
    rowTools.forEach((tool, i) => {
      const cy = y + i * (rowH + gap), level = game.levels[tool.id], disabled = tool.id === 'vacuum' || level >= 3;
      round(ctx, x, cy, width, rowH, 12, disabled ? '#eae3d5' : C.paper, C.line);
      toolIcon(ctx, tool.id, x + 28, cy + rowH / 2, 32);
      text(ctx, tool.name, x + 54, cy + rowH / 2 - 9, 15, disabled ? C.muted : C.ink, 'left', 'bold');
      text(ctx, tool.id === 'vacuum' ? '3 → 1  ✓' : disabled ? `${EFFICIENCY[level]}×  ✓` : `${EFFICIENCY[level]}× → ${EFFICIENCY[level + 1]}×`, x + 54, cy + rowH / 2 + 11, 12, C.muted);
      text(ctx, tool.id === 'vacuum' ? '✓' : disabled ? 'MAX' : '+', x + width - 20, cy + rowH / 2, disabled ? 12 : 25, disabled ? C.muted : C.green, 'center', 'bold');
      this.addHit({ id: `upgrade:${tool.id}`, label: tool.id === 'vacuum' ? 'Vacuum unlocked' : `Upgrade ${tool.name} to level ${level + 1}`, disabled, x, y: cy, w: width, h: rowH });
    });
    for (let i = 0; i < 5; i++) paw(ctx, center + (i - 2) * 28, h - this.bottom - 14, 18, i < game.cats.length ? C.green : C.line);
  }

  private vacuumUnlock(game: Game) {
    if (!this.vacuumUnlockVisible || (game.phase !== 'upgrade' && !game.active)) return;
    const { ctx } = this, age = this.vacuumUnlockAge;
    const width = Math.min(this.panelWidth, 340), height = this.compact ? 100 : 120;
    const y = game.phase === 'upgrade' ? this.top : this.layout.room.y + 8;
    const enter = Math.min(1, age / .18), fade = Math.min(1, (2.6 - age) / .35);
    const merge = this.reducedMotion ? 1 : THREE.MathUtils.smoothstep(age, .2, .85);
    ctx.save(); ctx.globalAlpha = enter * fade;
    ctx.translate(this.center, y - (this.reducedMotion ? 0 : (1 - enter) * 10));
    round(ctx, -width / 2, 0, width, height, 18, '#fff7e4', '#c8b17d');
    text(ctx, 'Vacuum unlocked!', 0, 21, this.compact ? 19 : 21, C.green, 'center', 'serif', width - 24);
    const iconY = this.compact ? 54 : 66;
    if (merge < 1) {
      ctx.save(); ctx.globalAlpha *= 1 - merge;
      CLEANING_TOOLS.forEach((tool, i) => toolIcon(ctx, tool, (i - 1) * 70 * (1 - merge), iconY, 32 * (1 - merge * .3)));
      ctx.restore();
    }
    if (merge > 0) {
      ctx.save(); ctx.globalAlpha *= merge;
      const pop = this.reducedMotion ? 1 : 1 + Math.sin(merge * Math.PI) * .18;
      toolIcon(ctx, 'vacuum', 0, iconY, (this.compact ? 39 : 49) * pop);
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, radius = 32 + merge * 14;
        const x = Math.cos(angle) * radius, y = iconY + Math.sin(angle) * radius * .55;
        line(ctx, [[x - Math.cos(angle) * 3, y - Math.sin(angle) * 3], [x + Math.cos(angle) * 3, y + Math.sin(angle) * 3]], '#b8964e', 1.5);
      }
      ctx.restore();
    }
    text(ctx, 'One tap clears poop, spills & fur.', 0, height - 16, 12, C.muted, 'center', 'sans', width - 24);
    ctx.restore();
  }

  private pause(game: Game) {
    const { ctx, height: h } = this, center = this.center;
    ctx.fillStyle = 'rgba(43,38,33,0.52)'; ctx.fillRect(0, 0, this.width, h);
    const width = Math.min(this.panelWidth, 390), height = Math.min(h - this.top - this.bottom - 12, this.modal === 'help' ? 424 : 400);
    const x = center - width / 2, y = this.top + (h - this.top - this.bottom - height) / 2;
    round(ctx, x, y, width, height, 22, C.paper, C.line);
    const bx = x + 18, bw = width - 36;
    if (this.modal === 'help') {
      text(ctx, 'Controls', center, y + 30, 24, C.ink, 'center', 'serif', width - 24);
      if (game.inFreePlay) {
        const instructions = ['Choose an adopted cat above the room.', 'Pet: tap or stroke the cat’s butt.', 'Wand: drag in the room to play.', 'Camera: drag to look, right-drag to pan.', 'Wheel or + / − to zoom. WASD / Q E to move.', 'Use the six direction buttons on touchscreens.'];
        instructions.forEach((value, i) => text(ctx, value, center, y + 76 + i * 37, 12, C.ink, 'center', 'sans', width - 32));
      } else if (game.inBonus && game.bonus?.id === 'pawdicure') {
        paw(ctx, center, y + 95, 50, C.coral);
        const instructions = ['Watch the ring around the active toe.', 'The dot sweeps back and forth.', 'Tap the paw or press Space when the dot is green.', 'Each claw has its own green arc.', 'Trim all four paws before time runs out.'];
        instructions.forEach((value, i) => text(ctx, value, center, y + 148 + i * 31, 13, C.ink, 'center', 'sans', width - 32));
      } else if (game.inBonus) {
        paw(ctx, center, y + 100, 55, C.coral);
        text(ctx, 'Tap every cat’s butt.', center, y + 160, 16, C.ink, 'center', 'bold', width - 32);
        text(ctx, 'Pat each cat at least once every 3 seconds.', center, y + 192, 12, C.ink, 'center', 'sans', width - 32);
        text(ctx, 'Last 10 seconds to win +1 upgrade.', center, y + 220, 12, C.muted, 'center', 'sans', width - 32);
      } else game.availableTools.forEach((tool, i) => careGuide(ctx, tool.id, center, y + 79 + i * 48, this.animationTime));
      this.button('back', 'Back', bx, y + height - 66, bw, 48, true);
      return;
    }
    if (this.modal === 'restart' || this.modal === 'home') {
      const home = this.modal === 'home';
      paw(ctx, center, y + 52, 40, C.coral);
      text(ctx, home ? 'Main menu?' : 'Restart?', center, y + 105, 30, C.ink, 'center', 'serif');
      text(ctx, game.inFreePlay ? 'Your free play unlock and cats are saved.' : 'Progress will be reset.', center, y + 146, 13, C.muted, 'center', 'sans', width - 32);
      this.button('back', 'Cancel', bx, y + height - 130, bw, 48, true);
      this.button(home ? 'confirm-home' : 'confirm-restart', home ? 'Main menu' : 'Restart', bx, y + height - 68, bw, 48);
      return;
    }
    text(ctx, 'Paused', center, y + 36, 30, C.ink, 'center', 'serif', width - 24);
    this.button('sound', this.soundLabel, bx, y + 68, (bw - 8) / 2, 44);
    this.button('language', languageLabel(), bx + (bw + 8) / 2, y + 68, (bw - 8) / 2, 44);
    const by = y + height - 258;
    this.button('resume', 'Resume  →', bx, by, bw, 52, true);
    this.button('help', 'Controls', bx, by + 65, bw, 48);
    this.button('restart', game.practiceBonus ? 'Restart Pawdicure' : game.inFreePlay ? 'Restart free play' : game.resumePhase === 'tutorial' ? 'Restart tutorial' : 'Restart shift', bx, by + 126, bw, 48);
    this.button('home', 'Main menu', bx, by + 187, bw, 48);
  }

  private victory(game: Game, world: World) {
    const ctx = this.ctx, center = this.center, width = this.panelWidth;
    text(ctx, 'Victory', center, this.top + 35, Math.min(42, width * 0.12), C.ink, 'center', 'serif');
    for (let i = 0; i < 5; i++) paw(ctx, center + (i - 2) * 28, this.top + 72, 20, i < game.stagesSurvived ? C.green : C.line);
    world.victoryHearts().forEach((point, i) => {
      const cycle = (this.animationTime * 0.42 + i * 0.23) % 1;
      if (!point.visible) return;
      ctx.save(); ctx.globalAlpha = Math.sin(cycle * Math.PI) * 0.85;
      heart(ctx, point.x + Math.sin(cycle * 4 + i) * 9, point.y - cycle * 27, 11 + Math.sin(cycle * Math.PI) * 5);
      ctx.restore();
    });
    const x = center - width / 2, y = this.height - this.bottom - 190;
    this.button('free-play', 'Free play unlocked →', x, y, width, 52, true);
    this.button('restart', 'Play again', x, y + 64, width, 48);
    this.button('home', 'Main menu', x, y + 122, width, 48);
  }

  private ending(game: Game) {
    this.backdrop(); this.brand();
    const ctx = this.ctx, h = this.height, center = this.center, win = game.phase === 'victory';
    const top = this.top + (this.compact ? 49 : 85);
    text(ctx, win ? 'Victory' : 'Game over', center, top + 44, Math.min(42, this.panelWidth * 0.11), C.ink, 'center', 'serif');
    for (let i = 0; i < 5; i++) paw(ctx, center + (i - 2) * 28, top + 82, 20, i < game.stagesSurvived ? C.green : C.line);
    const width = this.panelWidth, x = center - width / 2, y = h - this.bottom - 220;
    round(ctx, x, y, width, 72, 14, C.paper, C.line);
    text(ctx, `${game.stagesSurvived} / 5`, x + width * 0.25, y + 24, 24, C.ink, 'center', 'serif');
    text(ctx, String(game.completed), x + width * 0.75, y + 24, 24, C.ink, 'center', 'serif');
    text(ctx, 'STAGES SURVIVED', x + width * 0.25, y + 50, 10, C.muted, 'center');
    text(ctx, 'TASKS COMPLETED', x + width * 0.75, y + 50, 10, C.muted, 'center');
    this.button('restart', 'Play again  →', x, y + 87, width, 52, true);
    this.button('home', 'Main menu', x, y + 152, width, 48);
  }

  private interactionStates() {
    const ctx = this.ctx;
    for (const hit of this.hits) {
      if (hit.eventId !== undefined || hit.disabled || hit.id === 'paw-clip') continue;
      const focused = hit.id === this.focusedId, pressed = hit.id === this.pressedId, hovered = hit.id === this.hoveredId;
      if (!focused && !pressed && !hovered) continue;
      round(ctx, hit.x + 2, hit.y + 2, hit.w - 4, hit.h - 4, 10, pressed ? 'rgba(73,62,56,0.18)' : 'rgba(73,62,56,0.05)');
      ctx.beginPath(); ctx.roundRect(hit.x + 3, hit.y + 3, hit.w - 6, hit.h - 6, 9);
      ctx.strokeStyle = focused ? '#302921' : C.green; ctx.lineWidth = focused ? 3 : 2; ctx.stroke();
      if (focused) { ctx.beginPath(); ctx.roundRect(hit.x + 6, hit.y + 6, hit.w - 12, hit.h - 12, 6); ctx.strokeStyle = C.paper; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }

  private scratches(age: number) {
    const ctx = this.ctx, w = this.width, h = this.height;
    const fade = Math.min(1, (1.15 - age) / 0.45);
    ctx.save();
    const vignette = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.12, w / 2, h / 2, Math.max(w, h) * 0.7);
    vignette.addColorStop(0, 'rgba(109,18,21,0)'); vignette.addColorStop(1, 'rgba(109,18,21,' + (0.85 * fade) + ')');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
    // Two timed claw swipes cut across most of the screen and fade after impact.
    for (let swipe = 0; swipe < 2; swipe++) {
      const progress = Math.min(1, Math.max(0, (age - 0.17 - swipe * 0.19) / 0.12));
      if (!progress) continue;
      for (let claw = 0; claw < 4; claw++) {
        const offset = (claw - 1.5) * w * 0.10;
        const sx = swipe ? w * 0.08 + offset : w * 0.92 + offset;
        const sy = h * (0.14 + swipe * 0.10);
        const ex = swipe ? w * 0.92 + offset : w * 0.08 + offset;
        const ey = h * (0.83 + swipe * 0.06);
        const dx = ex - sx, dy = ey - sy;
        const normalX = -dy / Math.hypot(dx, dy), normalY = dx / Math.hypot(dx, dy);
        const cut = (width: number, color: string) => {
          ctx.beginPath();
          for (const side of [-1, 1]) for (let n = 0; n <= 24; n++) {
            const u = (side === -1 ? n : 24 - n) / 24;
            const t = u * progress;
            const thickness = Math.pow(Math.sin(u * Math.PI), 0.7) * width * (0.85 + Math.sin(u * 67 + claw) * 0.15);
            const px = sx + dx * t + normalX * Math.sin(t * Math.PI) * 14;
            const py = sy + dy * t + normalY * Math.sin(t * Math.PI) * 14;
            if (side === -1 && n === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px + normalX * side * thickness, py + normalY * side * thickness);
          }
          ctx.closePath(); ctx.fillStyle = color; ctx.fill();
        };
        ctx.shadowColor = 'rgba(103,28,25,' + fade * 0.5 + ')'; ctx.shadowBlur = 7;
        cut(5.5, 'rgba(113,33,28,' + fade * 0.92 + ')');
        ctx.shadowBlur = 0;
        cut(2.7, 'rgba(226,166,130,' + fade * 0.95 + ')');
        cut(0.7, 'rgba(255,238,204,' + fade * 0.75 + ')');

      }
    }
    if (age > 0.17 && age < 0.23) { ctx.fillStyle = 'rgba(255,234,216,0.24)'; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  }

  draw(game: Game, world: World, dt: number, force = false) {
    this.selectedTool = game.selected;
    this.elapsed += dt;
    this.animationTime += dt;
    if (!game.vacuumUnlocked || ['title', 'game-over', 'victory', 'free-play'].includes(game.phase)) this.vacuumUnlockAge = Infinity;
    else if (game.phase !== 'paused' && !this.rotateRequired) this.vacuumUnlockAge += dt;
    this.damageFlash = game.phase === 'paused' ? 0 : Math.max(0, 1.15 - world.attackAge);
    if (!force && !this.dirty && this.lastPhase === game.phase && this.elapsed < 1 / 30) return;
    if (this.lastPhase !== game.phase) { this.modal = undefined; this.clearInteraction(); }
    this.lastPhase = game.phase; this.elapsed = 0; this.dirty = false;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.width, this.height); this.hits = [];
    if (this.rotateRequired) this.rotationScreen();
    else if (game.phase === 'title') this.title(game);
    else if (game.phase === 'cat-dex') this.catDex(game);
    else if (game.phase === 'adoption') this.adoption(game);
    else if (game.phase === 'upgrade') this.upgrade(game);
    else if (game.phase === 'victory') this.victory(game, world);
    else if (game.phase === 'game-over') this.ending(game);
    else {
      if (game.inFreePlay) this.freePlay(game, world);
      else if (game.inBonus) this.bonusRound(game, world);
      else this.gameplay(game, world);
      if (game.phase === 'paused') { this.hits = []; this.pause(game); }
    }
    if (!this.rotateRequired && this.pointer && game.active && this.pointerTool) {
      const contact = world.carePointer;
      const care = game.events.find(e => e.id === contact?.eventId);
      const active = !!care && !!contact?.working;
      const p = this.pointer;
      ctx.save(); const room = this.layout.room; ctx.beginPath(); ctx.rect(room.x, room.y, room.w, room.h); ctx.clip();
      if (this.pointerTool === 'toy' && contact) {
        const lure = p, grip = { x: p.x + 38, y: p.y - 58 };
        line(ctx, [[grip.x + 15, grip.y + 36], [grip.x, grip.y]], '#a7835e', 5);
        ctx.beginPath(); ctx.moveTo(grip.x, grip.y);
        ctx.quadraticCurveTo(lure.x + 26, lure.y - 12, lure.x, lure.y);
        ctx.strokeStyle = '#67584c'; ctx.lineWidth = 1.5; ctx.stroke();
        const flutter = active ? Math.sin(game.clock * 16) * 0.25 : 0;
        ellipse(ctx, lure.x - 3, lure.y + 3, 4, 11, '#b6a2c8', 0.35 + flutter);
        ellipse(ctx, lure.x + 4, lure.y + 2, 3, 10, '#91b9bd', -0.35 + flutter);
        line(ctx, [[lure.x, lure.y - 5], [lure.x - 5, lure.y + 12]], '#81718d', 1);
      } else if (this.pointerTool === 'food' && care) {
        const spout = world.project(world.eventPosition(care).add(new THREE.Vector3(0, (0.073 + care.progress * 0.11 + 0.65) * 0.8, 0)));
        ctx.save(); ctx.translate(spout.x, spout.y); ctx.rotate(active ? 0.6 : 0.15);
        round(ctx, -14, -42, 28, 39, 5, '#d9aa7b', '#a87b55');
        round(ctx, -14, -42, 28, 7, 3, '#a87b55'); paw(ctx, 0, -22, 19, '#fff1d6');
        ellipse(ctx, 0, -3, 7, 2.5, '#7e5b42'); ctx.restore();
      } else {
        // Keep the contact point clear so the material changing underneath remains visible.
        ctx.save(); ctx.translate(p.x + 9, p.y - 18);
        ctx.rotate(active ? Math.sin(game.clock * 24) * contact!.energy * 0.16 : 0);
        toolIcon(ctx, this.pointerTool, 0, 0, 54); ctx.restore();
        if (active && contact!.energy > 0.05) {
          for (let i = 0; i < 6; i++) {
            const phase = (game.clock * 2 + i / 6) % 1;
            const x = p.x + Math.cos(i * 2.4) * (7 + phase * 24), y = p.y + 5 - phase * 16;
            ctx.globalAlpha = (1 - phase) * contact!.energy * 0.7;
            if (this.pointerTool === 'mop') ellipse(ctx, x, y, 2 + phase * 2, 1.7 + phase, '#f9ffff');
            else line(ctx, [[x, y], [x + 4, y - 2]], this.pointerTool === 'brush' ? '#aa97b8' : '#a7835e', 1.5);
          }
        }
      }
      ctx.restore();
    }
    if (!this.rotateRequired) this.vacuumUnlock(game);
    if (!this.rotateRequired && this.damageFlash > 0) this.scratches(world.attackAge);
    if (!this.controls.some(hit => hit.id === this.focusedId)) this.focusedId = undefined;
    this.interactionStates();
    this.texture.needsUpdate = true; this.syncHits();
  }
}
