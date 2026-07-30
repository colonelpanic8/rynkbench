// Ordered-table edits for the mutable conditional rules.
//
// The table's order is its meaning: matching rules compose top to bottom and a
// later rule wins any slot an earlier one also claims. Every operation here is
// therefore position-preserving and total — nothing sorts, dedupes, or merges.
// Each returns a new array (or the same one, when the edit is a no-op) so the
// caller can stage it as a draft.

import type {
  LightingConditionalSceneCell,
  LightingEffect,
  LightingLedId,
} from "../../vendor/rynk-wasm/rynk_wasm";

export type Rules = LightingConditionalSceneCell[];

/** A fresh, unconditional rule — "always, on this LED". Conditions are added
 *  afterwards, so a new rule is immediately meaningful and previewable. */
export function newRule(ledId: LightingLedId, effect: LightingEffect): LightingConditionalSceneCell {
  return {
    conditions: { layer: undefined, battery: undefined, output_mode: undefined },
    led_id: ledId,
    effect,
  };
}

export function appendRule(rules: Rules, rule: LightingConditionalSceneCell): Rules {
  return [...rules, rule];
}

export function replaceRule(rules: Rules, index: number, rule: LightingConditionalSceneCell): Rules {
  if (index < 0 || index >= rules.length) return rules;
  return rules.map((current, at) => (at === index ? rule : current));
}

export function removeRule(rules: Rules, index: number): Rules {
  if (index < 0 || index >= rules.length) return rules;
  return rules.filter((_, at) => at !== index);
}

/** Move one rule to a new position, shifting the rest. Out-of-range targets
 *  are no-ops rather than clamps: the ends of the list should feel like walls,
 *  not like a wrap-around. */
export function moveRule(rules: Rules, from: number, to: number): Rules {
  if (from < 0 || from >= rules.length) return rules;
  if (to < 0 || to >= rules.length || to === from) return rules;
  const next = rules.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
