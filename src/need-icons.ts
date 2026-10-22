import type { EventKind } from './types';

/** Picture language shared by the tutorial and wordless thought bubbles. */
export function needIcon(ctx: CanvasRenderingContext2D, kind: EventKind, x: number, y: number, size: number, coat: string) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 48, size / 48);
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  };
  if (kind === 'poop') {
    oval(0, 12, 19, 8, '#79513b'); oval(-1, 3, 14, 8, '#926649'); oval(1, -5, 8, 7, '#a37955');
    ctx.beginPath(); ctx.moveTo(-5, -7); ctx.quadraticCurveTo(7, -8, 3, -17); ctx.quadraticCurveTo(15, -7, 5, 0); ctx.fillStyle = '#a37955'; ctx.fill();
  } else if (kind === 'vomit') {
    ctx.beginPath(); ctx.moveTo(-22, 7); ctx.bezierCurveTo(-28, -2, -11, -8, -4, -3); ctx.bezierCurveTo(4, -14, 26, -2, 17, 4);
    ctx.bezierCurveTo(32, 11, 14, 21, 4, 16); ctx.bezierCurveTo(-7, 23, -20, 17, -16, 13); ctx.closePath(); ctx.fillStyle = '#b9a056'; ctx.fill();
    for (let i = 0; i < 8; i++) oval(Math.cos(i * 2.4) * 13, 7 + Math.sin(i * 2.4) * 6, 2.7, 2, i % 3 ? '#89623d' : '#e9d8a4');
    oval(19, -9, 3, 5, '#b9a056'); oval(-22, 17, 3, 2, '#b9a056');
  } else if (kind === 'fur') {
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 100; i++) {
      const a = i * 2.4, r = Math.sqrt(i / 100), px = Math.cos(a) * r * 17, py = Math.sin(a) * r * 10;
      const angle = Math.sin(i * 127.1) * 19, dx = Math.cos(angle) * 6, dy = Math.sin(angle) * 5;
      ctx.beginPath(); ctx.moveTo(px - dx, py - dy); ctx.quadraticCurveTo(px + dy * 0.7, py - dx * 0.6, px + dx, py + dy);
      ctx.strokeStyle = i % 3 ? '#a69680' : coat; ctx.stroke();
    }
  } else if (kind === 'hunger') {
    oval(0, 8, 20, 9, '#a56250');
    ctx.fillStyle = '#cf8e7b'; ctx.beginPath(); ctx.roundRect(-20, -2, 40, 15, [0, 0, 10, 10]); ctx.fill();
    oval(0, -2, 20, 7, '#efd7b6'); oval(0, -2, 15, 4, '#87634d');
    // Empty bowl, with a fish silhouette floating above it.
    oval(-2, -15, 8, 4, '#c69b66'); ctx.beginPath(); ctx.moveTo(4, -15); ctx.lineTo(12, -20); ctx.lineTo(12, -10); ctx.closePath(); ctx.fillStyle = '#c69b66'; ctx.fill();
    oval(-6, -16, 1, 1, '#493e38');
  } else {
    ctx.strokeStyle = '#a7835e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-16, 18); ctx.lineTo(-2, -18); ctx.stroke();
    ctx.strokeStyle = '#746353'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-2, -18); ctx.bezierCurveTo(24, -25, 11, -4, 13, 2); ctx.stroke();
    ctx.save(); ctx.translate(13, 8); ctx.rotate(0.5); oval(-3, 1, 4, 11, '#ad91c1'); oval(4, 0, 3, 10, '#81a7ad'); ctx.restore();
  }
  ctx.restore();
}
