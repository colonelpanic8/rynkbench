import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchContext } from "../state";
import type { WorkbenchContextValue, WorkbenchState } from "../state";
import { KeymapInspector } from "./KeymapMode";

const UNSUPPORTED = "does not expose runtime pointing configuration";

function markup(state: Partial<WorkbenchState>): string {
  const value = {
    bundle: {
      model: { pointingDevices: [{ id: 0, label: "Left trackpad" }] },
    },
    state: {
      selection: { type: "pointing", id: 0 },
      uiLayer: 0,
      layerMetadata: null,
      pointingConfig: null,
      pointingDraft: null,
      pointingBusy: false,
      pointingError: null,
      ...state,
    },
    dispatch: () => {},
    io: { reloadPointingConfig: async () => ({ ok: true as const }) },
  } as unknown as WorkbenchContextValue;

  return renderToStaticMarkup(
    <WorkbenchContext value={value}>
      <KeymapInspector />
    </WorkbenchContext>,
  );
}

describe("trackpad inspector without a pointing config", () => {
  it("reports the read failure and offers a retry", () => {
    const html = markup({ pointingError: "io error: Other" });

    expect(html).toContain("io error: Other");
    expect(html).toContain("Retry read");
    expect(html).not.toContain(UNSUPPORTED);
  });

  it("blames the firmware only when the read did not fail", () => {
    const html = markup({});

    expect(html).toContain(UNSUPPORTED);
    expect(html).not.toContain("Retry read");
  });
});
