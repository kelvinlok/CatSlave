import type { Rect } from './layout';
import type { CostumeItem, CostumeSlot } from './wardrobe';
import { CHRISTMAS_UI as C, christmasHolly, christmasSnowflake } from './christmas-ui';

export interface WardrobeLayout {
  header: Rect; preview: Rect; carousel: Rect; categoryTabs: Rect[];
  catPrevious: Rect; catNext: Rect; previousItems: Rect; nextItems: Rect;
  reset: Rect; done: Rect; selectedLabelY: number; hintY: number;
  cardWidth: number; cardGap: number; visibleItems: number;
}

/** Shared canvas layout for rendering, camera framing and swipe routing. */
export function wardrobeLayout(width: number, height: number, safeTop = 0, safeBottom = 0): WardrobeLayout {
  const x = Math.max(12, Math.min(20, width * .04)), w = width - x * 2;
  const top = Math.max(8, safeTop), bottom = height - Math.max(8, safeBottom);
  const compact = height - top - (height - bottom) < 560;
  const footerY = bottom - 44, cardHeight = compact ? 82 : 108;
  const carousel = { x, y: footerY - 8 - cardHeight, w, h: cardHeight };
  const tabsY = carousel.y - 70, tabWidth = (w - 12) / 3;
  const preview = { x, y: top + 96, w, h: Math.max(72, tabsY - top - 104) };
  const cardWidth = compact ? 96 : 116, cardGap = 8;
  return {
    header: { x, y: top, w, h: 44 }, preview, carousel,
    categoryTabs: Array.from({ length: 3 }, (_, i) => ({ x: x + i * (tabWidth + 6), y: tabsY, w: tabWidth, h: 44 })),
    catPrevious: { x, y: top + 48, w: 44, h: 44 },
    catNext: { x: x + w - 44, y: top + 48, w: 44, h: 44 },
    previousItems: { x, y: footerY, w: 44, h: 44 },
    nextItems: { x: x + w - 44, y: footerY, w: 44, h: 44 },
    reset: { x: x + 52, y: footerY, w: w - 104, h: 44 },
    done: { x: x + w - 82, y: top, w: 82, h: 44 },
    selectedLabelY: carousel.y - 13, hintY: preview.y + preview.h - 12,
    cardWidth, cardGap, visibleItems: (carousel.w + cardGap) / (cardWidth + cardGap),
  };
}

export function wardrobeMaxOffset(itemCount: number, layout: WardrobeLayout) {
  return Math.max(0, itemCount - layout.visibleItems);
}

export function wardrobeCards(layout: WardrobeLayout, offset: number, itemCount: number) {
  const scroll = Math.max(0, Math.min(wardrobeMaxOffset(itemCount, layout), offset));
  const result: { index: number; rect: Rect; hit: Rect }[] = [];
  for (let index = Math.floor(scroll); index < Math.min(itemCount, Math.ceil(scroll + layout.visibleItems)); index++) {
    const rect = { x: layout.carousel.x + (index - scroll) * (layout.cardWidth + layout.cardGap),
      y: layout.carousel.y, w: layout.cardWidth, h: layout.carousel.h };
    const x = Math.max(layout.carousel.x, rect.x), right = Math.min(layout.carousel.x + layout.carousel.w, rect.x + rect.w);
    result.push({ index, rect, hit: { x, y: rect.y, w: Math.max(0, right - x), h: rect.h } });
  }
  return result;
}

function stroke(ctx: CanvasRenderingContext2D, points: number[][], color: string, width = 3) {
  ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
}
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
}
function bow(ctx: CanvasRenderingContext2D, color: string) {
  ctx.beginPath(); ctx.moveTo(-2, -3); ctx.bezierCurveTo(-26, -20, -27, 12, -3, 4);
  ctx.lineTo(3, 4); ctx.bezierCurveTo(27, 12, 26, -20, 2, -3); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  stroke(ctx, [[-3, 4], [-8, 18]], color, 6); stroke(ctx, [[3, 4], [9, 17]], color, 6);
  pill(ctx, -4, -5, 8, 11, 3, '#d3af65');
}

