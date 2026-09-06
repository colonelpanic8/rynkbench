import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LightingSceneCell } from "../../vendor/rynk-wasm/rynk_wasm";
import { WorkbenchContext } from "../state";
import type { WorkbenchContextValue } from "../state";
import { LayerLighting } from "./LayerLighting";

const SWATCH = "size-3 rounded-sm border border-cap-edge";

const compiledScenes: LightingSceneCell[] = [
  { layer: 0, led_id: 4, effect: { Solid: { color: { r: 0, g: 200, b: 0 } } } },
];

function markup(ledId: number): string {
  const value = {
    bundle: { sceneStatus: { capacity: 100 } },
    state: {
      uiLayer: 0,
      layerMetadata: null,
      compiledScenes,
      scenes: [],
      layerDrafts: {},
      lightingBusy: false,
      lightingError: null,
    },
    dispatch: () => {},
    io: {},
  } as unknown as WorkbenchContextValue;

  return renderToStaticMarkup(
    <WorkbenchContext value={value}>
      <LayerLighting ledId={ledId} />
    </WorkbenchContext>,
  );
}

describe("layer lighting summary", () => {
  // The runtime draft is empty here: reading it alone would report the key as
  // unlit and leave no way to mask the firmware default.
  it("shows a key lit only by a compiled firmware cell", () => {
    expect(markup(4)).toContain(SWATCH);
  });

  it("shows no swatch for a key with no cell on this layer", () => {
    expect(markup(5)).not.toContain(SWATCH);
  });
});
