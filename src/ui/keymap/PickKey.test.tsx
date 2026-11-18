import { describe, expect, it } from "vitest";
import type { MacroOp } from "../../model/action-types";
import { renderInWorkbench } from "../../test/workbench";
import { PickKey, PickKeycode } from "./PickKey";

const chips = (html: string) => (html.match(/aria-pressed=/g) ?? []).length;

describe("Pick Key", () => {
  it("offers modifier chips and counts the keys under All keys", () => {
    const html = renderInWorkbench(<PickKey onPick={() => {}} />);
    expect(chips(html)).toBe(4);
    expect(html).toMatch(/All keys: \d+ more/);
    expect(html).toContain("Same as layer below");
  });

  it("is the same picker, smaller, for a behavior's slot: no Transparent", () => {
    const html = renderInWorkbench(<PickKey compact scope="slot" onPick={() => {}} />);
    expect(chips(html)).toBe(4);
    expect(html).not.toContain("Same as layer below");
    expect(html).toContain("max-h-80");
  });

  it("offers a plain key with no modifiers and no characters that need them", () => {
    const html = renderInWorkbench(<PickKeycode onPick={() => {}} />);
    expect(chips(html)).toBe(0);
    expect(html).not.toContain(">$<");
    expect(html).toContain(">A<");
  });

  it("lists layers and your behaviors above the keys when the caller turns them on, without what it does not take", () => {
    const state = {
      layerMetadata: [{ occupied: true, name: "Base" }, { occupied: true, name: "Lower" }],
      macroOps: [[{ Char: 104 }], [{ Char: 105 }]] as MacroOp[][],
    };
    const allow = (pick: unknown) => !(typeof pick === "object" && pick !== null && "TriggerMacro" in pick && pick.TriggerMacro === 1);
    const html = renderInWorkbench(<PickKey compact scope="slot" offer={{ layers: true, behaviors: true }} allow={allow} onPick={() => {}} />, { state });
    for (const text of ["Layers", "While held", "Lower", "Your behaviors", "Macro 0", ">A<"]) expect(html).toContain(text);
    expect(html).not.toContain("Macro 1");
    const plain = renderInWorkbench(<PickKey compact scope="slot" onPick={() => {}} />, { state });
    expect(plain).not.toContain("Your behaviors");
    expect(plain).not.toContain("While held");
  });
});
