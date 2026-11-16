import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { remapKeyAction } from "./management";

// Golden cases for rewriting the layers a key binding refers to when a layer
// is moved or deleted. They were produced by the implementation that listed the
// layer-carrying action variants itself, before that knowledge moved into the
// domain's single table (src/domain/sources.ts). Each case is a key binding, a
// layer mapping (source layer to destination layer; a layer missing from it is
// deleted), and either the rewritten binding or the refusal message. Do not
// regenerate them to make a change pass.

interface Case {
  keyAction: KeyAction;
  mapping: [number, number][];
  path: string;
  expected: { ok: KeyAction } | { error: string };
}

const cases = JSON.parse(
  readFileSync(fileURLToPath(new URL("./remap.golden.json", import.meta.url)), "utf8"),
) as Case[];

describe("remapKeyAction: golden cases", () => {
  it("covers rewrites and refusals", () => {
    expect(cases.length).toBeGreaterThan(200);
    expect(cases.some((c) => "error" in c.expected)).toBe(true);
    expect(cases.some((c) => "ok" in c.expected)).toBe(true);
  });

  cases.forEach((testCase, index) => {
    it(`case ${index}: ${JSON.stringify(testCase.keyAction)}`, () => {
      const run = () => remapKeyAction(testCase.keyAction, new Map(testCase.mapping), testCase.path);
      if ("error" in testCase.expected) expect(run).toThrow(testCase.expected.error);
      else expect(run()).toEqual(testCase.expected.ok);
    });
  });
});
