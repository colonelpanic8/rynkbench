import { describe, expect, it } from "vitest";
import type { ModifierCombination } from "../vendor/rynk-wasm/rynk_wasm";
import {
  actionLabel,
  EMPTY_MODS,
  hidLabel,
  keyActionDescription,
  modifierSymbols,
} from "./labels";
import { DEFAULT_TAP_HOLD_PROFILE } from "./morse";

function mods(fields: Partial<ModifierCombination>): ModifierCombination {
  return { ...EMPTY_MODS, ...fields };
}

describe("modifier labels", () => {
  it("distinguishes left and right modifier HID usages", () => {
    expect(hidLabel("LCtrl")).toBe("L⌃");
    expect(hidLabel("RCtrl")).toBe("R⌃");
    expect(hidLabel("LShift")).toBe("L⇧");
    expect(hidLabel("RShift")).toBe("R⇧");
    expect(hidLabel("LAlt")).toBe("L⌥");
    expect(hidLabel("RAlt")).toBe("R⌥");
    expect(hidLabel("LGui")).toBe("L⌘");
    expect(hidLabel("RGui")).toBe("R⌘");
  });

  it("preserves side information in modifier combinations", () => {
    expect(modifierSymbols(mods({ left_alt: true }))).toBe("L⌥");
    expect(modifierSymbols(mods({ right_alt: true }))).toBe("R⌥");
    expect(modifierSymbols(mods({ left_gui: true, right_gui: true }))).toBe("L⌘R⌘");
  });
});

describe("tap-hold descriptions", () => {
  it("reads the third field as a profile slot, not a timeout", () => {
    const tap = { Key: { Hid: "A" as const } };
    const hold = { LayerOn: 1 };
    expect(keyActionDescription({ TapHold: [tap, hold, DEFAULT_TAP_HOLD_PROFILE] })).toBe(
      "Tap A / hold L1 · default timing",
    );
    expect(keyActionDescription({ TapHold: [tap, hold, 0] })).toBe(
      "Tap A / hold L1 · timing profile 0",
    );
  });
});

describe("lighting action labels", () => {
  it("labels the output-policy and named extension actions", () => {
    expect(actionLabel({ Light: "OutputModeCycle" })).toBe("OutMode");
    expect(actionLabel({ Light: "RgbModeTwinkle" })).toBe("Twinkle");
  });
});
