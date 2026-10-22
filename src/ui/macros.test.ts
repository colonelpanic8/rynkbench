import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import type { MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
import { decodeMacros, encodeMacros, macroByteCost, macroTableSize } from "./macros";

beforeAll(() => initSync({ module: readFileSync("src/vendor/moergo-config-wasm/moergo_config_wasm_bg.wasm") }));

describe("typed macro editing", () => {
  it("preserves empty slots, native actions and release boundaries", () => {
    const macros: MacroOp[][] = [[], [{ Char: 72 }, { Char: 105 }], [
      { Press: { Key: { Hid: "LShift" } } }, { Delay: 65535 },
      "PauseForRelease", { Release: { LayerOff: 3 } },
    ]];
    expect(encodeMacros(decodeMacros(macros))).toEqual(macros);
    expect(decodeMacros(macros)[1].steps).toEqual([{ kind: "text", text: "Hi" }]);
  });
  it("uses the firmware encoding to size text and empty slots", () => {
    expect(macroByteCost({ steps: [{ kind: "text", text: "Hi" }] })).toBe(5);
    expect(macroTableSize([[{ Char: 65 }]], 4)).toBe(6);
  });
});
