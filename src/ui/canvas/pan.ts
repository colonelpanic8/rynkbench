// Moving the keyboard on its canvas, by GLIDE's rule (ui/canvas.jsx clampPan
// there): at least 80% of the keyboard, or of the canvas when zoomed in past
// it, always stays on the canvas, in each direction. Pure.

export interface Size {
  w: number;
  h: number;
}

/** The farthest the board's centre may move from the canvas's, along one axis. */
const limit = (view: number, size: number) => view / 2 + size / 2 - Math.min(0.8 * size, 0.8 * view);

export function clampPan(pan: { x: number; y: number }, canvas: Size, board: Size): { x: number; y: number } {
  const lx = Math.max(0, limit(canvas.w, board.w));
  const ly = Math.max(0, limit(canvas.h, board.h));
  return { x: Math.max(-lx, Math.min(lx, pan.x)), y: Math.max(-ly, Math.min(ly, pan.y)) };
}

/** What a press on the canvas must leave alone: keys, their rings, and any control over the canvas. */
export function startsPan(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(".key-group:not(.key-static)")) return false;
  return !target.closest('[role="button"], button, input, select, textarea, a, [data-no-pan]');
}
