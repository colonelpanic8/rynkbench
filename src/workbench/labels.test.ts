import { describe, expect, it } from "vitest";
import { noLabels, withLabel } from "../model/behavior-labels";
import { emptyMorse } from "../model/slots";
import type { KeyboardImage } from "../sync";
import { labelsFor } from "./labels";

describe("labels against what the keyboard holds", () => {
  it("drops a label whose slot is empty, and one for a table the keyboard lacks", () => {
    const filled = { ...emptyMorse(), actions: [[2, "No"]] } as KeyboardImage["morse"][number];
    const image = { morse: [filled, emptyMorse()], forks: [] } as unknown as KeyboardImage;
    const labels = withLabel(
      withLabel(withLabel(noLabels(), "morse", 0, { name: "kept", description: "" }), "morse", 1, { name: "gone", description: "" }),
      "macros",
      0,
      { name: "no macros", description: "" },
    );
    expect(labelsFor(labels, image)).toEqual(withLabel(noLabels(), "morse", 0, { name: "kept", description: "" }));
  });
});
