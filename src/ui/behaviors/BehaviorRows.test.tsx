import { describe, expect, it } from "vitest";
import type { KeyAction, MacroOp, Morse } from "../../model/action-types";
import { emptyMorse } from "../../model/slots";
import { noLabels, withLabel } from "../../model/behavior-labels";
import { renderInWorkbench } from "../../test/workbench";
import { BehaviorLibrary } from "./BehaviorLibrary";

const runs = (macro: number): Morse => ({ ...emptyMorse(), actions: [[2, { TriggerMacro: macro } as Morse["actions"][number][1]]] });

describe("the Behavior Library's rows", () => {
  it("show names, how each is used, and that only unused ones use a behavior", () => {
    const html = renderInWorkbench(<BehaviorLibrary kinds={["macros", "morse"]} />, {
      bundle: { caps: { num_cols: 2, max_morse: 2, max_patterns_per_key: 4, max_macros: 2, macro_space_size: 64, macros_writable: true } },
      state: {
        layers: [[{ Morse: 1 } as KeyAction, "No" as KeyAction]],
        morse: [runs(0), runs(1)],
        macroOps: [[{ Delay: 5 }], [{ Delay: 5 }]] as MacroOp[][],
        labels: withLabel(noLabels(), "macros", 0, { name: "Greeting", description: "says hi" }),
      },
    });
    for (const text of ["Greeting", "says hi", "only unused use it", "Macro 1", "1×", "Create macro", "All your behaviors"]) expect(html).toContain(text);
  });
});
