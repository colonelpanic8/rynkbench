import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchContext, type WorkbenchContextValue } from "../state";
import { StatusPresetsPanel } from "./StatusPresetsPanel";
import { CONNECTION_KEY_PICK } from "./keyPick";
import { GLOVE80_BOARD_KEYS, GLOVE80_COLS, GLOVE80_GRID } from "../../model/boards/glove80";

const keys = [4, 5, 6].map((ledId, index) => ({
  row: index,
  col: 0,
  address: `LH${index + 1}`,
  label: "Esc",
  ledId,
  shape: { rect: { x: 0, y: index * 20 } },
}));

function render(selection: number[], pick = null as typeof CONNECTION_KEY_PICK | null) {
  const value = {
    bundle: {
      caps: { num_cols: 1, num_layers: 3, num_split_peripherals: 1, num_ble_profiles: 3 },
      model: { name: "test", keys, zones: [] },
      runtimeConditionalStatus: { capacity: 32 },
      lightingCaps: null,
    },
    state: {
      layers: [[], [], []],
      currentLayer: 0,
      lightingSelection: selection,
      lightingOutputMode: null,
      lightingControls: { wake_layers: 0 },
      layerMetadata: null,
      runtimeConditionalDraft: [],
      lightingBusy: false,
      lightingExtension: null,
      batchMode: false,
      pending: {},
      keyEditHistorySuspended: false,
      pointingBusy: false,
      batchBusy: false,
    },
    dispatch: () => {},
  } as unknown as WorkbenchContextValue;
  return renderToStaticMarkup(
    <WorkbenchContext value={value}>
      <StatusPresetsPanel pick={pick} onPick={() => {}} />
    </WorkbenchContext>,
  );
}

describe("status preset key choice", () => {
  it("offers to choose on the board when nothing is selected", () => {
    const html = render([]);
    expect(html).toContain("None chosen yet");
    expect(html).toContain("Choose on board");
    expect(html).toContain("Choose a key first");
  });

  it("prompts for a board click while a pick is active", () => {
    const html = render([], CONNECTION_KEY_PICK);
    expect(html).toContain("Click a key on the board…");
    expect(html).toContain("Done");
  });

  it("names the chosen key and explains oversized choices", () => {
    expect(render([4])).toContain("Configure LH1");
    const html = render([4, 5]);
    expect(html).toContain("2 keys are chosen; a connection key needs exactly one.");
    expect(html).toContain("2 chosen; a bar needs 3–8 keys.");
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

  function renderGlove80(name: string) {
    const value = {
      bundle: {
        caps: { num_cols: GLOVE80_COLS, num_layers: 6, num_split_peripherals: 1, num_ble_profiles: 4 },
        model: { name, keys: glove80Keys, zones: [] },
        runtimeConditionalStatus: { capacity: 100 },
        sceneStatus: { capacity: 100 },
        lightingCaps: { features: 1 << 15 },
      },
      state: {
        layers: Array.from({ length: 6 }, () => []),
        currentLayer: 0,
        lightingSelection: [],
        lightingOutputMode: null,
        lightingControls: { wake_layers: 0 },
        layerMetadata: null,
        runtimeConditionalDraft: [],
        lightingBusy: false,
        lightingExtension: null,
        batchMode: false,
        pending: {},
        keyEditHistorySuspended: false,
        pointingBusy: false,
        batchBusy: false,
      },
      dispatch: () => {},
    } as unknown as WorkbenchContextValue;
    return renderToStaticMarkup(
      <WorkbenchContext value={value}>
        <StatusPresetsPanel pick={null} onPick={() => {}} />
      </WorkbenchContext>,
    );
  }

  it("offers the stock Magic layer template only on a Glove80 with the stock LED map", () => {
    const html = renderGlove80("Glove80");
    expect(html).toContain("Install complete Glove80 setup on Layer 2");
    expect(html).toContain("Install stock Magic layer on Layer 2");
    expect(html).toContain("Bluetooth profiles 1–4");
    expect(renderGlove80("Go60")).not.toContain("stock Magic layer");
  });
});
