// Editing a tap pattern (a morse entry) in its editor (ADR 0020): add, change
// and remove its patterns, and what stops it from being applied. Pure.

import type { Action, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { MAX_MORSE_ELEMENTS, elementsToPattern, morsePatternGlyph, patternElements, type MorseElement } from "./morse";

/** The patterns a new one is chosen from, most useful first: tap, hold, double tap, tap then hold. */
const SUGGESTED: MorseElement[][] = [["tap"], ["hold"], ["tap", "tap"], ["tap", "hold"], ["tap", "tap", "tap"], ["hold", "tap"]];

/** The first suggested pattern the entry does not have yet, or a longer tap run. */
export function nextPattern(morse: Morse): number {
  const taken = new Set(morse.actions.map(([pattern]) => pattern));
  const free = SUGGESTED.map(elementsToPattern).find((pattern) => !taken.has(pattern));
  if (free !== undefined) return free;
  for (let taps = 4; taps <= MAX_MORSE_ELEMENTS; taps += 1) {
    const pattern = elementsToPattern(Array<MorseElement>(taps).fill("tap"));
    if (!taken.has(pattern)) return pattern;
  }
  return elementsToPattern(["hold", "hold"]);
}

export function withNewPattern(morse: Morse): Morse {
  return { ...morse, actions: [...morse.actions, [nextPattern(morse), "No"]] };
}

export function withPattern(morse: Morse, index: number, elements: MorseElement[]): Morse {
  return { ...morse, actions: morse.actions.map((entry, i) => (i === index ? [elementsToPattern(elements), entry[1]] : entry)) };
}

export function withPatternAction(morse: Morse, index: number, action: Action): Morse {
  return { ...morse, actions: morse.actions.map((entry, i) => (i === index ? [entry[0], action] : entry)) };
}

export function withoutPattern(morse: Morse, index: number): Morse {
  return { ...morse, actions: morse.actions.filter((_, i) => i !== index) };
}

/** Why the entry cannot be applied as it is, or null. */
export function morseProblem(morse: Morse, maxPatterns: number): string | null {
  if (morse.actions.length === 0) return "Add a pattern first";
  if (morse.actions.length > maxPatterns) return maxPatterns === 1 ? "Only one pattern fits" : `At most ${maxPatterns} patterns fit`;
  const seen = new Set<number>();
  for (const [pattern, action] of morse.actions) {
    if (patternElements(pattern).length === 0) return "A pattern has no taps or holds";
    if (seen.has(pattern)) return `Two patterns are ${morsePatternGlyph(pattern)}`;
    seen.add(pattern);
    if (action === "No") return `${morsePatternGlyph(pattern)} does nothing yet`;
  }
  return null;
}
