// Ids of the writes in flight, keyed so the reducer and the screens find the
// same entry in `state.pending`: a key, an encoder, a combo, morse or fork
// slot, a morse profile.

import type { SlotKind } from "../model/workbench-state";

export function slotPendingId(kind: SlotKind, index: number): string {
  return `${kind}:${index}`;
}

export function morseProfilePendingId(index: number): string {
  return `morseProfile:${index}`;
}

export function keyPendingId(layer: number, row: number, col: number): string {
  return `${layer}:${row}:${col}`;
}

export function encoderPendingId(layer: number, id: number): string {
  return `e:${layer}:${id}`;
}
