import { describe, expect, it } from "vitest";
import type { Morse } from "../../../model/action-types";
import { emptyMorse } from "../../../model/slots";
import { noLabels, withLabel } from "../../../model/behavior-labels";
import { renderInWorkbench } from "../../../test/workbench";
import { MorseEditor } from "./MorseEditor";

const tapHold: Morse = { ...emptyMorse(), actions: [[2, { Key: { Hid: "A" } }], [3, { LayerOn: 1 }]] } as Morse;
const parts = {
  bundle: { caps: { num_cols: 2, num_layers: 2, max_morse: 2, max_patterns_per_key: 2 } },
  state: { morse: [tapHold, emptyMorse()], labels: withLabel(noLabels(), "morse", 0, { name: "Home", description: "" }) },
};

describe("the tap pattern editor", () => {
  it("shows the name, the timing card first, then a card per pattern, and Apply waits for a change", () => {
    const html = renderInWorkbench(<MorseEditor focus={0} onClose={() => {}} />, parts);
    expect(html).toContain('value="Home"');
    expect(html.indexOf("Timing")).toBeLessThan(html.indexOf("●"));
    expect(html).toContain("▬");
    expect(html).toMatch(/<button[^>]*aria-disabled="true"[^>]*title="Nothing changed"[^>]*>Apply/);
    // Both patterns fit: no more can be added.
    expect(html).toMatch(/aria-disabled="true"[^>]*title="At most 2 patterns fit"/);
  });

  it("starts a new one with a tap to fill in, in the app's voice", () => {
    const html = renderInWorkbench(<MorseEditor focus="new" onClose={() => {}} />, parts);
    expect(html).toContain("New morse");
    expect(html).toContain("● does nothing yet");
  });
});