/** Clothing silhouettes echo the actual modular pieces, including their trim. */
export function wardrobeItemIcon(ctx: CanvasRenderingContext2D, slot: CostumeSlot, item: CostumeItem,
  x: number, y: number, size = 50) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 50, size / 50);
  const fabric = item.color, style = item.style;
  if (item.id === 'none') {
    stroke(ctx, [[-18, 9], [0, -2], [18, 9], [-18, 9]], '#879589', 2.3);
    ctx.beginPath(); ctx.arc(3, -10, 5, Math.PI, Math.PI * 2.6);
    ctx.strokeStyle = '#879589'; ctx.lineWidth = 2.3; ctx.stroke();
    stroke(ctx, [[-17, 20], [17, -20]], C.coral, 2.5);
  } else if (slot === 'footwear') {
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 12, 0); ctx.rotate(side * -.12);
      if (style === 'elf') {
        ctx.beginPath(); ctx.moveTo(-8, -10); ctx.lineTo(7, -10); ctx.lineTo(7, 7);
        ctx.quadraticCurveTo(17, 10, 15, 0); ctx.quadraticCurveTo(24, 17, 7, 18);
        ctx.lineTo(-9, 18); ctx.closePath(); ctx.fillStyle = fabric; ctx.fill(); circle(ctx, 16, 1, 3, '#d3af65');
      } else { pill(ctx, -8, -10, 16, 23, 5, fabric); pill(ctx, -9, 5, 22, 14, 6, fabric); }
      pill(ctx, -9, -12, 18, 7, 2, style === 'reindeer' ? '#d4b48e' : '#f4eee0');
      if (style === 'holly') christmasHolly(ctx, 1, 9, .3);
      if (style === 'gift') { ctx.save(); ctx.translate(1, 8); ctx.scale(.4, .4); bow(ctx, '#d3af65'); ctx.restore(); }
      if (style === 'winter') christmasSnowflake(ctx, 0, 4, 5, '#f4eee0');
      ctx.restore();
    }
  } else if (slot === 'neckwear') {
    if (style === 'santa' || style === 'holly') {
      ctx.beginPath(); ctx.moveTo(-8, -17); ctx.quadraticCurveTo(-18, -7, -22, 19);
      ctx.quadraticCurveTo(0, 25, 22, 19); ctx.quadraticCurveTo(18, -7, 8, -17); ctx.closePath();
      ctx.fillStyle = fabric; ctx.fill();
      stroke(ctx, [[-21, 18], [-10, 21], [0, 22], [10, 21], [21, 18]], '#f4eee0', 4);
      stroke(ctx, [[-8, -17], [0, -11], [8, -17]], '#f4eee0', 5);
      circle(ctx, 0, -6, 3, '#d3af65'); if (style === 'holly') christmasHolly(ctx, 0, 3, .43);
    } else if (style === 'gift') {
      pill(ctx, -22, -6, 44, 11, 5, fabric); bow(ctx, fabric);
    } else {
      pill(ctx, -20, -14, 40, 12, 6, fabric);
      pill(ctx, -1, -5, 11, 27, 3, fabric); pill(ctx, -12, -4, 10, 22, 3, fabric);
      stroke(ctx, [[-12, 13], [-3, 13]], '#f4eee0', 3); stroke(ctx, [[0, 17], [10, 17]], '#f4eee0', 3);
      if (style === 'reindeer') circle(ctx, -2, -7, 4, '#d3af65');
      if (style === 'winter') christmasSnowflake(ctx, -11, -8, 4, '#f4eee0');
    }
  } else if (style === 'reindeer') {
    stroke(ctx, [[-20, 16], [0, 11], [20, 16]], fabric, 5);
    for (const side of [-1, 1]) {
      stroke(ctx, [[side * 11, 13], [side * 11, -11], [side * 17, -23]], fabric, 4);
      stroke(ctx, [[side * 11, -4], [side * 22, -13], [side * 22, -19]], fabric, 3);
      stroke(ctx, [[side * 12, -10], [side * 5, -18]], fabric, 3);
    }
    circle(ctx, 0, 12, 4, C.coral);
  } else if (style === 'gift') bow(ctx, fabric);
  else if (style === 'holly') {
    ctx.beginPath(); ctx.ellipse(0, 6, 20, 9, 0, 0, Math.PI * 2); ctx.strokeStyle = fabric; ctx.lineWidth = 6; ctx.stroke();
    christmasHolly(ctx, -11, 7, .7); christmasHolly(ctx, 11, 7, .7);
  } else if (style === 'winter') {
    ctx.beginPath(); ctx.arc(0, 5, 19, Math.PI, Math.PI * 2); ctx.lineTo(19, 12); ctx.lineTo(-19, 12); ctx.closePath();
    ctx.fillStyle = fabric; ctx.fill(); pill(ctx, -21, 7, 42, 11, 4, '#f4eee0'); circle(ctx, 0, -18, 7, '#f4eee0');
    for (let i = -12; i <= 12; i += 6) stroke(ctx, [[i, -7], [i, 6]], '#91a9b0', 1);
  } else {
    ctx.beginPath(); ctx.moveTo(-22, 13); ctx.quadraticCurveTo(-14, -19, 5, -22);
    ctx.quadraticCurveTo(20, -25, 19, -6); ctx.quadraticCurveTo(10, -13, 10, -2); ctx.lineTo(20, 13); ctx.closePath();
    ctx.fillStyle = fabric; ctx.fill();
    pill(ctx, -22, 10, 44, 10, 4, style === 'elf' ? '#d3af65' : '#f4eee0');
    circle(ctx, 19, -6, 6, style === 'elf' ? '#d3af65' : '#f4eee0');
  }
  ctx.restore();
}
