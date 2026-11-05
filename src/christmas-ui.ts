/** Small, static canvas ornaments: no extra textures or animation work. */
export const CHRISTMAS_UI = {
  ink: '#203e36', muted: '#647064', paper: '#fffaf0', cream: '#f6f1e7',
  line: '#cfb785', coral: '#a53243', green: '#2c6650', paleGreen: '#e3ece3', red: '#b62d3c',
};

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, scale: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-3, -4, -8, -3);
  ctx.quadraticCurveTo(-6, -7, -11, -9); ctx.quadraticCurveTo(-6, -9, -7, -14);
  ctx.quadraticCurveTo(-2, -12, 0, -19); ctx.quadraticCurveTo(2, -12, 7, -14);
  ctx.quadraticCurveTo(6, -9, 11, -9); ctx.quadraticCurveTo(6, -7, 8, -3);
  ctx.quadraticCurveTo(3, -4, 0, 0); ctx.fillStyle = CHRISTMAS_UI.green; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, -15);
  ctx.strokeStyle = '#86a483'; ctx.lineWidth = .65; ctx.stroke(); ctx.restore();
}

export function christmasHolly(ctx: CanvasRenderingContext2D, x: number, y: number, size = 1) {
  leaf(ctx, x, y, -.75, size); leaf(ctx, x, y, .8, size);
  for (const [dx, dy] of [[-3, 0], [3, 0], [0, 4]]) {
    ctx.beginPath(); ctx.arc(x + dx * size, y + dy * size, 3.2 * size, 0, Math.PI * 2);
    ctx.fillStyle = CHRISTMAS_UI.coral; ctx.fill();
    ctx.beginPath(); ctx.arc(x + (dx - .8) * size, y + (dy - 1) * size, .8 * size, 0, Math.PI * 2);
    ctx.fillStyle = '#efb2a0'; ctx.fill();
  }
}

export function christmasSnowflake(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color = CHRISTMAS_UI.line) {
  ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3, dx = Math.cos(angle), dy = Math.sin(angle);
    ctx.moveTo(0, 0); ctx.lineTo(dx * size, dy * size);
    for (const direction of [-1, 1]) {
      ctx.moveTo(dx * size * .62, dy * size * .62);
      const branch = angle + direction * Math.PI / 3;
      ctx.lineTo(dx * size * .62 + Math.cos(branch) * size * .3, dy * size * .62 + Math.sin(branch) * size * .3);
    }
  }
  ctx.stroke(); ctx.restore();
}

export function christmasGarland(ctx: CanvasRenderingContext2D, x: number, y: number, width: number) {
  ctx.save();
  // A shallow evergreen swag, above the title rather than across the room.
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + width / 2, y + 20, x + width, y);
  ctx.strokeStyle = CHRISTMAS_UI.green; ctx.lineWidth = 3; ctx.stroke();
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, px = x + width * t, py = y + 40 * t * (1 - t);
    const slope = Math.atan(40 * (1 - 2 * t) / width);
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(slope - side * .65) * 7, py + Math.sin(slope - side * .65) * 7);
      ctx.strokeStyle = i % 2 ? '#4b7a5a' : CHRISTMAS_UI.green; ctx.lineWidth = 1.6; ctx.stroke();
    }
    if (i % 4 === 2) {
      ctx.beginPath(); ctx.arc(px, py + 4, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = i % 8 === 2 ? '#dbb45f' : CHRISTMAS_UI.coral; ctx.fill();
    }
  }
  christmasHolly(ctx, x + 4, y + 3, .65);
  christmasHolly(ctx, x + width - 4, y + 3, .65);
  ctx.restore();
}

/** Keep ornamentation inside the outer gutter, away from room targets and tools. */
export function christmasFrame(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.fillStyle = CHRISTMAS_UI.green; ctx.fillRect(0, 0, 3, height); ctx.fillRect(width - 3, 0, 3, height);
  ctx.fillStyle = CHRISTMAS_UI.line; ctx.fillRect(0, 0, width, 2); ctx.fillRect(0, height - 2, width, 2);
  for (let y = 12; y < height; y += 30) {
    ctx.fillStyle = '#d2b16a'; ctx.fillRect(0, y, 3, 5); ctx.fillRect(width - 3, y, 3, 5);
  }
  ctx.restore();
}
