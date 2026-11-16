// Undo and redo for what is staged: the staged keys (in Draft) and the layers'
// lighting (always staged first; in Live sent once painting pauses). Every
// change in one go (a key, a paste, a swap, a light) is one step, and a Paint
// stroke, however many keys it crosses, is one step too (`merge`). Undo stages
// them back. Each step has its place in time (`order`, model/history.ts), so
// in Live it undoes in turn with the keys written to the keyboard. Send and
// Discard start a new history, as the draft starts over. Pure; the hook that
// drives it is in ui/draft/useDraftHistory.ts.

import type { KeyAction } from "../../model/action-types";
import { sameValue } from "../../model/deep-equal";
import type { LightingOverlayCell } from "../../model/lighting-types";
import type { StagedKeyEdit } from "../../model/workbench-state";
import type { Rules } from "../../model/lighting/rules";

export interface KeyChange {
  layer: number;
  row: number;
  col: number;
  from: KeyAction;
  to: KeyAction;
}

/** A layer's lighting draft, by LED. */
export type Cells = Record<number, LightingOverlayCell>;

/** One layer's whole lighting draft before and after. */
export interface LightChange {
  layer: number;
  from: Cells;
  to: Cells;
}

export interface Step {
  /** When it was done, among every edit (model/history.ts nextEditOrder). */
  order: number;
  keys: KeyChange[];
  lights: LightChange[];
  /** The rule table (status lights) before and after; null when it stayed. */
  rules: { from: Rules; to: Rules } | null;
}

export interface DraftHistory {
  past: Step[];
  future: Step[];
}

/** What a step is taken from: the keys, the staged ones, and each layer's lighting and the rules. */
export interface DraftImage {
  layers: KeyAction[][];
  stagedKeys: Record<string, StagedKeyEdit>;
  lighting: Cells[];
  rules: Rules;
}

export const emptyHistory = (): DraftHistory => ({ past: [], future: [] });
export const isEmptyStep = (step: Step) => step.keys.length === 0 && step.lights.length === 0 && step.rules === null;

// Cells and rules are built by Rynkbench and read back from the keyboard, so
// they are compared without regard to key order.
const same = sameValue;

/** What a state transition changed: the keys among those staged before or
 *  after it, each layer's lighting, and the rules. */
export function stepBetween(before: DraftImage, after: DraftImage, cols: number, order = 0): Step {
  const places = new Map<string, StagedKeyEdit>();
  for (const edit of [...Object.values(before.stagedKeys), ...Object.values(after.stagedKeys)]) {
    places.set(`${edit.layer}:${edit.row}:${edit.col}`, edit);
  }
  const keys: KeyChange[] = [];
  for (const { layer, row, col } of places.values()) {
    const from = before.layers[layer]?.[row * cols + col] ?? "No";
    const to = after.layers[layer]?.[row * cols + col] ?? "No";
    if (!same(from, to)) keys.push({ layer, row, col, from, to });
  }
  const lights: LightChange[] = [];
  for (let layer = 0; layer < Math.max(before.lighting.length, after.lighting.length); layer += 1) {
    const from = before.lighting[layer] ?? {};
    const to = after.lighting[layer] ?? {};
    if (!same(from, to)) lights.push({ layer, from, to });
  }
  const rules = same(before.rules, after.rules) ? null : { from: before.rules, to: after.rules };
  return { order, keys, lights, rules };
}

/** Two steps one after the other as one, in the first one's place in time:
 *  each thing from where the first found it to where the second left it; what
 *  ends where it started drops out. */
export function merge(first: Step, second: Step): Step {
  const keyAt = (change: KeyChange) => `${change.layer}:${change.row}:${change.col}`;
  const keys = new Map(first.keys.map((change) => [keyAt(change), change]));
  for (const change of second.keys) {
    const earlier = keys.get(keyAt(change));
    keys.set(keyAt(change), earlier ? { ...change, from: earlier.from } : change);
  }
  const lights = new Map(first.lights.map((change) => [change.layer, change]));
  for (const change of second.lights) {
    const earlier = lights.get(change.layer);
    lights.set(change.layer, earlier ? { ...change, from: earlier.from } : change);
  }
  const rules = first.rules && second.rules ? { from: first.rules.from, to: second.rules.to } : (second.rules ?? first.rules);
  return {
    order: first.order,
    keys: [...keys.values()].filter((change) => !same(change.from, change.to)),
    lights: [...lights.values()].filter((change) => !same(change.from, change.to)).sort((a, b) => a.layer - b.layer),
    rules: rules && !same(rules.from, rules.to) ? rules : null,
  };
}

/** A new step: it goes on the past, and the future is gone. With `join`, it
 *  joins the last step instead (the rest of a Paint stroke). */
export function record(history: DraftHistory, step: Step, join = false): DraftHistory {
  if (isEmptyStep(step)) return history;
  const last = history.past.at(-1);
  if (!join || !last) return { past: [...history.past, step], future: [] };
  const joined = merge(last, step);
  return { past: isEmptyStep(joined) ? history.past.slice(0, -1) : [...history.past.slice(0, -1), joined], future: [] };
}

/** The step undo takes back and the history after it; null when there is none. */
export function undo(history: DraftHistory): { step: Step; history: DraftHistory } | null {
  const step = history.past.at(-1);
  if (!step) return null;
  return { step, history: { past: history.past.slice(0, -1), future: [...history.future, step] } };
}

export function redo(history: DraftHistory): { step: Step; history: DraftHistory } | null {
  const step = history.future.at(-1);
  if (!step) return null;
  return { step, history: { past: [...history.past, step], future: history.future.slice(0, -1) } };
}
