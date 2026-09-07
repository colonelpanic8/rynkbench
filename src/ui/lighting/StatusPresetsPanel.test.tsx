import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchContext, type WorkbenchContextValue } from "../state";
import { StatusPresetsPanel } from "./StatusPresetsPanel";
import { CONNECTION_KEY_PICK } from "./keyPick";

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
    expect(html).toContain("2 keys are chosen; a lighting control key needs exactly one.");
    expect(html).toContain("2 chosen; a bar needs 3–8 keys.");
  });
});
