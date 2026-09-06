// The state machine behind the combo, morse, and fork editors: one selected
// slot, a local draft of it, and a list that shows the occupied slots plus the
// one being edited. All three tables are fixed-length with empty slots in them,
// so "add" means claiming the first free index rather than appending.

import { useState } from "react";
import type { SlotKind, SlotValueOf } from "../state";
import { slotPendingId, useWorkbench } from "../state";
import { same } from "../deep-equal";

export interface SlotEntry<T> {
  value: T;
  index: number;
}

/** Which slot is being edited and the local copy of it. */
export interface SlotSelection<T> {
  sel: number | null;
  draft: T | null;
}

export const NO_SLOT: SlotSelection<never> = { sel: null, draft: null };

/** The first unoccupied slot, or -1 when the table is full. */
export function firstFreeSlot<T>(slots: T[], isEmpty: (value: T) => boolean): number {
  return slots.findIndex(isEmpty);
}

/** Open an existing slot: the draft is a private copy, so editing it never
 *  mutates the table the device pushes into. */
export function openSlot<T>(slots: T[], index: number): SlotSelection<T> {
  return { sel: index, draft: structuredClone(slots[index]) };
}

/** Claim the first free slot for a new entry, or stay put when the table is
 *  full. A blank draft, not a copy — the slot's current value is meaningless. */
export function claimFreeSlot<T>(
  slots: T[],
  isEmpty: (value: T) => boolean,
  blank: () => T,
): SlotSelection<T> | null {
  const free = firstFreeSlot(slots, isEmpty);
  return free === -1 ? null : { sel: free, draft: blank() };
}

/** Occupied slots, plus `sel` even when it is still empty — a slot being
 *  created has to stay in the list until it is written. */
export function visibleSlots<T>(
  slots: T[],
  isEmpty: (value: T) => boolean,
  sel: number | null,
): SlotEntry<T>[] {
  return slots
    .map((value, index) => ({ value, index }))
    .filter(({ value, index }) => !isEmpty(value) || index === sel);
}

/**
 * `editing` is the discriminant: destructuring it and testing it narrows
 * `sel` and `draft` for the whole editor body, which is what the three tabs
 * did with hand-rolled `const editing = sel !== null && draft !== null`.
 */
export type SlotEditor<K extends SlotKind> =
  | {
      editing: true;
      sel: number;
      draft: SlotValueOf<K>;
      /** The slot as the device holds it. */
      saved: SlotValueOf<K> | null;
      dirty: boolean;
      /** A write for the selected slot is in flight. */
      pending: boolean;
      setDraft: (next: SlotValueOf<K>) => void;
      open: (index: number) => void;
      close: () => void;
      addNew: () => void;
      entries: SlotEntry<SlotValueOf<K>>[];
      hasFree: boolean;
    }
  | {
      editing: false;
      sel: null;
      draft: null;
      saved: null;
      dirty: false;
      pending: false;
      setDraft: (next: SlotValueOf<K>) => void;
      open: (index: number) => void;
      close: () => void;
      addNew: () => void;
      entries: SlotEntry<SlotValueOf<K>>[];
      hasFree: boolean;
    };

export function useSlotEditor<K extends SlotKind>(
  kind: K,
  slots: SlotValueOf<K>[],
  isEmpty: (value: SlotValueOf<K>) => boolean,
  blank: () => SlotValueOf<K>,
  /** Extra per-editor state to clear whenever the selection changes. */
  onSelectionChange?: () => void,
): SlotEditor<K> {
  const { state } = useWorkbench();
  const [selection, setSelection] = useState<SlotSelection<SlotValueOf<K>>>(NO_SLOT);
  const { sel, draft } = selection;

  const select = (next: SlotSelection<SlotValueOf<K>> | null) => {
    if (next === null) return;
    setSelection(next);
    onSelectionChange?.();
  };

  const shared = {
    setDraft: (next: SlotValueOf<K>) =>
      setSelection((current) => ({ ...current, draft: next })),
    open: (index: number) => select(openSlot(slots, index)),
    close: () => select(NO_SLOT),
    addNew: () => select(claimFreeSlot(slots, isEmpty, blank)),
    entries: visibleSlots(slots, isEmpty, sel),
    hasFree: slots.some(isEmpty),
  };

  if (sel === null || draft === null) {
    return {
      editing: false,
      sel: null,
      draft: null,
      saved: null,
      dirty: false,
      pending: false,
      ...shared,
    };
  }
  const saved = slots[sel] ?? null;
  return {
    editing: true,
    sel,
    draft,
    saved,
    dirty: !same(draft, saved),
    pending: state.pending[slotPendingId(kind, sel)]?.status === "pending",
    ...shared,
  };
}
