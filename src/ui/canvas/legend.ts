// How a key's legend sits on its cap, by GLIDE's rules (core/keycodes/keyFace.js
// and the .kc-* sizes in its app.css): a single character reads largest, a word
// of up to five characters a little smaller (Esc, Home, Enter), longer text
// smaller again on up to two lines, broken where the longer line comes out
// shortest. A key that types another character with Shift shows it small on
// top (the "@" over "2") with its own character a little smaller below.
// GLIDE sizes these in px for its 62 px key and its zoom scales them with the
// keys, so here they are fractions of the key pitch (GLIDE's is 70 px). Pure.

import { KEY_ICON_DATA } from "../keyface/keyIconData";

const PITCH_PX = 70;
const SIZE = {
  symbol: 15 / PITCH_PX,
  short: 13 / PITCH_PX,
  text: 11 / PITCH_PX,
  /** The character under a shifted one, and the shifted one on top. */
  belowTop: 13.44 / PITCH_PX,
  top: 11.52 / PITCH_PX,
  /** A hold under the legend. */
  sub: 9.5 / PITCH_PX,
} as const;
const MIN = 8 / PITCH_PX;
/** Up to this many characters a line reads at the short size. */
const SHORT = 5;
/** Room the cap's edge and padding take from its width, in key units. */
const MARGIN = 0.2;
/** Average glyph width of Inter as a fraction of its size. */
const GLYPH_WIDTH = 0.62;

export type LegendKind = "symbol" | "short" | "text";

export interface LegendLayout {
  kind: LegendKind;
  lines: string[];
  /** Font sizes in key units: the legend, the line below it (a hold), the character on top. */
  size: number;
  subSize: number;
  topSize: number;
}

const width = (line: string) => [...line.trimEnd()].length;
const longest = (lines: string[]) => Math.max(...lines.map(width));

/** The legend on one line, or two broken after a space or an underscore, or
 *  between words written together, whichever leaves the longer line shortest. */
export function legendLines(text: string): string[] {
  if (width(text) <= SHORT) return [text];
  const chunks = text.split(/(?<=[ _])|(?<=[a-z]{2})(?=[A-Z][a-z])/);
  let best = [text];
  for (let i = 1; i < chunks.length; i++) {
    const split = [chunks.slice(0, i).join(""), chunks.slice(i).join("")];
    if (longest(split) < longest(best)) best = split;
  }
  return best.map((line) => line.trimEnd());
}

/** `size`, shrunk until `chars` characters fit the cap's width. */
function fit(size: number, chars: number, capWidth: number): number {
  return Math.max(MIN, Math.min(size, (capWidth - MARGIN) / (Math.max(1, chars) * GLYPH_WIDTH)));
}

export function legendLayout(
  text: string,
  capWidth: number,
  { sub = "", top = "" }: { sub?: string; top?: string } = {},
): LegendLayout {
  const lines = legendLines(text);
  const kind: LegendKind = [...text].length === 1 ? "symbol" : longest(lines) <= SHORT ? "short" : "text";
  return {
    kind,
    lines,
    size: fit(top && kind === "symbol" ? SIZE.belowTop : SIZE[kind], longest(lines), capWidth),
    subSize: sub ? fit(SIZE.sub, width(sub), capWidth) : 0,
    topSize: top ? fit(SIZE.top, width(top), capWidth) : 0,
  };
}

/** A row of pictures and short text (keyface/keyFace.ts), laid out centred on
 *  the cap with GLIDE's proportions (its .kc-icons rules, measured on its 62 px
 *  cap): one picture is 40% of the cap; with more parts the first picture is
 *  36% and the next ones 23% (GLIDE's .kc-dual, .kc-icon-2), and a number
 *  beside a picture (the Bluetooth profile) is 26% of the cap tall. The small
 *  tiers (a hold, a chord's modifiers) use GLIDE's 13 px pictures and the
 *  hold's text size. Sizes are in key units; the cap is 62/70 of the pitch. */
export interface FaceItem {
  kind: "icon" | "text";
  /** Index into the face's parts. */
  part: number;
  /** Centre, from the cap's centre, and size (an icon's width, a text's font size), in key units. */
  dx: number;
  size: number;
  /** An icon's height, when it is not square (the MoErgo logo). */
  height?: number;
}

/** A picture's width over its height (its viewBox). */
function aspectOf(name: string): number {
  const box = (KEY_ICON_DATA as Record<string, { viewBox: string } | undefined>)[name]?.viewBox.split(" ").map(Number);
  return box && box[3] ? box[2] / box[3] : 1;
}

const CAP = 62 / PITCH_PX;
/** GLIDE's .kc-wide: a wide picture alone (the MoErgo logo) spans the cap. */
const WIDE = 1.02 * CAP;
const FACE = {
  alone: 0.402 * CAP,
  first: 0.356 * CAP,
  next: 0.232 * CAP,
  text: 0.263 * CAP,
  smallIcon: 13 / PITCH_PX,
  gap: 0.03 * CAP,
  smallGap: 1 / PITCH_PX,
} as const;

export function faceLayout(
  parts: readonly ({ icon: string } | { text: string })[],
  capWidth: number,
  tier: "main" | "small",
): FaceItem[] {
  const small = tier === "small";
  const only = parts.length === 1 && !small ? parts[0] : undefined;
  if (only && "icon" in only && aspectOf(only.icon) > 1.5) {
    const width = Math.min(WIDE, capWidth);
    return [{ kind: "icon", part: 0, dx: 0, size: width, height: width / aspectOf(only.icon) }];
  }
  const sizes = parts.map((part, i) => {
    if ("text" in part) return small ? SIZE.sub : FACE.text;
    if (small) return FACE.smallIcon;
    return parts.length === 1 ? FACE.alone : i === 0 ? FACE.first : FACE.next;
  });
  const widths = parts.map((part, i) => ("text" in part ? [...part.text].length * GLYPH_WIDTH * sizes[i] : sizes[i]));
  const gap = small ? FACE.smallGap : FACE.gap;
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * (parts.length - 1);
  const scale = Math.min(1, (capWidth - MARGIN) / total);
  let x = -(total * scale) / 2;
  return parts.map((part, i) => {
    const w = widths[i] * scale;
    const item: FaceItem = { kind: "text" in part ? "text" : "icon", part: i, dx: x + w / 2, size: sizes[i] * scale };
    x += w + gap * scale;
    return item;
  });
}
