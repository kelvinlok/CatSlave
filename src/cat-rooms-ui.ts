import type { Rect } from './layout';

/** Portrait-led chooser: the cat is the target, with a small location badge. */
export function catRoomPortrait(ctx: CanvasRenderingContext2D, rect: Rect,
  portrait: (x: number, y: number, size: number) => void) {
  const size = Math.min(rect.w - 18, rect.h - 36);
  const x = rect.x + rect.w / 2, y = rect.y + 7 + size / 2;
  ctx.save(); ctx.beginPath(); ctx.arc(x,y,size / 2,0,Math.PI * 2);
  ctx.fillStyle = '#f0eadb'; ctx.fill(); ctx.clip();
  portrait(x,y,size); ctx.restore();
}

/** A little cutaway of the real oak sleeping room, with a soft inset bed. */
export function catRoomIllustration(ctx: CanvasRenderingContext2D, rect: Rect, occupied: boolean,
  portrait?: (x: number, y: number, size: number) => void) {
  const size = Math.min(rect.w - 22, rect.h - 23), x = rect.x + rect.w / 2, y = rect.y + (rect.h - 22) / 2;
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 76, size / 76);
  const box = (x: number, y: number, w: number, h: number, r: number, color: string) => {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r); ctx.fillStyle=color; ctx.fill();
  };
  // Warm oak outer frame, recessed charcoal wall, little upholstered mattress.
  box(-36,-32,72,64,9,'#ae8258'); box(-31,-28,62,55,6,'#d1af83');
  box(-27,-24,54,47,5,occupied ? '#405647' : '#6b7160');
  ctx.fillStyle='#b9a78c'; ctx.beginPath(); ctx.moveTo(-27,14); ctx.lineTo(27,14); ctx.lineTo(31,26); ctx.lineTo(-31,26); ctx.closePath();ctx.fill();
  box(-25,13,50,12,6,occupied ? '#bdc9ac' : '#e2d5b9');
  box(-20,12,40,5,3,occupied ? '#dce4c8' : '#f0e5ce');
  ctx.strokeStyle='#906d4b';ctx.lineWidth=.75;
  for (const offset of [-33,33]) { ctx.beginPath();ctx.moveTo(offset,-23);ctx.lineTo(offset,22);ctx.stroke(); }
  if (portrait) {
    ctx.save();ctx.beginPath();ctx.roundRect(-25,-22,50,42,5);ctx.clip();
    portrait(0,-1,48);ctx.restore();
  } else {
    // Stitched paw on the empty pillow, no placeholder text.
    ctx.fillStyle='#c3b18e';ctx.beginPath();ctx.ellipse(0,14,5,3,0,0,Math.PI*2);ctx.fill();
    for (const [px,py] of [[-6,9],[-2,7],[3,7],[7,10]]) {ctx.beginPath();ctx.ellipse(px,py,1.8,2,0,0,Math.PI*2);ctx.fill();}
  }
  // Hinged open glass door makes the empty space read as an invitation.
  if (!occupied) {
    ctx.beginPath();ctx.moveTo(29,-24);ctx.lineTo(39,-17);ctx.lineTo(39,26);ctx.lineTo(29,23);ctx.closePath();
    ctx.fillStyle='rgba(231,243,232,.22)';ctx.fill();ctx.strokeStyle='#ddc59b';ctx.lineWidth=2;ctx.stroke();
    ctx.fillStyle='#e5c677';ctx.beginPath();ctx.arc(35,7,1.5,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}

export function catRoomMoon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  ctx.save();ctx.translate(x,y);ctx.scale(size/12,size/12);
  ctx.beginPath();ctx.moveTo(4,-6);ctx.bezierCurveTo(-7,-8,-9,5,0,7);ctx.bezierCurveTo(5,8,8,4,7,1);
  ctx.bezierCurveTo(1,4,-2,-2,4,-6);ctx.fillStyle=color;ctx.fill();ctx.restore();
}
