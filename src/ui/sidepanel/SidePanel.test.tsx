import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { testWorkbench } from "../../test/workbench";
import { WorkbenchContext } from "../state";
import { SidePanel } from "./SidePanel";

function panel(overrides: Record<string, unknown> = {}) {
  const workbench = testWorkbench({
    bundle: { caps: { num_layers: 4, num_cols: 2, max_combos: 8 }, session: { kind: "offline" } },
    state: {
      layerMetadata: [
        { occupied: true, name: "Base" },
        { occupied: true, name: "Lower" },
        { occupied: false },
        { occupied: false },
      ],
      uiLayer: 1,
      currentLayer: 0,
      defaultLayer: 0,
      layers: [],
      combos: [],
      morse: [],
      forks: [],
      layerBusy: false,
      layerError: null,
      behaviorOptions: null,
      ...overrides,
    },
    dispatch: () => {},
    io: {},
  });
  return renderToStaticMarkup(
    <WorkbenchContext value={workbench}>
      <SidePanel />
    </WorkbenchContext>,
  );
}

describe("side panel", () => {
  it("lists the occupied layers with their numbers and names", () => {
    const html = panel();
    expect(html).toContain("Base");
    expect(html).toContain("Lower");
    expect(html).toContain("Layer actions for Base");
    expect(html).toContain("Layer actions for Lower");
    expect(html).not.toContain("Layer actions for Layer 2");
  });

  it("marks the layer on the canvas and the one active on the keyboard", () => {
    const html = panel();
    expect(html).toMatch(/aria-current="true"[^>]*>.*?Lower/);
    expect(html).toContain("Active on the keyboard now");
    expect(html).toContain("The layer the keyboard starts on");
  });

  it("shows a layer error under the list", () => {
    expect(panel({ layerError: "Layer is still used" })).toContain("Layer is still used");
  });
});
