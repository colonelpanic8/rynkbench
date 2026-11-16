import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { testWorkbench } from "../../test/workbench";
import { WorkbenchContext } from "../state";
import { LightingKeyPresetPanel } from "./LightingKeyPresetPanel";
import { replaceLightingKeyRules } from "../../model/lighting/key-presets";

function render(batchMode: boolean, current: unknown = "No") {
  const value = testWorkbench({
    // Capabilities resolve from the connect bundle: extension effects present,
    // output-mode policy absent.
    bundle: {
      runtimeConditionalStatus: { capacity: 32 },
      lightingCaps: { features: 1 << 15 },
      lightingState: {},
      lightingExtension: { state: { value: 1 } },
      lightingOutputMode: null,
      sceneStatus: null,
      compiledSceneStatus: null,
      pointingConfig: null,
    },
    state: {
      batchMode,
      lightingOutputMode: null,
      lightingExtension: { state: { value: 1 } },
      lightingControls: { wake_layers: 1 << 2 },
      layerMetadata: null,
      runtimeConditionalDraft: batchMode ? [] : replaceLightingKeyRules([], {
        kind: "effects", layer: 1, row: 0, col: 0, led: 4,
      }),
      lightingBusy: false,
      pointingBusy: false,
      batchBusy: false,
      pending: {},
    },
    dispatch: () => {},
  });
  return renderToStaticMarkup(
    <WorkbenchContext value={value}>
      <LightingKeyPresetPanel
        layer={1}
        target={{ row: 0, col: 0, address: "LH1", label: "Esc", ledId: 4 } as never}
        current={current as never}
      />
    </WorkbenchContext>,
  );
}

describe("lighting key presets", () => {
  it("enables only the presets this firmware supports", () => {
    const html = render(false);
    expect(html).toMatch(/<button[^>]*>[^<]*<div[^>]*>Toggle RGB effects/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*<div[^>]*>Cycle lighting policy/);
    expect(html).toContain("let that layer wake them");
    expect(html).not.toContain("MoErgo");
  });

  it("marks the preset whose action and rules are on the key", () => {
    expect(render(false)).not.toContain("installed");
    expect(render(false, { Single: { Light: "RgbTog" } })).toContain("installed");
  });

  it("explains why batch mode blocks installs", () => {
    expect(render(true)).toContain("Turn batch mode off first");
  });
});
