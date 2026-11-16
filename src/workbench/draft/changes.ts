// What the draft holds: the changes not yet on the keyboard, grouped the way
// the review window lists them (keys and encoders per layer, each layer's
// lighting, the lock and battery lights), and a snapshot of them to keep in
// the browser for that keyboard. Pure: state in, plain data out.

import type { EncoderAction, KeyAction } from "../../model/action-types";
import type { LightingOverlayCell } from "../../model/lighting-types";
import type { SlotKind, StagedSlotEdit, WorkbenchAction, WorkbenchState } from "../../model/workbench-state";
import type { Rules } from "../../model/lighting/rules";
import { lightingBaseFor, lightingDraftFor } from "../lighting-drafts";
import { stagedBetween } from "../../model/lighting/compare";

export type DraftArea = "keys" | "encoders" | "combos" | "morse" | "forks" | "lighting" | "lightRules";

export interface DraftGroup {
  area: DraftArea;
  /** The layer the group is on; none for the lock and battery lights. */
  layer?: number;
  /** How many keys (or encoders, or LEDs) it changes. */
  count: number;
}

/** LEDs whose lock or battery rules differ between the draft and the keyboard. */
export function changedRuleLeds(draft: Rules, stored: Rules): Set<number> {
  const byLed = (table: Rules) => {
    const out = new Map<number, string>();
    for (const rule of table) out.set(rule.cell.led_id, (out.get(rule.cell.led_id) ?? "") + JSON.stringify(rule));
    return out;
  };
  const now = byLed(draft);
  const before = byLed(stored);
  return new Set([...now.keys(), ...before.keys()].filter((led) => now.get(led) !== before.get(led)));
}

/** Layers whose lighting differs from what the keyboard stores. */
export function lightingLayers(state: WorkbenchState): Map<number, number> {
  const out = new Map<number, number>();
  for (const key of Object.keys(state.layerDrafts)) {
    const layer = Number(key);
    const staged = stagedBetween(lightingDraftFor(state, layer), lightingBaseFor(state, layer)).size;
    if (staged > 0) out.set(layer, staged);
  }
  return out;
}

export function draftGroups(state: WorkbenchState): DraftGroup[] {
  const perLayer = (edits: Array<{ layer: number }>, area: DraftArea): DraftGroup[] => {
    const counts = new Map<number, number>();
    for (const edit of edits) counts.set(edit.layer, (counts.get(edit.layer) ?? 0) + 1);
    return [...counts].sort(([a], [b]) => a - b).map(([layer, count]) => ({ area, layer, count }));
  };
  const lighting = [...lightingLayers(state)].sort(([a], [b]) => a - b).map(([layer, count]) => ({ area: "lighting" as const, layer, count }));
  const rules = changedRuleLeds(state.runtimeConditionalDraft, state.runtimeConditionalScenes).size;
  const slots = (kind: SlotKind): DraftGroup[] => {
    const count = Object.values(state.stagedSlots).filter((edit) => edit.kind === kind).length;
    return count > 0 ? [{ area: kind, count }] : [];
  };
  return [
    ...perLayer(Object.values(state.stagedKeys), "keys"),
    ...perLayer(Object.values(state.stagedEncoders), "encoders"),
    ...slots("combos"),
    ...slots("morse"),
    ...slots("forks"),
    ...lighting,
    ...(rules > 0 ? [{ area: "lightRules" as const, count: rules }] : []),
  ];
}

export const draftSize = (groups: readonly DraftGroup[]) => groups.reduce((sum, group) => sum + group.count, 0);

/* ---- kept in the browser ----------------------------------------------- */

/** The draft as kept for a keyboard: what each change makes, not what it replaced. */
export interface StoredDraft {
  /** `before`: what the key was based on, so Send can tell a change made on the keyboard since. */
  keys: Array<{ layer: number; row: number; col: number; action: KeyAction; before?: KeyAction }>;
  slots?: StagedSlotEdit[];
  encoders: Array<{ layer: number; id: number; action: EncoderAction }>;
  /** Each changed layer's whole lighting draft. */
  lighting: Record<number, LightingOverlayCell[]>;
  /** The whole rule table, when it changed. */
  rules: Rules | null;
  /** How many changes, as the chip counts them. */
  size: number;
}

export function draftSnapshot(state: WorkbenchState): StoredDraft | null {
  const size = draftSize(draftGroups(state));
  if (size === 0) return null;
  const lighting: Record<number, LightingOverlayCell[]> = {};
  for (const layer of lightingLayers(state).keys()) lighting[layer] = Object.values(lightingDraftFor(state, layer));
  return {
    keys: Object.values(state.stagedKeys),
    slots: Object.values(state.stagedSlots),
    encoders: Object.values(state.stagedEncoders).map(({ layer, id, action }) => ({ layer, id, action })),
    lighting,
    rules: changedRuleLeds(state.runtimeConditionalDraft, state.runtimeConditionalScenes).size > 0 ? state.runtimeConditionalDraft : null,
    size,
  };
}

/** A kept draft read back, or null when it is missing or not one. */
export function parseStoredDraft(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as StoredDraft;
    return Array.isArray(value.keys) && Array.isArray(value.encoders) && typeof value.size === "number" ? value : null;
  } catch {
    return null;
  }
}

/** The actions that put a kept draft back on top of what the keyboard has now:
 *  each key and encoder staged again (one already as kept stays as it is),
 *  each layer's lighting draft replaced, the rule table replaced. */
export function restoreActions(kept: StoredDraft, state: WorkbenchState): WorkbenchAction[] {
  const actions: WorkbenchAction[] = [];
  for (const { layer, row, col, action, before } of kept.keys) actions.push({ type: "keyStage", layer, row, col, action, before });
  for (const { kind, index, value, before } of kept.slots ?? []) actions.push({ type: "slotStage", kind, index, value, before });
  for (const { layer, id, action } of kept.encoders) actions.push({ type: "encoderStage", layer, id, action });
  for (const [key, cells] of Object.entries(kept.lighting)) actions.push(...layerLightingActions(state, Number(key), cells));
  if (kept.rules) actions.push({ type: "conditionalDraft", cells: kept.rules });
  return actions;
}

/** The actions that make a layer's lighting draft exactly `cells`. */
export function layerLightingActions(state: WorkbenchState, layer: number, cells: readonly LightingOverlayCell[]): WorkbenchAction[] {
  const keep = new Set(cells.map((cell) => cell.led_id));
  const gone = Object.keys(lightingBaseFor(state, layer)).map(Number).filter((led) => !keep.has(led));
  const actions: WorkbenchAction[] = [{ type: "draftReset", target: layer }];
  if (cells.length) actions.push({ type: "paint", cells: [...cells], target: layer });
  if (gone.length) actions.push({ type: "erase", ledIds: gone, target: layer });
  return actions;
}
