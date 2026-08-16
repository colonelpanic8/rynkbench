import { describe, expect, it } from "vitest";
import type { KeyAction, ModifierCombination } from "../../vendor/rynk-wasm/rynk_wasm";
import { decodeMacros, encodeMacros } from "../macros";
import { emptyStateBits } from "./bits";
import {
  CTRL_GUI_SWAP,
  alphaSpec,
  mapKeyAction,
  planAlphaRemap,
  planOsSwap,
  type TransformInput,
} from "./transforms";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });

const NO_MODS: ModifierCombination = {
  left_ctrl: false,
  left_shift: false,
  left_alt: false,
  left_gui: false,
  right_ctrl: false,
  right_shift: false,
  right_alt: false,
  right_gui: false,
};

function baseInput(overrides: Partial<TransformInput>): TransformInput {
  return {
    layers: [],
    cols: 2,
    combos: [],
    morse: [],
    forks: [],
    macroBytes: new Uint8Array(),
    ...overrides,
  };
}

describe("CTRL_GUI_SWAP", () => {
  it("swaps bare modifier keycodes and is its own inverse", () => {
    const cases: KeyAction[] = [
      key("LCtrl"),
      { Single: { Modifier: { ...NO_MODS, left_ctrl: true, left_alt: true } } },
      { Single: { KeyWithModifier: ["C", { ...NO_MODS, left_ctrl: true }] } },
      { Single: { OneShotModifier: { ...NO_MODS, right_gui: true } } },
      { LayerModTap: [4, "LCtrl", "Tab"] },
      { TapHold: [{ Key: { Hid: "A" } }, { Modifier: { ...NO_MODS, left_gui: true } }, 255] },
    ];
    for (const before of cases) {
      const once = mapKeyAction(CTRL_GUI_SWAP, before);
      expect(once).not.toEqual(before);
      expect(mapKeyAction(CTRL_GUI_SWAP, once)).toEqual(before);
    }
    // Shift is untouched.
    expect(mapKeyAction(CTRL_GUI_SWAP, key("LShift"))).toEqual(key("LShift"));
  });

  it("plans every site kind and skips unchanged ones", () => {
    const plan = planOsSwap(
      baseInput({
        layers: [
          [key("LCtrl"), key("A")],
          [key("B"), key("LGui")],
        ],
        combos: [
          { Actions: { actions: [key("LCtrl"), key("Q")], output: key("C"), layer: 0 } },
          { Actions: { actions: [key("A"), key("B")], output: key("C"), layer: undefined } },
        ],
        morse: [
          {
            profile: {} as never,
            actions: [[1, { KeyWithModifier: ["C", { ...NO_MODS, left_ctrl: true }] }]],
          },
        ],
        forks: [
          {
            trigger: key("A"),
            negative_output: key("A"),
            positive_output: key("B"),
            match_any: emptyStateBits(),
            match_none: emptyStateBits(),
            kept_modifiers: { ...NO_MODS, left_ctrl: true },
            bindable: false,
          },
        ],
        macroBytes: encodeMacros([
          { steps: [{ kind: "press", code: "LCtrl" }, { kind: "tap", code: "C" }] },
        ]),
      }),
    );
    expect(plan.keys).toHaveLength(2); // one changed key per layer
    expect(plan.combos).toHaveLength(1); // the LCtrl combo only
    expect(plan.morse).toHaveLength(1);
    expect(plan.forks).toHaveLength(1); // kept_modifiers changed
    expect(plan.macroBytes).not.toBeNull();
    const macros = decodeMacros(plan.macroBytes!);
    expect(macros[0].steps[0]).toEqual({ kind: "press", code: "LGui" });
  });

  it("plans nothing on an already-neutral keymap", () => {
    const plan = planOsSwap(baseInput({ layers: [[key("A"), key("LShift")]] }));
    expect(plan.keys).toHaveLength(0);
    expect(plan.macroBytes).toBeNull();
  });
});

describe("alpha remap", () => {
  it("maps colemak home row and leaves non-alphas alone", () => {
    const spec = alphaSpec("colemak");
    expect(mapKeyAction(spec, key("S"))).toEqual(key("R"));
    expect(mapKeyAction(spec, key("Semicolon"))).toEqual(key("O"));
    expect(mapKeyAction(spec, key("P"))).toEqual(key("Semicolon"));
    expect(mapKeyAction(spec, key("A"))).toEqual(key("A"));
    expect(mapKeyAction(spec, key("LCtrl"))).toEqual(key("LCtrl"));
    expect(mapKeyAction(spec, key("Quote"))).toEqual(key("Quote"));
  });

  it("maps dvorak punctuation", () => {
    const spec = alphaSpec("dvorak");
    expect(mapKeyAction(spec, key("Q"))).toEqual(key("Quote"));
    expect(mapKeyAction(spec, key("Minus"))).toEqual(key("LeftBracket"));
    expect(mapKeyAction(spec, key("LeftBracket"))).toEqual(key("Slash"));
    expect(mapKeyAction(spec, key("Quote"))).toEqual(key("Minus"));
  });

  it("follows the tap keycode inside a tap-hold and stays on target layers", () => {
    const plan = planAlphaRemap(
      baseInput({
        layers: [
          [{ TapHold: [{ Key: { Hid: "Semicolon" } }, { LayerOn: 1 }, 3] }, key("S")],
          [key("W"), key("S")], // games-style layer, not selected
        ],
      }),
      "colemak",
      [0],
    );
    expect(plan.keys).toHaveLength(2);
    expect(plan.keys[0].after).toEqual({
      TapHold: [{ Key: { Hid: "O" } }, { LayerOn: 1 }, 3],
    });
    expect(plan.keys.every((edit) => edit.layer === 0)).toBe(true);
  });
});
