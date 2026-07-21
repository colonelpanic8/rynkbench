// Codec cross-checked against RMK's own serializer tests
// (rmk/src/keyboard_macros.rs) — byte vectors copied verbatim.

import { describe, expect, it } from "vitest";
import { decodeMacros, encodeMacros, macroByteCost } from "./macros";
import type { DecodedMacro } from "./macros";

// test_define_one_macro_sequence_manual: Press LShift, Tap P, Release LShift, Tap A, Tap T
const SHIFT_PAT = [
  0x01, 0x02, 0xe1, 0x01, 0x01, 0x13, 0x01, 0x03, 0xe1, 0x01, 0x01, 0x04, 0x01, 0x01, 0x17, 0x00,
];

// test_define_two_macro_sequence_manual: Text "Hi" then the sequence above
const HI_THEN_PAT = [
  0x48, 0x69, 0x00, 0x01, 0x02, 0xe1, 0x01, 0x01, 0x13, 0x01, 0x03, 0xe1, 0x01, 0x01, 0x04, 0x01,
  0x01, 0x17, 0x00,
];

const PAT_MACRO: DecodedMacro = {
  steps: [
    { kind: "press", code: "LShift" },
    { kind: "tap", code: "P" },
    { kind: "release", code: "LShift" },
    { kind: "tap", code: "A" },
    { kind: "tap", code: "T" },
  ],
};

describe("macro codec", () => {
  it("encodes RMK's reference sequence byte-for-byte", () => {
    expect([...encodeMacros([PAT_MACRO])]).toEqual(SHIFT_PAT);
  });

  it("encodes text + ops across two macros", () => {
    const macros: DecodedMacro[] = [{ steps: [{ kind: "text", text: "Hi" }] }, PAT_MACRO];
    expect([...encodeMacros(macros)]).toEqual(HI_THEN_PAT);
  });

  it("decodes a zero-padded region back to the same macros", () => {
    const padded = new Uint8Array(64);
    padded.set(HI_THEN_PAT);
    const macros = decodeMacros(padded);
    expect(macros).toHaveLength(2);
    expect(macros[0].steps).toEqual([{ kind: "text", text: "Hi" }]);
    expect(macros[1].steps).toEqual(PAT_MACRO.steps);
  });

  it("round-trips delays through the firmware's decoder formula", () => {
    const macro: DecodedMacro = { steps: [{ kind: "delay", ms: 1234 }] };
    const [decoded] = decodeMacros(encodeMacros([macro]));
    expect(decoded.steps).toEqual([{ kind: "delay", ms: 1234 }]);
  });

  it("counts byte cost including the terminator", () => {
    expect(macroByteCost(PAT_MACRO)).toBe(16);
    expect(macroByteCost({ steps: [{ kind: "text", text: "Hi" }] })).toBe(3);
  });
});
