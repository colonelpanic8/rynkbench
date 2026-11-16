// What the draft holds, as the review window lists it (keys and encoders per
// layer, the slots, each layer's lighting, the lock and battery lights), and
// the draft as kept in the browser for that keyboard. All of it is computed
// from the draft (want.ts): the items that differ from what the keyboard
// holds. Pure: state in, plain data out.

import type { KeyAction } from "../../model/action-types";
import type { LightingOverlayCell } from "../../model/lighting-types";
import type { WorkbenchAction, WorkbenchState } from "../../model/workbench-state";
import type { Rules } from "../../model/lighting/rules";
import { stagedBetween } from "../../model/lighting/compare";
import { valueAt, type KeyboardImage, type PatchEntry, type SyncItem } from "../../sync";
import { layerSceneCells, lightingBaseFor } from "../lighting-drafts";
import { draftOf } from "./want";

export type DraftArea = "keys" | "encoders" | "combos" | "morse" | "forks" | "lighting" | "lightRules";

export interface DraftGroup {
  area: DraftArea;
  /** The layer the group is on; none for the slots and the lock and battery lights. */
  layer?: number;
  /** How many keys (or encoders, slots, LEDs) it changes. */
  count: number;
}

/** LEDs whose lock or battery rules differ between two rule tables. */
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

/** The LEDs one layer's lighting change touches. */
function changedLeds(change: PatchEntry): number {
  const layer = (change.item as { layer: number }).layer;
  const cells = (side: unknown) => layerSceneCells((side as KeyboardImage["scenes"] | undefined) ?? [], layer);
  return stagedBetween(cells(change.after), cells(change.before)).size;
}

/** The group a drafted item is counted in. */
function groupOf(item: SyncItem): Omit<DraftGroup, "count"> | null {
  switch (item.kind) {
    case "key":
      return { area: "keys", layer: item.layer };
    case "encoder":
      return { area: "encoders", layer: item.layer };
    case "slot":
      return { area: item.table };
    case "lighting":
      return { area: "lighting", layer: item.layer };
    case "rules":
      return { area: "lightRules" };
    default:
      return null;
  }
}

const AREA_ORDER: DraftArea[] = ["keys", "encoders", "combos", "morse", "forks", "lighting", "lightRules"];
const sameGroup = (a: Omit<DraftGroup, "count">, b: Omit<DraftGroup, "count">) => a.area === b.area && a.layer === b.layer;

export function draftGroups(state: WorkbenchState): DraftGroup[] {
  const groups: DraftGroup[] = [];
  for (const change of draftOf(state).changes) {
    const group = groupOf(change.item);
    if (!group) continue;
    const count =
      change.item.kind === "lighting"
        ? changedLeds(change)
        : change.item.kind === "rules"
          ? changedRuleLeds(change.after as Rules, change.before as Rules).size
          : 1;
    if (count === 0) continue;
    const found = groups.find((other) => sameGroup(other, group));
    if (found) found.count += count;
    else groups.push({ ...group, count });
  }
  return groups.sort((a, b) => AREA_ORDER.indexOf(a.area) - AREA_ORDER.indexOf(b.area) || (a.layer ?? 0) - (b.layer ?? 0));
}

/** The drafted items one group of the review window holds. */
export function groupItems(state: WorkbenchState, group: DraftGroup): SyncItem[] {
  return draftOf(state)
    .changes.map((change) => change.item)
    .filter((item) => {
      const its = groupOf(item);
      return its !== null && sameGroup(its, group);
    });
}

export const draftSize = (groups: readonly DraftGroup[]) => groups.reduce((sum, group) => sum + group.count, 0);

/** Layers whose lighting differs from what the keyboard stores, with how many LEDs. */
export function lightingLayers(state: WorkbenchState): Map<number, number> {
  return new Map(draftGroups(state).filter((group) => group.area === "lighting").map((group) => [group.layer!, group.count]));
}

/* ---- kept in the browser ----------------------------------------------- */

/** The draft as kept for a keyboard: each item with the value it was based on
 *  (`before`) and the value you want (`after`), so Send can still tell a change
 *  made on the keyboard since. */
export interface StoredDraft {
  version: 2;
  changes: PatchEntry[];
  /** How many changes, as the chip counts them. */
  size: number;
}

/** The shape kept before ADR 0018, converted once when read. */
interface StoredDraftV1 {
  keys: Array<{ layer: number; row: number; col: number; action: KeyAction; before?: KeyAction }>;
  slots?: Array<{ kind: "combos" | "morse" | "forks"; index: number; before: unknown; value: unknown }>;
  encoders: Array<{ layer: number; id: number; action: unknown }>;
  lighting: Record<number, LightingOverlayCell[]>;
  rules: Rules | null;
  size: number;
}

export type KeptDraft = StoredDraft | StoredDraftV1;

export function draftSnapshot(state: WorkbenchState): StoredDraft | null {
  const size = draftSize(draftGroups(state));
  return size === 0 ? null : { version: 2, changes: [...draftOf(state).changes], size };
}

/** A kept draft read back, or null when it is missing or not one. */
export function parseStoredDraft(raw: string | null): KeptDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredDraft & StoredDraftV1>;
    if (typeof value.size !== "number") return null;
    if (value.version === 2) return Array.isArray(value.changes) ? (value as StoredDraft) : null;
    return Array.isArray(value.keys) && Array.isArray(value.encoders) ? (value as StoredDraftV1) : null;
  } catch {
    return null;
  }
}

/** A kept draft as a patch on top of what the keyboard holds now (`base`). An
 *  item the old shape kept no based-on value for is based on what is there now. */
export function keptPatch(kept: KeptDraft, base: KeyboardImage, cols: number): PatchEntry[] {
  if ("version" in kept) return kept.changes;
  const entry = (item: SyncItem, after: unknown, before?: unknown): PatchEntry => ({
    item,
    before: before === undefined ? valueAt(base, item) : before,
    after,
  });
  return [
    ...kept.keys.map(({ layer, row, col, action, before }) => entry({ kind: "key", layer, offset: row * cols + col }, action, before)),
    ...(kept.slots ?? []).map(({ kind, index, value, before }) => entry({ kind: "slot", table: kind, index }, value, before)),
    ...kept.encoders.map(({ layer, id, action }) => entry({ kind: "encoder", layer, id }, action)),
    ...Object.entries(kept.lighting).map(([key, cells]) => {
      const layer = Number(key);
      const after = cells.map(({ led_id, effect }) => ({ layer, led_id, effect })).sort((a, b) => a.led_id - b.led_id);
      return entry({ kind: "lighting", layer }, after);
    }),
    ...(kept.rules ? [entry({ kind: "rules" }, kept.rules)] : []),
  ];
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
