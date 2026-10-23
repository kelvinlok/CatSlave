export interface Rect { x: number; y: number; w: number; h: number; }
export interface Insets { top: number; bottom: number; left: number; right: number; }
export interface GameLayout { room: Rect; header: Rect; tools: Rect[]; pause: Rect; viewControls: Rect[]; }

export function portraitViewport(available: Rect, touch: boolean) {
  const w = touch ? available.w : Math.min(available.w, Math.max(280, Math.min(520, Math.round(available.h * 0.62))));
  return { x: available.x + (available.w - w) / 2, y: available.y, w, h: available.h,
    rotateRequired: touch && available.w > available.h };
}

/** One layout contract for camera framing, drawing and pointer targets. */
export function gameLayout(width: number, height: number, safe: Insets = { top: 0, bottom: 0, left: 0, right: 0 }): GameLayout {
  const left = safe.left + 6, right = width - safe.right - 6;
  const top = safe.top + 6, bottom = height - safe.bottom - 6;
  const trayW = Math.min(right - left, 540), trayX = (left + right - trayW) / 2, trayY = bottom - 64;
  return { header: { x: left, y: top, w: right - left - 54, h: 48 },
    room: { x: left, y: top + 54, w: right - left, h: trayY - top - 112 },
    viewControls: Array.from({ length: 4 }, (_, i) => ({ x: trayX + i * trayW / 4, y: trayY - 52, w: trayW / 4, h: 48 })),
    tools: Array.from({ length: 5 }, (_, i) => ({ x: trayX + i * trayW / 5, y: trayY, w: trayW / 5, h: 64 })),
    pause: { x: right - 48, y: top, w: 48, h: 48 } };
}
