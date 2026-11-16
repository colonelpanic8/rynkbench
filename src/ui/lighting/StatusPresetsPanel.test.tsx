import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { testWorkbench } from "../../test/workbench";
import { WorkbenchContext } from "../state";
import { StatusPresetsPanel } from "./StatusPresetsPanel";
import { resolveBoardProfile } from "../../model/boards/profiles";
import type { DeviceInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import { GLOVE80_BOARD_KEYS, GLOVE80_COLS, GLOVE80_GRID } from "../../model/boards/glove80";

describe("status setups", () => {
  it("offer nothing on a board without a preset", () => {
    const value = testWorkbench({
      bundle: {
        caps: { num_cols: 1, num_layers: 3, num_split_peripherals: 1, num_ble_profiles: 3 },
        model: { name: "test", keys: [], zones: [] },
        runtimeConditionalStatus: { capacity: 32 },
        lightingCaps: null,
      },
      state: { layers: [[], [], []], currentLayer: 0, lightingOutputMode: null, lightingControls: { wake_layers: 0 }, layerMetadata: null },
    });
    expect(renderToStaticMarkup(<WorkbenchContext value={value}><StatusPresetsPanel /></WorkbenchContext>)).toBe("");
  });
});

describe("Glove80 presets", () => {
  const glove80Keys = GLOVE80_GRID.flatMap((logical, grid) => {
    if (logical === null) return [];
    const board = GLOVE80_BOARD_KEYS.get(logical)!;
    return [{
      row: Math.floor(grid / GLOVE80_COLS),
      col: grid % GLOVE80_COLS,
      ledId: board.led,
      shape: { rect: { x: board.x, y: board.y } },
      zoneIds: [],
    }];
  });

  function renderGlove80(name: string, features = (1 << 15) | (1 << 16)) {
    const value = testWorkbench({
      bundle: {
        boardProfile: resolveBoardProfile(
          { product_name: name, vendor_id: 0x16c0, product_id: 0x27db } as DeviceInfo,
          { num_rows: 6, num_cols: GLOVE80_COLS },
        ),
        caps: { num_cols: GLOVE80_COLS, num_layers: 6, num_split_peripherals: 1, num_ble_profiles: 4 },
        model: { name, keys: glove80Keys, zones: [] },
        runtimeConditionalStatus: { capacity: 100 },
        sceneStatus: { capacity: 100 },
        lightingCaps: { features },
      },
      state: {
        layers: Array.from({ length: 6 }, () => []),
        currentLayer: 0,
        lightingOutputMode: null,
        lightingControls: { wake_layers: 0 },
        layerMetadata: null,
        runtimeConditionalDraft: [],
        lightingBusy: false,
        lightingExtension: null,
        batchMode: false,
        pending: {},
        pointingBusy: false,
        batchBusy: false,
      },
      dispatch: () => {},
    });
    return renderToStaticMarkup(
      <WorkbenchContext value={value}>
        <StatusPresetsPanel />
      </WorkbenchContext>,
    );
  }

  it("keeps the cluster on older firmware while requiring an update for stock Magic", () => {
    const html = renderGlove80("Glove80", 1 << 15);
    expect(html).toContain("Install complete Glove80 setup");
    expect(html).not.toContain("Install stock Magic layer");
    expect(html).toContain("Update firmware to install the stock Magic layer");
  });

  // Boards built without the legacy conditional-scene endpoints advertise RULES
  // alone. Gating on the retired bit told users on current firmware to update it.
  // Connection and effects predicates ride the same tagged rule table, so RULES
  // alone must not be told to update firmware before installing status keys.
  it("installs connection status keys on firmware advertising only the rule table", () => {
    const html = renderGlove80("Glove80", 1 << 17);
    expect(html).not.toContain("Update firmware to install Bluetooth");
  });

  it("offers the stock Magic layer on firmware advertising only the rule table", () => {
    const html = renderGlove80("Glove80", 1 << 17);
    expect(html).toContain("Install stock Magic layer on Layer 2");
    expect(html).not.toContain("Update firmware to install the stock Magic layer");
  });

  it("offers the stock Magic layer template only on a Glove80 with the stock LED map", () => {
    const html = renderGlove80("Glove80");
    expect(html).toContain("Install complete Glove80 setup on Layer 2");
    expect(html).toContain("Install stock Magic layer on Layer 2");
    expect(html).toContain("Bluetooth profiles 1–4");
    expect(renderGlove80("Go60")).not.toContain("stock Magic layer");
    expect(renderGlove80("My Glove80 clone")).not.toContain("Glove80 Magic status cluster");
  });
});
