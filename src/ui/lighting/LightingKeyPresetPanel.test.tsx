import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchContext, type WorkbenchContextValue } from "../state";
import { LightingKeyPresetPanel } from "./LightingKeyPresetPanel";
import { replaceLightingKeyRules } from "./lightingKeyPresets";

function render(batchMode: boolean, current: unknown = "No") {
  const value = {
    bundle: {
      runtimeConditionalStatus: { capacity: 32 },
      lightingCaps: { features: 1 << 15 },
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
      keyEditHistorySuspended: false,
      pointingBusy: false,
      batchBusy: false,
      pending: {},
    },
    dispatch: () => {},
  } as unknown as WorkbenchContextValue;
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
    expect(html).toContain("wake setting");
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
