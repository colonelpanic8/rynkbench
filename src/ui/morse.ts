// MorsePattern helpers. Wire encoding (rmk MorsePattern): a u16 that starts
// at 0x1 (empty), then each tap (0) or hold (1) is shifted in from the right —
// the leading 1 is a length sentinel, and the bits below it read MSB→LSB in
// press order. Max 15 elements.

export type MorseElement = "tap" | "hold";

export const MAX_MORSE_ELEMENTS = 15;

export function patternElements(pattern: number): MorseElement[] {
  if (pattern <= 1) return [];
  const bits = 31 - Math.clz32(pattern); // position of the sentinel bit
  const out: MorseElement[] = [];
  for (let i = bits - 1; i >= 0; i--) {
    out.push((pattern >> i) & 1 ? "hold" : "tap");
  }
  return out;
}

export function elementsToPattern(elements: MorseElement[]): number {
  let pattern = 1;
  for (const el of elements) pattern = (pattern << 1) | (el === "hold" ? 1 : 0);
  return pattern;
}

/** Dots and dashes: ● tap, ▬ hold. */
export function morsePatternGlyph(pattern: number): string {
  const els = patternElements(pattern);
  if (els.length === 0) return "∅";
  return els.map((el) => (el === "tap" ? "●" : "▬")).join(" ");
}
