import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeUsage, type UsageInput, type UsageReport } from "./usage";
import { hidStep, type SendKind } from "../model/macros";
import type { HidKeyCode } from "../model/action-types";

interface GoldenCase {
  name: string;
  input: unknown;
  expected: UsageReport;
}

// Read as text rather than imported: the file is large, and an import would
// make the type checker infer a type for all of it.
const golden = JSON.parse(
  readFileSync(fileURLToPath(new URL("./usage.golden.json", import.meta.url)), "utf8"),
) as GoldenCase[];

// Golden outputs of the usage analysis, produced by the implementation that
// walked the keymap by hand, before it was ported onto the reference graph
// (src/domain). Each case is an input and the exact report that implementation
// gave. Do not regenerate these to make a change pass: a difference is a
// change in what the report says.
//
// The cases hold each macro as its decoded steps, in the shape steps had then
// (a key step as `{ kind, code }`); the decoder is replaced by one that reads
// them in today's shape. Macro previews are compared as empty.

type OldStep = { kind: SendKind; code: HidKeyCode };
const fakeDecode = ((macros: OldStep[][]) => macros.map((steps) => ({ steps: steps.map((step) => hidStep(step.kind, step.code)) }))) as never;

/** The report as the earlier implementation gave it: without macro previews and
 *  without the structured sites added since (checked separately below). */
function asBefore(report: UsageReport): unknown {
  return {
    ...report,
    layers: report.layers.map(({ activatorSites: _sites, ...layer }) => layer),
    morse: report.morse.map(({ refSites: _sites, ...slot }) => slot),
    macros: report.macros.map(({ refSites: _sites, ...macro }) => ({ ...macro, preview: "" })),
  };
}

describe("usage analysis: golden cases", () => {
  it("has cases that exercise the report", () => {
    expect(golden.length).toBeGreaterThan(50);
  });

  for (const testCase of golden) {
    it(testCase.name, () => {
      const report = analyzeUsage(testCase.input as UsageInput, fakeDecode);
      expect(asBefore(report)).toEqual(testCase.expected);

      // The structured sites say the same as the plain ones.
      for (const layer of report.layers) expect(layer.activatorSites.map((s) => s.label)).toEqual(layer.activators);
      for (const slot of [...report.morse, ...report.macros]) expect(slot.refSites.map((s) => s.label)).toEqual(slot.refs);
    });
  }
});
