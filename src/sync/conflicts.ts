// The three-way check (ADR 0012): what you started from, what the keyboard
// holds now, what you want. An item changed on both sides, to different
// values, is a conflict: writing would overwrite a change made elsewhere
// (another computer, another tool, the keyboard itself).

import { sameValue } from "../model/deep-equal";

// Values come from two places: built by Rynkbench, and read back from the
// keyboard. Their key order and unset fields mean nothing, so they never
// count as a difference (a check after writing that does fails forever).
const same = sameValue;
import type { KeyboardImage } from "./image";
import { planSync, type SyncStep } from "./plan";

/** One stored item, named the same way for every plan. */
export type SyncItem =
  | { kind: "key"; layer: number; offset: number }
  | { kind: "encoder"; layer: number; id: number }
  | { kind: "slot"; table: "combos" | "morse" | "forks"; index: number }
  | { kind: "layerMetadata"; layer: number }
  | { kind: Exclude<SyncStep["kind"], "keys" | "encoder" | "slot" | "layerMetadata"> };

const itemKey = (item: SyncItem): string => JSON.stringify(item);

/** The items a plan writes, each with the value it writes. */
export function itemsOf(steps: readonly SyncStep[]): Map<string, { item: SyncItem; value: unknown }> {
  const items = new Map<string, { item: SyncItem; value: unknown }>();
  const add = (item: SyncItem, value: unknown) => items.set(itemKey(item), { item, value });
  for (const step of steps) {
    switch (step.kind) {
      case "keys":
        step.actions.forEach((action, i) => add({ kind: "key", layer: step.layer, offset: step.start + i }, action));
        break;
      case "encoder":
        add({ kind: "encoder", layer: step.layer, id: step.id }, step.action);
        break;
      case "slot":
        add({ kind: "slot", table: step.table, index: step.index }, step.value);
        break;
      case "layerMetadata":
        add({ kind: "layerMetadata", layer: step.layer }, step.value);
        break;
      case "defaultLayer":
        add({ kind: step.kind }, step.layer);
        break;
      default:
        add({ kind: step.kind }, step.value);
    }
  }
  return items;
}

/** Items you changed that the keyboard also changed since `base`, to something else. */
export function conflicts(base: KeyboardImage, now: KeyboardImage, want: KeyboardImage): SyncItem[] {
  const yours = itemsOf(planSync(base, want));
  const theirs = itemsOf(planSync(base, now));
  return [...yours.entries()]
    .filter(([key, mine]) => theirs.has(key) && !same(theirs.get(key)!.value, mine.value))
    .map(([, mine]) => mine.item);
}
