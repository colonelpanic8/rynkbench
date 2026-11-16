// A key's actions as GLIDE's key editor shows them: slots. On Tap is what the
// key does when pressed; On Hold, when held; On Double Tap, when pressed twice.
// In RMK a tap with a hold is a tap-hold (with a timing profile); a key with a
// double tap is a morse entry with the patterns tap, hold and tap-tap. A key
// set to fall through to the layer below, bound to a morse entry with other
// patterns, or bound some other way (LayerModTap) has no slots here. Pure.

import type { Action, KeyAction, Morse, MorseProfile } from "../vendor/rynk-wasm/rynk_wasm";
import { DEFAULT_TAP_HOLD_PROFILE, elementsToPattern } from "./morse";
import { emptyMorseProfile } from "./slots";

export type Slot = "tap" | "hold" | "doubleTap";

export interface SlotValues {
  tap: Action;
  /** null: no such slot. */
  hold: Action | null;
  doubleTap: Action | null;
}

export type KeySlots =
  | (SlotValues & {
      kind: "slots";
      /** The tap-hold timing profile; the board default without a hold. */
      profile: number;
      /** RMK's `Tap` binding (tap only), kept as it is when only its tap changes. */
      tapOnly: boolean;
      /** The morse entry behind a key with a double tap, and its timing. */
      morse: { index: number; profile: MorseProfile } | null;
    })
  | { kind: "transparent" }
  | { kind: "morse"; index: number }
  /** A binding the slots cannot show yet (RMK's LayerModTap); kept as it is. */
  | { kind: "other" };

export type SlotsOf = Extract<KeySlots, { kind: "slots" }>;

export const TAP_PATTERN = elementsToPattern(["tap"]);
export const HOLD_PATTERN = elementsToPattern(["hold"]);
export const DOUBLE_TAP_PATTERN = elementsToPattern(["tap", "tap"]);
const SLOT_PATTERNS = new Set([TAP_PATTERN, HOLD_PATTERN, DOUBLE_TAP_PATTERN]);

export function emptySlots(): SlotsOf {
  return {
    kind: "slots",
    tap: "No",
    hold: null,
    doubleTap: null,
    profile: DEFAULT_TAP_HOLD_PROFILE,
    tapOnly: false,
    morse: null,
  };
}

/** The slots of a morse entry, when it holds only tap, hold and tap-tap. */
function morseSlots(index: number, entry: Morse | undefined): SlotsOf | null {
  if (!entry || entry.actions.length === 0) return null;
  if (!entry.actions.every(([pattern]) => SLOT_PATTERNS.has(pattern))) return null;
  const find = (pattern: number) => entry.actions.find(([p]) => p === pattern)?.[1] ?? null;
  return {
    ...emptySlots(),
    tap: find(TAP_PATTERN) ?? "No",
    hold: find(HOLD_PATTERN),
    doubleTap: find(DOUBLE_TAP_PATTERN),
    morse: { index, profile: entry.profile },
  };
}

/** The slots of a binding. `morse` is the keyboard's morse table, so a key
 *  bound to an entry of tap, hold and tap-tap shows as slots. */
export function slotsOf(action: KeyAction, morse: readonly Morse[] = []): KeySlots {
  if (action === "No") return emptySlots();
  if (action === "Transparent") return { kind: "transparent" };
  if ("Single" in action) return { ...emptySlots(), tap: action.Single };
  if ("Tap" in action) return { ...emptySlots(), tap: action.Tap, tapOnly: true };
  if ("TapHold" in action) {
    const [tap, hold, profile] = action.TapHold;
    return { ...emptySlots(), tap, hold, profile };
  }
  if ("Morse" in action) {
    return morseSlots(action.Morse, morse[action.Morse]) ?? { kind: "morse", index: action.Morse };
  }
  return { kind: "other" };
}

/** The binding for slots without a double tap: a tap-hold when there is a
 *  hold, a single action otherwise, or nothing when the tap is empty too. */
export function bindingOf(slots: SlotValues & { profile: number; tapOnly: boolean }): KeyAction {
  if (slots.hold !== null) return { TapHold: [slots.tap, slots.hold, slots.profile] };
  if (slots.tap === "No") return "No";
  return slots.tapOnly ? { Tap: slots.tap } : { Single: slots.tap };
}

