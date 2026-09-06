import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchContext, type WorkbenchContextValue } from "../state";
import { FirmwareRulesPanel } from "./FirmwareRulesPanel";

describe("firmware rule legends", () => {
  it("uses the selected layer's binding instead of the default or stock legend", () => {
    const value = {
      bundle: {
        caps: { num_cols: 1, num_layers: 2 },
        model: { keys: [{ row: 0, col: 0, address: "LH1", label: "Esc", ledId: 4 }] },
      },
      state: {
        layers: [[{ Single: { Key: { Hid: "A" } } }], [{ Single: { Key: { Hid: "B" } } }]],
        lightingTarget: 0,
        activeLayers: [1],
        defaultLayer: 1,
        compiledScenes: [{ layer: 0, led_id: 4, effect: { Solid: { color: { r: 255, g: 0, b: 0 } } } }],
        conditionalScenes: [],
        battery: "Unavailable",
        peripheralBattery: "Unavailable",
        lightingOutputMode: null,
        lightingControls: { wake_layers: 0 },
        layerMetadata: null,
      },
    } as unknown as WorkbenchContextValue;

    const html = renderToStaticMarkup(
      <WorkbenchContext value={value}><FirmwareRulesPanel /></WorkbenchContext>,
    );

    expect(html).toContain("LH1 · A");
    expect(html).not.toContain("LH1 · B");
    expect(html).not.toContain("LH1 · Esc");
  });
});
