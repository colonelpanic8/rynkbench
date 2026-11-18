import { describe, expect, it } from "vitest";
import type { MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
import { decodeMacros, encodeMacros, hidStep, macroByteCost, macroPreview, macroTableSize } from "./macros";

describe("typed macro editing", () => {
  it("preserves empty slots, any action and release boundaries", () => {
    const macros: MacroOp[][] = [[], [{ Char: 72 }, { Char: 105 }], [
      { Press: { Key: { Hid: "LShift" } } }, { Delay: 65535 },
      "PauseForRelease", { Release: { LayerOff: 3 } },
    ]];
    expect(encodeMacros(decodeMacros(macros))).toEqual(macros);
    expect(decodeMacros(macros)[1].steps).toEqual([{ kind: "text", text: "Hi" }]);
    expect(decodeMacros(macros)[2].steps).toEqual([
      hidStep("press", "LShift"), { kind: "delay", ms: 65535 }, { kind: "letGo" }, { kind: "release", action: { LayerOff: 3 } },
    ]);
  });
  it("uses the firmware encoding to size text and empty slots", () => {
    expect(macroByteCost({ steps: [{ kind: "text", text: "Hi" }] })).toBe(5);
    expect(macroTableSize([[{ Char: 65 }]], 4)).toBe(6);
  });
  it("names a macro by its first step", () => {
    expect(macroPreview({ steps: [hidStep("tap", "Home")] })).toBe("tap Home…");
    expect(macroPreview({ steps: [{ kind: "press", action: { LayerOn: 2 } }] })).toBe("press LayerOn…");
    expect(macroPreview({ steps: [{ kind: "letGo" }] })).toBe("wait for release");
  });
});
