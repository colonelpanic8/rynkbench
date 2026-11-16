import { describe, expect, it } from "vitest";
import type { ComboDefinition, KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { comboHasKey, comboNeeds, comboTwins, newPositionCombo, toggleComboKey } from "./combos";
import { emptyCombo } from "./slots";

const A = { Single: { Key: { Hid: "A" } } } as unknown as KeyAction;
const B = { Single: { Key: { Hid: "B" } } } as unknown as KeyAction;
const ESC = { Single: { Key: { Hid: "Escape" } } } as unknown as KeyAction;
const at = (row: number, col: number) => ({ row, col });
const places = (layer: number | undefined, ...keys: Array<[number, number]>): ComboDefinition => ({
  Positions: { positions: keys.map(([row, col]) => at(row, col)), output: ESC, layer },
});
const actions = (...list: KeyAction[]): ComboDefinition => ({ Actions: { actions: list, output: ESC, layer: undefined } });

describe("combos on the canvas", () => {
  it("starts an empty slot as a combo that matches places", () => {
    const result = toggleComboKey(emptyCombo(), at(1, 2), A, 4);
    expect(result).toEqual({ ok: true, combo: { Positions: { positions: [at(1, 2)], output: "No", layer: undefined } } });
  });

  it("adds a key, and takes it out on a second click", () => {
    const one = places(undefined, [0, 0]);
    const two = toggleComboKey(one, at(0, 1), A, 4);
    expect(two.ok && two.combo).toEqual(places(undefined, [0, 0], [0, 1]));
    expect(toggleComboKey(places(undefined, [0, 0], [0, 1]), at(0, 1), A, 4)).toEqual({ ok: true, combo: one });
  });

  it("stops at the keyboard's key limit, but still takes keys out", () => {
    const full = places(undefined, [0, 0], [0, 1]);
    expect(toggleComboKey(full, at(0, 2), A, 2)).toEqual({ ok: false, reason: "full" });
    expect(toggleComboKey(full, at(0, 1), A, 2).ok).toBe(true);
  });

  it("matches a combo of actions by what the key does", () => {
    const combo = actions(A);
    expect(comboHasKey(combo, at(5, 5), A)).toBe(true);
    expect(toggleComboKey(combo, at(5, 5), B, 4)).toEqual({ ok: true, combo: actions(A, B) });
    expect(toggleComboKey(combo, at(5, 5), A, 4)).toEqual({ ok: true, combo: actions() });
    expect(toggleComboKey(combo, at(5, 5), "No", 4)).toEqual({ ok: false, reason: "no-action" });
  });

  it("says what a combo still needs", () => {
    expect(comboNeeds(places(undefined, [0, 0]))).toBe("keys");
    expect(comboNeeds({ Positions: { positions: [at(0, 0), at(0, 1)], output: "No", layer: undefined } })).toBe("action");
    expect(comboNeeds(places(undefined, [0, 0], [0, 1]))).toBeNull();
    expect(comboNeeds(newPositionCombo())).toBe("keys");
  });

  it("finds combos on the same keys whose layers overlap", () => {
    const combos = [places(undefined, [0, 0], [0, 1]), places(2, [0, 1], [0, 0]), places(3, [0, 0], [0, 1]), places(undefined, [0, 0])];
    expect(comboTwins(combos, 0)).toEqual([1, 2]);
    expect(comboTwins(combos, 1)).toEqual([0]);
    expect(comboTwins(combos, 3)).toEqual([]);
  });
});
