import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initSync } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import { parseDocument, renderDocument, snapshotFromState } from "../config/document";
import { openOfflineGlove80 } from "../session/offline/glove80";
import { openBundle } from "./bundle";
import { initialWorkbenchState, WorkbenchContext, type WorkbenchContextValue } from "./state";
import { useDocumentTransfer, type DocumentTransfer } from "./transfer-actions";

beforeAll(() => {
  initSync({ module: readFileSync("src/vendor/moergo-config-wasm/moergo_config_wasm_bg.wasm") });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const catalog = { effects: [], palettes: [], params: [] };

describe("offline exports", () => {
  it("keeps the imported advertising name after exporting through MoErgo JSON", async () => {
    const session = openOfflineGlove80();
    try {
      const bundle = await openBundle(session);
      const state = initialWorkbenchState(bundle);
      state.lightingState = null;
      state.lightingExtension = null;
      const source = renderDocument(snapshotFromState(state, "Travel {slot}"), catalog, "toml");
      bundle.workspace = { name: "travel.toml", sourceText: source, format: "toml" };
      const downloads: Blob[] = [];
      vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
        downloads.push(blob as Blob);
        return "blob:download";
      });
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      vi.stubGlobal("document", { createElement: () => ({ click: () => {} }) });
      let transfer!: DocumentTransfer;
      function Exporter() {
        transfer = useDocumentTransfer();
        return null;
      }
      renderToStaticMarkup(
        <WorkbenchContext value={{ bundle, state } as WorkbenchContextValue}>
          <Exporter />
        </WorkbenchContext>,
      );
      await transfer.exportFile("moergo-json");
      await transfer.exportFile("toml");
      expect(downloads).toHaveLength(2);
      const exported = parseDocument(await downloads[1].text(), catalog);
      expect(exported.snapshot.bluetooth_name).toBe("Travel {slot}");
    } finally {
      await session.close();
    }
  });
});
