// The canvas geometry in key units: GLIDE's proportions (a 62 px key on a 70 px
// pitch, 6 px corners) and the board's view box.

import type { KeyboardModel, Rect } from "../../model/keyboard";

// GLIDE's proportions: a 62 px key on a 70 px pitch, 6 px corners.
export const CORNER = 0.086;
export const CAP_DROP = 0.05; // room below the board for the drop shadow
export const CAP_INSET = 0.057; // half the gap between abutting caps

/** Shared paint servers, defined once per canvas (identical in every canvas,
 *  so a duplicate id resolves to the same look). */
export const CAP_GRADIENT = "rb-cap-gradient";
export const CAP_RELIEF = "rb-cap-relief";
export const CAP_SHADOW = "rb-cap-shadow";
export const LED_GLOW = "rb-led-glow";

export const VIEW_PAD = 0.42;

/** Board viewBox in key-units (keys + encoders + breathing room). */
export function boardViewBox(model: KeyboardModel): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let { minX, minY, maxX, maxY } = model.bounds;
  for (const enc of model.encoders) {
    minX = Math.min(minX, enc.x - 0.55);
    minY = Math.min(minY, enc.y - 0.55);
    maxX = Math.max(maxX, enc.x + 0.55);
    maxY = Math.max(maxY, enc.y + 0.55);
  }
  return {
    x: minX - VIEW_PAD,
    y: minY - VIEW_PAD,
    w: maxX - minX + VIEW_PAD * 2,
    h: maxY - minY + VIEW_PAD * 2 + CAP_DROP,
  };
}

/** SVG rect attributes for a key rect given by its centre, shrunk by `inset` and moved down by `dy`. */
export function rectAttrs(rect: Rect, inset = 0, dy = 0) {
  return {
    x: rect.x - rect.w / 2 + inset,
    y: rect.y - rect.h / 2 + inset + dy,
    width: rect.w - inset * 2,
    height: rect.h - inset * 2,
  };
}
