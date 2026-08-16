import { describe, expect, it } from "vitest";
import type { KeyAction, ModifierCombination } from "../../vendor/rynk-wasm/rynk_wasm";
import { decodeMacros, encodeMacros } from "../macros";
import { emptyStateBits } from "./bits";
import {
  CTRL_GUI_SWAP,
  layoutSpec,
  mapKeyAction,
  planLayoutSwitch,
  planOsSwap,
  primaryHid,
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

describe("layout switching", () => {
  it("maps colemak home row and leaves non-alphas alone", () => {
    const spec = layoutSpec("qwerty", "colemak");
    expect(mapKeyAction(spec, key("S"))).toEqual(key("R"));
    expect(mapKeyAction(spec, key("Semicolon"))).toEqual(key("O"));
    expect(mapKeyAction(spec, key("P"))).toEqual(key("Semicolon"));
    expect(mapKeyAction(spec, key("A"))).toEqual(key("A"));
    expect(mapKeyAction(spec, key("LCtrl"))).toEqual(key("LCtrl"));
    expect(mapKeyAction(spec, key("Quote"))).toEqual(key("Quote"));
  });

  it("maps dvorak punctuation", () => {
    const spec = layoutSpec("qwerty", "dvorak");
    expect(mapKeyAction(spec, key("Q"))).toEqual(key("Quote"));
    expect(mapKeyAction(spec, key("Minus"))).toEqual(key("LeftBracket"));
    expect(mapKeyAction(spec, key("LeftBracket"))).toEqual(key("Slash"));
    expect(mapKeyAction(spec, key("Quote"))).toEqual(key("Minus"));
  });

  it("inverts and composes across layout pairs", () => {
    const there = layoutSpec("qwerty", "colemak");
    const back = layoutSpec("colemak", "qwerty");
    for (const code of ["S", "P", "Semicolon", "E", "N"] as const) {
      expect(mapKeyAction(back, mapKeyAction(there, key(code)))).toEqual(key(code));
    }
    // colemak → dvorak equals qwerty→dvorak ∘ colemak→qwerty.
    const direct = layoutSpec("colemak", "dvorak");
    const viaQwerty = (code: string) =>
      mapKeyAction(layoutSpec("qwerty", "dvorak"), mapKeyAction(back, key(code)));
    for (const code of ["R", "S", "T", "O", "K"] as const) {
      expect(mapKeyAction(direct, key(code))).toEqual(viaQwerty(code));
    }
  });

  it("reads the primary keycode through tap-holds and wrappers", () => {
    expect(primaryHid(key("C"))).toBe("C");
    expect(primaryHid({ TapHold: [{ Key: { Hid: "A" } }, { LayerOn: 1 }, 255] })).toBe("A");
    expect(primaryHid({ Single: { KeyWithModifier: ["C", NO_MODS] } })).toBe("C");
    expect(primaryHid({ LayerModTap: [2, "LCtrl", "Tab"] })).toBe("Tab");
    expect(primaryHid("Transparent")).toBeNull();
    expect(primaryHid({ Single: { LayerOn: 1 } })).toBeNull();
  });

  it("substitutes alphas layers and skips positional layers", () => {
    const plan = planLayoutSwitch(
      baseInput({
        layers: [
          [{ TapHold: [{ Key: { Hid: "Semicolon" } }, { LayerOn: 1 }, 3] }, key("S")],
          [key("W"), key("S")], // games-style layer, positional
        ],
      }),
      "qwerty",
      "colemak",
      ["alphas", "positional"],
      0,
    );
    expect(plan.keys).toHaveLength(2);
    expect(plan.keys[0].after).toEqual({
      TapHold: [{ Key: { Hid: "O" } }, { LayerOn: 1 }, 3],
    });
    expect(plan.keys.every((edit) => edit.layer === 0)).toBe(true);
  });

  it("moves mnemonic bindings to follow their letters", () => {
    // Base carries E F T at offsets 0..2. QWERTY→Colemak maps E→F, F→T; the
    // shortcut layer's Copy-style bindings must follow their letters: the
    // binding on E moves to where E ends up (F's old spot maps E onto it).
    const ctrl = (code: string): KeyAction => ({
      Single: { KeyWithModifier: [code as never, { ...NO_MODS, left_ctrl: true }] },
    });
    const plan = planLayoutSwitch(
      baseInput({
        layers: [
          [key("E"), key("F"), key("T"), key("Space")],
          [ctrl("E"), ctrl("F"), ctrl("T"), key("Enter")],
        ],
        cols: 4,
      }),
      "qwerty",
      "colemak",
      ["alphas", "mnemonic"],
      0,
    );
    const layerOne = plan.keys.filter((edit) => edit.layer === 1);
    // New base letters at offsets 0..2 are F, T, G. The binding tied to F
    // (old offset 1) lands at offset 0; T's (old offset 2) lands at 1. G is
    // not on the base layer, so offset 2 keeps its old binding. The thumb
    // key at offset 3 is untouched.
    expect(layerOne).toEqual([
      { layer: 1, row: 0, col: 0, after: ctrl("F") },
      { layer: 1, row: 0, col: 1, after: ctrl("T") },
    ]);
  });

  it("derives the mnemonic permutation from the alphas layer, not the default", () => {
    const ctrl = (code: string): KeyAction => ({
      Single: { KeyWithModifier: [code as never, { ...NO_MODS, left_ctrl: true }] },
    });
    const plan = planLayoutSwitch(
      baseInput({
        layers: [
          [key("Kc1"), key("Kc2"), key("Kc3"), key("Kc4")], // default: no alphas
          [key("E"), key("F"), key("T"), key("Space")], // the alpha layer
          [ctrl("E"), ctrl("F"), ctrl("T"), key("Enter")], // shortcuts follow letters
        ],
        cols: 4,
      }),
      "qwerty",
      "colemak",
      ["positional", "alphas", "mnemonic"],
      0,
    );
    expect(plan.keys.filter((edit) => edit.layer === 2)).toEqual([
      { layer: 2, row: 0, col: 0, after: ctrl("F") },
      { layer: 2, row: 0, col: 1, after: ctrl("T") },
    ]);
    expect(plan.keys.filter((edit) => edit.layer === 0)).toEqual([]);
  });
});
