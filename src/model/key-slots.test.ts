import { describe, expect, it } from "vitest";
import type { Action, KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { DEFAULT_TAP_HOLD_PROFILE } from "./morse";
import { emptyMorse } from "./slots";
import {
  DOUBLE_TAP_PATTERN,
  HOLD_PATTERN,
  TAP_PATTERN,
  bindingOf,
  morseOf,
  morseUses,
  planSlotWrites,
  putSlot,
  slotsOf,
  swapSlots,
  withProfile,
} from "./key-slots";

const A: Action = { Key: { Hid: "A" } } as unknown as Action;
const B: Action = { Key: { Hid: "B" } } as unknown as Action;
const SHIFT: Action = { Modifier: { left_shift: true } } as unknown as Action;
const LOWER: Action = { LayerOn: 1 } as unknown as Action;

const entry = (...actions: Array<[number, Action]>): Morse => ({ ...emptyMorse(), actions });

describe("key slots", () => {
  it("reads every binding RMK has", () => {
    expect(slotsOf("No")).toMatchObject({ kind: "slots", tap: "No", hold: null, doubleTap: null });
    expect(slotsOf("Transparent")).toEqual({ kind: "transparent" });
    expect(slotsOf({ Single: A } as KeyAction)).toMatchObject({ tap: A, hold: null, tapOnly: false });
    expect(slotsOf({ Tap: A } as KeyAction)).toMatchObject({ tap: A, hold: null, tapOnly: true });
    expect(slotsOf({ TapHold: [A, SHIFT, 2] } as KeyAction)).toMatchObject({ tap: A, hold: SHIFT, profile: 2 });
    expect(slotsOf({ Morse: 3 } as KeyAction)).toEqual({ kind: "morse", index: 3 });
  });

  it("reads a morse entry of tap, hold and tap-tap as slots", () => {
    const morse = [emptyMorse(), entry([TAP_PATTERN, A], [HOLD_PATTERN, SHIFT], [DOUBLE_TAP_PATTERN, B])];
    expect(slotsOf({ Morse: 1 } as KeyAction, morse)).toMatchObject({
      kind: "slots",
      tap: A,
      hold: SHIFT,
      doubleTap: B,
      morse: { index: 1 },
    });
    const triple = [entry([TAP_PATTERN, A], [0b1000, B])];
    expect(slotsOf({ Morse: 0 } as KeyAction, triple)).toEqual({ kind: "morse", index: 0 });
    expect(slotsOf({ Morse: 0 } as KeyAction, [emptyMorse()])).toEqual({ kind: "morse", index: 0 });
  });

  it("writes slots back to the binding they came from", () => {
    const bindings = [
      "No",
      { Single: A },
      { Tap: A },
      { TapHold: [A, SHIFT, 2] },
      { TapHold: ["No", SHIFT, DEFAULT_TAP_HOLD_PROFILE] },
    ] as KeyAction[];
    for (const action of bindings) {
      const slots = slotsOf(action);
      if (slots.kind !== "slots") throw new Error("expected slots");
      expect(bindingOf(slots)).toEqual(action);
    }
  });

  it("builds a morse entry with only the slots that are set", () => {
    expect(morseOf({ tap: A, hold: null, doubleTap: B }).actions).toEqual([
      [TAP_PATTERN, A],
      [DOUBLE_TAP_PATTERN, B],
    ]);
  });

  it("puts a value in one slot and removes one", () => {
    const tapHold = slotsOf({ TapHold: [A, SHIFT, 2] } as KeyAction);
    expect(putSlot(tapHold, "doubleTap", B)).toEqual({ tap: A, hold: SHIFT, doubleTap: B });
    expect(putSlot(tapHold, "hold", null)).toEqual({ tap: A, hold: null, doubleTap: null });
    expect(putSlot(tapHold, "tap", null)).toEqual({ tap: "No", hold: SHIFT, doubleTap: null });
    expect(putSlot({ kind: "transparent" }, "hold", LOWER)).toEqual({ tap: "No", hold: LOWER, doubleTap: null });
  });

  it("changes the timing profile of a tap-hold only", () => {
    expect(withProfile({ TapHold: [A, SHIFT, 2] } as KeyAction, 4)).toEqual({ TapHold: [A, SHIFT, 4] });
    expect(withProfile({ Single: A } as KeyAction, 4)).toEqual({ Single: A });
  });

  it("leaves bindings it cannot show as slots alone", () => {
    const layerModTap = { LayerModTap: [1, { left_shift: true }] } as unknown as KeyAction;
    expect(slotsOf(layerModTap)).toEqual({ kind: "other" });
    expect(withProfile(layerModTap, 2)).toBe(layerModTap);
  });
});

describe("planning slot writes", () => {
  it("counts the keys bound to each morse entry", () => {
    const layers = [[{ Morse: 1 }, { Single: A }], [{ Morse: 1 }, { Morse: 0 }]] as KeyAction[][];
    expect(morseUses(layers)).toEqual(new Map([[1, 2], [0, 1]]));
  });

  it("writes a plain binding when there is no double tap", () => {
    expect(planSlotWrites({ Single: A } as KeyAction, { tap: A, hold: SHIFT, doubleTap: null }, [], new Map())).toEqual([
      { kind: "key", binding: { TapHold: [A, SHIFT, DEFAULT_TAP_HOLD_PROFILE] } },
    ]);
  });

  it("gives a new double tap the first unused empty entry, before the key", () => {
    const morse = [emptyMorse(), entry([TAP_PATTERN, B]), emptyMorse()];
    const uses = new Map([[0, 1]]); // entry 0 is empty but some key points at it
    expect(planSlotWrites({ Single: A } as KeyAction, { tap: A, hold: null, doubleTap: B }, morse, uses)).toEqual([
      { kind: "morse", index: 2, entry: entry([TAP_PATTERN, A], [DOUBLE_TAP_PATTERN, B]) },
      { kind: "key", binding: { Morse: 2 } },
    ]);
  });

  it("reuses an entry no key uses, and returns null when every entry is in use", () => {
    const morse = [entry([TAP_PATTERN, B])];
    const next = { tap: A, hold: null, doubleTap: B };
    expect(planSlotWrites({ Single: A } as KeyAction, next, morse, new Map())?.[0]).toMatchObject({ index: 0 });
    expect(planSlotWrites({ Single: A } as KeyAction, next, morse, new Map([[0, 1]]))).toBeNull();
  });

  it("rewrites the key's own entry in place and leaves the key as it is", () => {
    const morse = [entry([TAP_PATTERN, A], [DOUBLE_TAP_PATTERN, B])];
    const current = { Morse: 0 } as KeyAction;
    expect(planSlotWrites(current, { tap: A, hold: SHIFT, doubleTap: B }, morse, new Map([[0, 1]]))).toEqual([
      { kind: "morse", index: 0, entry: entry([TAP_PATTERN, A], [HOLD_PATTERN, SHIFT], [DOUBLE_TAP_PATTERN, B]) },
    ]);
  });

  it("copies a shared entry rather than changing the other keys", () => {
    const morse = [entry([TAP_PATTERN, A], [DOUBLE_TAP_PATTERN, B]), emptyMorse()];
    const writes = planSlotWrites({ Morse: 0 } as KeyAction, { tap: B, hold: null, doubleTap: B }, morse, new Map([[0, 2]]));
    expect(writes?.map((write) => (write.kind === "morse" ? write.index : write.binding))).toEqual([1, { Morse: 1 }]);
  });

  it("leaves the entry when a key loses its double tap, so undo brings it back", () => {
    const morse = [entry([TAP_PATTERN, A], [DOUBLE_TAP_PATTERN, B])];
    expect(planSlotWrites({ Morse: 0 } as KeyAction, { tap: A, hold: null, doubleTap: null }, morse, new Map([[0, 1]]))).toEqual([
      { kind: "key", binding: { Single: A } },
    ]);
    expect(planSlotWrites({ Morse: 0 } as KeyAction, "Transparent", morse, new Map([[0, 1]]))).toEqual([
      { kind: "key", binding: "Transparent" },
    ]);
  });

  it("swaps two slots as GLIDE does, dropping a hold left empty", () => {
    const tapHold = slotsOf({ TapHold: [A, SHIFT, DEFAULT_TAP_HOLD_PROFILE] } as unknown as KeyAction);
    expect(swapSlots(tapHold, "tap", "hold")).toEqual({ tap: SHIFT, hold: A, doubleTap: null });
    const holdOnly = slotsOf({ TapHold: ["No", SHIFT, DEFAULT_TAP_HOLD_PROFILE] } as unknown as KeyAction);
    expect(swapSlots(holdOnly, "hold", "tap")).toEqual({ tap: SHIFT, hold: null, doubleTap: null });
    expect(swapSlots(tapHold, "tap", "tap")).toBeNull();
    expect(swapSlots({ kind: "transparent" }, "tap", "hold")).toBeNull();
  });
});
