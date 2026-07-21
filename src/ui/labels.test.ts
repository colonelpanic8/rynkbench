import { describe, expect, it } from "vitest";
import type { ModifierCombination } from "../vendor/rynk-wasm/rynk_wasm";
import { EMPTY_MODS, hidLabel, modifierSymbols } from "./labels";

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