/** The morse entry for slots with a double tap. */
export function morseOf(slots: SlotValues, profile: MorseProfile = emptyMorseProfile()): Morse {
  const actions: Array<[number, Action]> = [];
  if (slots.tap !== "No") actions.push([TAP_PATTERN, slots.tap]);
  if (slots.hold !== null) actions.push([HOLD_PATTERN, slots.hold]);
  if (slots.doubleTap !== null) actions.push([DOUBLE_TAP_PATTERN, slots.doubleTap]);
  return { profile, actions } as Morse;
}

/** The slots after putting `value` in one of them; `null` removes a hold or a
 *  double tap and empties the tap. A key without slots starts from empty ones. */
export function putSlot(current: KeySlots, slot: Slot, value: Action | null): SlotValues {
  const base = current.kind === "slots" ? current : emptySlots();
  const values: SlotValues = { tap: base.tap, hold: base.hold, doubleTap: base.doubleTap };
  if (slot === "tap") return { ...values, tap: value ?? "No" };
  return { ...values, [slot]: value };
}

/** The slots after swapping two of them, as GLIDE does when a slot is dragged
 *  by its handle onto another (core/slots.js swapSlots): each takes the other's
 *  action; a hold or double tap left empty goes away, an empty tap stays an
 *  empty tap. `null` when there is nothing to swap. */
export function swapSlots(current: KeySlots, a: Slot, b: Slot): SlotValues | null {
  if (a === b || current.kind !== "slots") return null;
  const valueOf = (slot: Slot) => {
    const value = current[slot];
    return value === null || value === "No" ? null : value;
  };
  const [first, second] = [valueOf(a), valueOf(b)];
  if (first === null && second === null) return null;
  const next: SlotValues = { tap: current.tap, hold: current.hold, doubleTap: current.doubleTap };
  const put = (slot: Slot, value: Action | null) => {
    if (slot === "tap") next.tap = value ?? "No";
    else next[slot] = value;
  };
  put(a, second);
  put(b, first);
  return next;
}

/** How many keys, on every layer, are bound to each morse entry. */
export function morseUses(layers: readonly (readonly KeyAction[])[]): Map<number, number> {
  const uses = new Map<number, number>();
  for (const layer of layers) {
    for (const action of layer) {
      if (typeof action === "object" && "Morse" in action) uses.set(action.Morse, (uses.get(action.Morse) ?? 0) + 1);
    }
  }
  return uses;
}

export type SlotWrite = { kind: "morse"; index: number; entry: Morse } | { kind: "key"; binding: KeyAction };

/** The writes, in order, that give a key new slot values (or make it fall
 *  through); `null` when a double tap needs a morse entry and none is free.
 *  A key with a double tap gets a morse entry of its own: its current one when
 *  no other key shares it, else a free one, written before the key points at
 *  it. A key that loses its double tap leaves its entry as it was, so undoing
 *  the key edit brings the double tap back; an entry no key uses is free again. */
export function planSlotWrites(
  current: KeyAction,
  next: SlotValues | "Transparent",
  morse: readonly Morse[],
  uses: ReadonlyMap<number, number>,
): SlotWrite[] | null {
  const slots = slotsOf(current, morse);
  const base = slots.kind === "slots" ? slots : emptySlots();
  const key = (binding: KeyAction): SlotWrite[] =>
    JSON.stringify(binding) === JSON.stringify(current) ? [] : [{ kind: "key", binding }];
  if (next === "Transparent") return key("Transparent");
  if (next.doubleTap === null) return key(bindingOf({ ...next, profile: base.profile, tapOnly: base.tapOnly }));

  const owned = base.morse !== null && (uses.get(base.morse.index) ?? 0) <= 1 ? base.morse.index : null;
  const index = owned ?? freeMorseEntry(morse, uses);
  if (index === -1) return null;
  return [{ kind: "morse", index, entry: morseOf(next, base.morse?.profile) }, ...key({ Morse: index })];
}

/** A morse entry no key uses: an empty one first, else one a key let go of. */
function freeMorseEntry(morse: readonly Morse[], uses: ReadonlyMap<number, number>): number {
  const unused = (i: number) => !uses.get(i);
  const empty = morse.findIndex((entry, i) => unused(i) && entry.actions.length === 0);
  return empty !== -1 ? empty : morse.findIndex((_, i) => unused(i));
}

/** The binding with another tap-hold timing profile (a tap-hold only). */
export function withProfile(current: KeyAction, profile: number): KeyAction {
  const slots = slotsOf(current);
  if (slots.kind !== "slots" || slots.hold === null || slots.morse !== null) return current;
  return bindingOf({ ...slots, profile });
}
