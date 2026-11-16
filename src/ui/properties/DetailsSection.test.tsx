import { describe, expect, it } from "vitest";
import { renderInWorkbench } from "../../test/workbench";
import { DetailsSection } from "./DetailsSection";

const caps = { num_layers: 12, max_combos: 32, max_morse: 16, max_macros: 0, max_forks: 8, ble_enabled: true, num_ble_profiles: 4, is_split: true, num_split_peripherals: 1 };

describe("Layout properties → Details", () => {
  it("shows the name, the keyboard with its conversion, and what it holds", () => {
    const html = renderInWorkbench(<DetailsSection />, { bundle: { caps, model: { name: "Glove80" } } }, {
      workspaceName: "my-layout.toml",
      migrationTarget: "Go60",
    });
    expect(html).toContain('value="my-layout.toml"');
    expect(html).toContain("Convert to Go60…");
    for (const fact of ["Layers", "12", "Bluetooth profiles", "Halves"]) expect(html).toContain(fact);
    expect(html).not.toContain("Macros");
  });

  it("offers no conversion for a board without one", () => {
    const html = renderInWorkbench(<DetailsSection />, { bundle: { caps, model: { name: "Plain" } } }, {
      workspaceName: "plain",
      migrationTarget: null,
    });
    expect(html).not.toContain("Convert to");
  });
});
