import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { testWorkbench } from "../../test/workbench";
import type { LightingSceneCell } from "../../vendor/rynk-wasm/rynk_wasm";
import { WorkbenchContext } from "../state";

import { LayerLighting } from "./LayerLighting";
import { KeymapCenter } from "./KeymapCenter";
import { openBundle } from "../bundle";
import { initialWorkbenchState } from "../../workbench";
import { mockProvider } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import { effectColor } from "../lighting/decor";

const SWATCH = "size-3 rounded-sm border border-cap-edge";

const compiledScenes: LightingSceneCell[] = [
  { layer: 0, led_id: 4, effect: { Solid: { color: { r: 0, g: 200, b: 0 } } } },
];

function markup(ledId: number, writable = true): string {
  const value = testWorkbench({
    bundle: { sceneStatus: writable ? { capacity: 100 } : null },
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
  });

  return renderToStaticMarkup(
    <WorkbenchContext value={value}>
      <LayerLighting ledId={ledId} />
    </WorkbenchContext>,
  );
}

describe("layer lighting summary", () => {
  // The runtime draft is empty here: reading it alone would report the key as
  // unlit and leave no way to mask the firmware default.
  it("reads a key lit only by a compiled firmware cell as its colour", () => {
    const html = markup(4);
    expect(html).toMatch(/aria-checked="true"[^>]*>(?:(?!aria-checked).)*?Color</);
    expect(html).toContain("Paint");
  });

  it("reads a key with no cell on this layer as Layer below", () => {
    expect(markup(5)).toMatch(/aria-checked="true"[^>]*>(?:(?!aria-checked).)*?Layer below/);
  });

  it("shows compiled lighting without offering writes when the runtime table is unsupported", () => {
    const html = markup(4, false);
    expect(html).toContain(SWATCH);
    expect(html).toContain("firmware default");
    expect(html).toContain("viewing only");
    expect(html).not.toContain("<button");
  });

  it("lights the keymap canvas when firmware has compiled cells but no runtime table", async () => {
    const session = await mockProvider({
      ...glove80Board, sceneCapacity: 0, seedScenes: [], initialDefaultLayer: 0,
      compiledScenes,
    }).connect();
    try {
      const bundle = await openBundle(session);
      const value = testWorkbench({ bundle, state: initialWorkbenchState(bundle) });
      const html = renderToStaticMarkup(
        <WorkbenchContext value={value}><KeymapCenter /></WorkbenchContext>,
      );
      expect(bundle.sceneStatus).toBeNull();
      expect(html).toContain(`fill="${effectColor(compiledScenes[0].effect)}"`);
      expect(html).toContain('aria-label="Lights"');
    } finally {
      await session.close();
    }
  });
});
