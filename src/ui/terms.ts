// The words the app uses for its own parts, in two voices: technical (the RMK
// and Rynk terms) and friendly (plain descriptions of what the thing does).
// One table drives both, so no screen hard-codes either, and the choice is a
// browser-local preference.
//
// Technical is today's wording and the default. The friendly names are
// proposals, meant to be edited here and nowhere else.

import { useSyncExternalStore } from "react";
import { SETTING_KEYS, createSetting } from "./settings";

export type Wording = "technical" | "friendly";

export const DEFAULT_WORDING: Wording = "technical";

export interface Term {
  technical: string;
  friendly: string;
}

// Area names sit in the narrow rail, so they stay short in both voices.
export const TERMS = {
  "area.layout": { technical: "Keymap", friendly: "Layout" },
  "area.behaviors": { technical: "Behaviors", friendly: "Behaviors" },
  "area.device": { technical: "Device", friendly: "Keyboard" },
  "area.insights": { technical: "Insights", friendly: "Insights" },
  "section.keymap": { technical: "Keymap", friendly: "Keys" },
  "section.combos": { technical: "Combos", friendly: "Combos" },
  "section.morse": { technical: "Morse", friendly: "Tap patterns" },
  "section.macros": { technical: "Macros", friendly: "Macros" },
  "section.forks": { technical: "Forks", friendly: "Conditional keys" },
  "section.profiles": { technical: "Profiles", friendly: "Tap timing" },
  "section.transforms": { technical: "Transforms", friendly: "Quick changes" },
  "section.device": { technical: "Device", friendly: "Keyboard" },
  "section.usage": { technical: "All your behaviors", friendly: "All your behaviors" },
  "section.live": { technical: "Live", friendly: "Live view" },
  // Tap timing (a tap pattern's own, a profile's): RMK's words, and plain ones.
  "timing.mode": { technical: "Mode", friendly: "When a hold wins" },
  "timing.hold": { technical: "Hold timeout", friendly: "Hold after" },
  "timing.gap": { technical: "Gap timeout", friendly: "Next tap within" },
  "timing.unilateral": { technical: "Unilateral tap", friendly: "Same hand types the tap" },
  "timing.flow": { technical: "Flow tap", friendly: "Fast typing types the tap" },
  "timing.idle": { technical: "Flow-tap prior idle", friendly: "Typing pause before a hold" },
  "timing.retro": { technical: "Retro tap", friendly: "Tap when released alone" },
  "timing.release": { technical: "Hold trigger on release", friendly: "Decide on release" },
  "morse.timing": { technical: "Timing", friendly: "Timing" },
  "morse.does": { technical: "Action", friendly: "Does" },
  // A fork's parts: RMK's words, and plain ones.
  "fork.trigger": { technical: "Trigger", friendly: "Key" },
  "fork.negative": { technical: "Negative output", friendly: "Normally" },
  "fork.positive": { technical: "Positive output", friendly: "Becomes" },
  "fork.match": { technical: "Match any", friendly: "While any of these" },
  "fork.suppress": { technical: "Match none", friendly: "Unless any of these" },
  "fork.keep": { technical: "Kept modifiers", friendly: "Keep held" },
} as const satisfies Record<string, Term>;

export type TermId = keyof typeof TERMS;

export function normalizeWording(value: unknown): Wording {
  return value === "friendly" || value === "technical" ? value : DEFAULT_WORDING;
}

/** A term in the given voice. */
export function termFor(id: TermId, wording: Wording): string {
  return TERMS[id][wording];
}

const wordingSetting = createSetting(SETTING_KEYS.wording, normalizeWording);

export function getWording(): Wording {
  return wordingSetting.get();
}

export function subscribeWording(listener: () => void): () => void {
  return wordingSetting.subscribe(listener);
}

export function setWording(wording: Wording): void {
  wordingSetting.set(wording);
}

export function useWording(): Wording {
  return useSyncExternalStore(subscribeWording, getWording, () => DEFAULT_WORDING);
}

/** The lookup screens use: `const term = useTerms(); term("mode.keymap")`. */
export function useTerms(): (id: TermId) => string {
  const wording = useWording();
  return (id) => termFor(id, wording);
}
