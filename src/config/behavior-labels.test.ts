import { describe, expect, it } from "vitest";
import { noLabels, withLabel } from "../model/behavior-labels";
import { labelsFromToml, withTomlLabels } from "./behavior-labels";

const RENDERED = `default_layer = 0

[[morse]]
name = "morse 0"
tap = "A"

[[morse]]
name = "morse 1"
hold = "B"

[[macro]]
name = "macro 0"

[[macro.operations]]
operation = "tap"
keycode = "H"

[[fork]]
name = "fork 0"
trigger = "Dot"
`;

describe("labels in a TOML file", () => {
  it("writes names and descriptions into their tables and reads them back", () => {
    let labels = withLabel(noLabels(), "morse", 1, { name: 'Home "row"', description: "thumb hold" });
    labels = withLabel(labels, "macros", 0, { name: "Hi", description: "" });
    const text = withTomlLabels(RENDERED, labels);
    expect(text).toContain('[[morse]]\n# thumb hold\nname = "Home \\"row\\""\nhold = "B"');
    expect(text).toContain('[[macro]]\nname = "Hi"\n\n[[macro.operations]]');
    expect(text).toContain('name = "morse 0"'); // no label: the renderer's own name stays
    expect(labelsFromToml(text)).toEqual(labels);
  });

  it("takes the names the renderer made up for no name, and writing twice changes nothing more", () => {
    expect(labelsFromToml(RENDERED)).toEqual(noLabels());
    const labels = withLabel(noLabels(), "forks", 0, { name: "Shift dot", description: "colon" });
    const once = withTomlLabels(RENDERED, labels);
    expect(withTomlLabels(once, labels)).toBe(once);
  });

  it("reads a name a person wrote by hand", () => {
    expect(labelsFromToml('[[fork]]\nname = "Comma"\ntrigger = "Comma"\n').forks).toEqual({ 0: { name: "Comma", description: "" } });
  });
});
