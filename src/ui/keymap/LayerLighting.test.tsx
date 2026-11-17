import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderInWorkbench, testWorkbench, type TestWorkbenchParts } from "../../test/workbench";
import { withStatusLight } from "../../model/lighting/status-light";
import type { Selection } from "../../model/workbench-state";
import type { LightingSceneCell } from "../../vendor/rynk-wasm/rynk_wasm";
import { WorkbenchContext } from "../state";

import { LayerLighting } from "./LayerLighting";
import { lightView } from "./lightView";
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

describe("several keys selected", () => {
  const draw = (selection: Selection) =>
    renderInWorkbench(<LayerLighting ledId={4} />, {
      bundle: {
        sceneStatus: { capacity: 100 },
        model: { keys: [{ row: 0, col: 0, ledId: 4 }, { row: 0, col: 1, ledId: 5 }, { row: 0, col: 2 }] },
      },
      state: { uiLayer: 0, layerMetadata: null, compiledScenes, scenes: [], layerDrafts: {}, selection },
    });

  it("says how many, how many cannot be lit, that their lights differ, and offers to clear the selection", () => {
    const html = draw({ type: "key", row: 0, col: 0, more: [{ row: 0, col: 1 }, { row: 0, col: 2 }] });
    expect(html).toContain("3 keys selected");
    expect(html).toContain("1 without an LED");
    // LED 4 has the firmware's colour, LED 5 shows the layer below.
    expect(html).toContain("their lights differ");
    expect(html).toContain("Clear selection");
  });

  it("says nothing of a selection for one key", () => {
    const html = draw({ type: "key", row: 0, col: 0 });
    expect(html).not.toContain("selected");
    expect(html).not.toContain("Clear selection");
  });

  it("rings every selected key on the canvas, and names the selection on each", async () => {
    const session = await mockProvider(glove80Board).connect();
    try {
      const bundle = await openBundle(session);
      const [a, b, c] = bundle.model.keys;
      const selection: Selection = { type: "key", row: c.row, col: c.col, more: [a, b].map(({ row, col }) => ({ row, col })) };
      const html = renderInWorkbench(<KeymapCenter />, { bundle, state: { ...initialWorkbenchState(bundle), selection } });
      // The thin ring of a key selected with others; the editor's key keeps the one ring it always had.
      expect(html.match(/stroke-opacity="0.9"/g)).toHaveLength(2);
      expect(html.match(/Selected with 2 more\./g)).toHaveLength(3);
    } finally {
      await session.close();
    }
  });
});

describe("clearing the layer's lights", () => {
  const draw = (state: TestWorkbenchParts["state"]) =>
    renderInWorkbench(<LayerLighting ledId={4} />, {
      bundle: { sceneStatus: { capacity: 100 }, runtimeConditionalStatus: { capacity: 32 } },
      state: { uiLayer: 0, layerMetadata: [{ occupied: true, name: "Base" }], compiledScenes, scenes: [], layerDrafts: {}, ...state },
    });
  const button = (html: string) => /<button[^>]*>Clear Base&#x27;s lights…<\/button>/.exec(html)?.[0];

  it("is greyed out, saying why, while only the firmware lights the layer", () => {
    expect(button(draw({}))).toContain('aria-disabled="true"');
    expect(button(draw({}))).toContain('title="No key has a light of its own on Base"');
    // Another layer's lights are not this layer's.
    expect(button(draw({ scenes: [{ layer: 1, led_id: 5, effect: compiledScenes[0].effect }] }))).toContain('aria-disabled="true"');
  });

  it("is offered for a stored colour and for a key's status light", () => {
    expect(button(draw({ scenes: [{ layer: 0, led_id: 5, effect: compiledScenes[0].effect }] }))).not.toContain('aria-disabled="true"');
    const usb = withStatusLight([], 0, 6, { kind: "usb" });
    expect(button(draw({ runtimeConditionalScenes: usb, runtimeConditionalDraft: usb }))).not.toContain('aria-disabled="true"');
  });
});

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

describe("try out (not saved)", () => {
  const lighting = { revision: 1, output_enabled: true, output_brightness: 200, background: { enabled: false, hue: 0, saturation: 0, value: 0, speed: 0, mode: "Solid" as const }, overlay_len: 0 };
  const draw = (bundle: TestWorkbenchParts["bundle"]) =>
    renderInWorkbench(<LayerLighting ledId={4} />, {
      bundle: { sceneStatus: { capacity: 100 }, runtimeConditionalStatus: { capacity: 32 }, lightingState: lighting, ...bundle },
      state: { uiLayer: 0, layerMetadata: [{ occupied: true, name: "Base" }], compiledScenes, scenes: [], layerDrafts: {}, lightingState: lighting },
    });
  const keyboard = { session: { kind: "webhid" as const }, overlayReadSupported: true };
  const choice = (html: string, title: string) => new RegExp(`<button[^>]*role="radio"[^>]*>(?:(?!</button>).)*${title}`).exec(html)?.[0] ?? "";

  it("is offered for a connected keyboard with an overlay, never without one or in a file", () => {
    expect(draw(keyboard)).toContain("Try out (not saved)");
    expect(draw({ ...keyboard, overlayReadSupported: false })).not.toContain("Try out (not saved)");
    expect(draw({ ...keyboard, session: { kind: "offline" } })).not.toContain("Try out (not saved)");
  });

  it("while on, says the lights are not saved and offers only a colour or none", () => {
    lightView.setTryingOut(true);
    try {
      const html = draw(keyboard);
      expect(html).toContain("Not saved: these lights vanish when the keyboard restarts.");
      expect(choice(html, "Layer below")).toContain('disabled=""');
      expect(choice(html, "Status light")).toContain('disabled=""');
      expect(choice(html, "Color")).not.toContain('disabled=""');
      // The tab edits the key's try-out light, which it has none of yet.
      expect(choice(html, "Off")).toContain('aria-checked="true"');
      expect(html).not.toContain("Clear Base&#x27;s lights");
    } finally {
      lightView.setTryingOut(false);
    }
  });
});
