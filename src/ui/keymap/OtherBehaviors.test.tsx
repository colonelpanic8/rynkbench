import { describe, expect, it } from "vitest";
import { renderInWorkbench } from "../../test/workbench";
import type { MacroOp } from "../../model/action-types";
import { OtherBehaviors } from "./OtherBehaviors";

const macro = [{ Text: "hi" }] as unknown as MacroOp[];

describe("Other Behaviors", () => {
  it("lists your macros by the name you gave them, and the one-shot modifiers", () => {
    const html = renderInWorkbench(<OtherBehaviors onPick={() => {}} current={{ Single: { TriggerMacro: 0 } } as never} />, {
      bundle: { caps: { macro_space_size: 64 } },
      state: { macroOps: [macro], labels: { macros: { 0: { name: "Greeting", description: "" } }, morse: {}, forks: {}, profiles: {} } },
    });
    expect(html).toContain(">Greeting<");
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?>Greeting</);
    expect(html).toContain("One-shot Shift");
  });

  it("points to the Behavior Library when you have none of your own", () => {
    const html = renderInWorkbench(<OtherBehaviors onPick={() => {}} />, { state: { macroOps: [] } });
    expect(html).toContain("Behavior Library");
  });
});
