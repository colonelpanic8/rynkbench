import { describe, expect, it } from "vitest";
import type { KeyAction, Morse } from "../../vendor/rynk-wasm/rynk_wasm";
import { encodeMacros } from "../macros";
import { emptyStateBits } from "./bits";
import { analyzeUsage, keyActionRefs, type UsageInput } from "./usage";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });
const mo = (layer: number): KeyAction => ({ Single: { LayerOn: layer } });

const emptyMorse: Morse = { profile: {} as Morse["profile"], actions: [] };
const holdMorse: Morse = {
  profile: {} as Morse["profile"],
  actions: [
    [1, { Key: { Hid: "Delete" } }],
    [2, { LayerOn: 2 }],
  ],
};

function baseInput(overrides: Partial<UsageInput>): UsageInput {
  return {
    layers: [],
    cols: 2,
    defaultLayer: 0,
    layerMetadata: null,
    combos: [],
    morse: [],
    forks: [],
    macroBytes: new Uint8Array(),
    morseProfiles: [],
    ...overrides,
  };
}

describe("keyActionRefs", () => {
  it("collects layer, morse, macro, and profile references", () => {
    expect(keyActionRefs(mo(3)).activates).toEqual([3]);
    expect(keyActionRefs({ Morse: 4 }).morse).toEqual([4]);
    expect(keyActionRefs({ Single: { TriggerMacro: 2 } }).macros).toEqual([2]);
    expect(
      keyActionRefs({ TapHold: [{ Key: { Hid: "A" } }, { LayerOn: 1 }, 5] }),
    ).toMatchObject({ activates: [1], profiles: [5] });
    expect(
      keyActionRefs({ TapHold: [{ Key: { Hid: "A" } }, "No", 255] }).profiles,
    ).toEqual([]);
    expect(keyActionRefs({ LayerModTap: [6, "LCtrl", "Tab"] }).activates).toEqual([6]);
  });
});

describe("analyzeUsage", () => {
  it("flags unreachable layers and morse-activated layers as reachable", () => {
    const report = analyzeUsage(
      baseInput({
        layers: [
          [key("A"), { Morse: 0 }], // layer 0: morse hold activates layer 2
          [key("B"), "No"], // layer 1: island — nothing activates it
          [key("C"), mo(1)], // layer 2: reachable via morse, references 1
        ],
        morse: [holdMorse],
      }),
    );
    expect(report.layers[1].activators.length).toBeGreaterThan(0); // MO(1) on layer 2
    expect(report.layers[1].reachable).toBe(true);
    expect(report.layers[2].reachable).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  it("warns about layers nothing activates", () => {
    const report = analyzeUsage(
      baseInput({ layers: [[key("A")], [key("B")]] }),
    );
    expect(report.layers[1].reachable).toBe(false);
    expect(report.warnings.some((w) => w.includes("Layer 1"))).toBe(true);
  });

  it("finds orphaned and dangling morse slots", () => {
    const report = analyzeUsage(
      baseInput({
        layers: [[{ Morse: 3 }, key("A")]],
        morse: [holdMorse, emptyMorse],
      }),
    );
    expect(report.warnings.some((w) => w.includes("Morse slot 0 is configured"))).toBe(true);
    expect(report.warnings.some((w) => w.includes("Morse slot 3 does not exist"))).toBe(true);
    // The empty slot 1 is not an orphan.
    expect(report.warnings.some((w) => w.includes("Morse slot 1"))).toBe(false);
  });

  it("finds orphaned macros and unused profiles", () => {
    const report = analyzeUsage(
      baseInput({
        layers: [[{ Single: { TriggerMacro: 0 } }, key("A")]],
        macroBytes: encodeMacros([
          { steps: [{ kind: "tap", code: "Home" }] },
          { steps: [{ kind: "tap", code: "End" }] },
        ]),
        morseProfiles: [
          { index: 0, name: "hrm", profile: {} as never },
        ],
      }),
    );
    expect(report.macros[0].refs.length).toBe(1);
    expect(report.warnings.some((w) => w.includes("Macro 1 is configured"))).toBe(true);
    expect(report.warnings.some((w) => w.includes('"hrm"'))).toBe(true);
  });

  it("warns when a fork trigger is bound nowhere", () => {
    const report = analyzeUsage(
      baseInput({
        layers: [[key("A"), key("B")]],
        forks: [
          {
            trigger: key("Z"),
            negative_output: key("Z"),
            positive_output: key("Y"),
            match_any: emptyStateBits(),
            match_none: emptyStateBits(),
            kept_modifiers: emptyStateBits().modifiers,
            bindable: false,
          },
        ],
      }),
    );
    expect(report.forks[0].triggerBound).toBe(false);
    expect(report.warnings.some((w) => w.includes("Fork 0"))).toBe(true);
  });

  it("checks combo triggers against the keymap", () => {
    const report = analyzeUsage(
      baseInput({
        layers: [[key("A"), key("B")]],
        combos: [
          {
            Actions: { actions: [key("A"), key("Q")], output: key("C"), layer: undefined },
          },
        ],
      }),
    );
    expect(report.combos[0].unboundTriggers).toBe(1);
    expect(report.warnings.some((w) => w.includes("Combo 0"))).toBe(true);
  });
});
