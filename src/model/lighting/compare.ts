// Whether two lighting drafts are the same, and where they differ: the
// comparisons the reducer, the draft and the lighting screens share.

import { same } from "../deep-equal";
import type { LightingOverlayCell } from "../lighting-types";
import type { RuntimeLightingRule } from "../../session/types";

export function overlaysEqual(
  a: Record<number, LightingOverlayCell>,
  b: Record<number, LightingOverlayCell>,
): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) {
    const ka = Number(k);
    if (!(ka in b)) return false;
    if (!same(a[ka], b[ka])) return false;
  }
  return true;
}

/** Whether two conditional tables are the same *table*. Order-sensitive by
 *  design: these rules compose in table order and a later rule wins a shared
 *  slot, so permuting them is a real change the device must be told about. */
export function conditionalTablesEqual(
  a: RuntimeLightingRule[],
  b: RuntimeLightingRule[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((cell, index) => same(cell, b[index]));
}

/** LED ids where `draft` diverges from its `base` (staged, unapplied edits). */
export function stagedBetween(
  draft: Record<number, LightingOverlayCell>,
  base: Record<number, LightingOverlayCell>,
): Set<number> {
  const out = new Set<number>();
  for (const k of Object.keys(draft)) {
    const id = Number(k);
    const b = base[id];
    if (!b || !same(b, draft[id])) out.add(id);
  }
  for (const k of Object.keys(base)) {
    const id = Number(k);
    if (!(id in draft)) out.add(id);
  }
  return out;
}
