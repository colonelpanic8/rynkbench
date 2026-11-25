import { describe, expect, it } from "vitest";
import type { KeyAction, Morse } from "../../model/action-types";
import { emptyMorse } from "../../model/slots";
import { noLabels, withLabel } from "../../model/behavior-labels";
import { renderInWorkbench } from "../../test/workbench";
import { AllBehaviors } from "./AllBehaviors";

const tap = (code: string): Morse => ({ ...emptyMorse(), actions: [[2, { Key: { Hid: code } } as Morse["actions"][number][1]]] });

/** Two tap patterns: the first on a key, the second nowhere and named. */
const parts = {
  bundle: { caps: { num_cols: 2, max_morses: 3, max_patterns_per_key: 4 } },
  state: {
    layers: [[{ Morse: 0 } as KeyAction, "No" as KeyAction]],
    morse: [tap("A"), tap("B"), emptyMorse()],
    labels: withLabel(noLabels(), "morse", 1, { name: "Spare", description: "for later" }),
  },
};

describe("All your behaviors", () => {
  it("lists every behavior with how it is used, its name and description", () => {
    const html = renderInWorkbench(<AllBehaviors />, parts);
    for (const text of ["Everything", "Not used", "In use", "Morse 0", "Spare", "for later", "1×", "not used", "Select all not used (1)", "Delete 0 not used"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("Morse 2");
  });

  it("says when there are none", () => {
    const html = renderInWorkbench(<AllBehaviors />, { bundle: parts.bundle, state: { morse: [emptyMorse()] } });
    expect(html).toContain("You haven&#x27;t created any behaviors yet.");
  });
});
