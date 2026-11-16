import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "../../vendor/moergo-config-wasm/moergo_config_wasm";
import { initSync as initRynkSync } from "../../vendor/rynk-wasm/rynk_wasm";
import { parseDocument } from "../../config/document";
import { offlineGlove80Catalog, openOfflineGlove80 } from "../../session/offline/glove80";
import { renderInWorkbench } from "../../test/workbench";
import { openBundle } from "../bundle";
import { initialWorkbenchState } from "../../workbench";
import { BehaviorLibrary, LibraryEntry } from "./BehaviorLibrary";

beforeAll(() => {
  initSync({ module: readFileSync("src/vendor/moergo-config-wasm/moergo_config_wasm_bg.wasm") });
  initRynkSync({ module: readFileSync("src/vendor/rynk-wasm/rynk_wasm_bg.wasm") });
});

/** A real Glove80 layout (Moosy's test file): six macros, two morse entries, seven timing profiles. */
async function testLayout() {
  const { snapshot } = parseDocument(readFileSync("src/test/fixtures/glove80-rynkbench.toml", "utf8"), offlineGlove80Catalog());
  const session = openOfflineGlove80(snapshot);
  const bundle = await openBundle(session);
  return { session, bundle, state: initialWorkbenchState(bundle) };
}

describe("the Behavior Library on a real layout", () => {
  it("lists the macros with how often keys run them", async () => {
    const { session, bundle, state } = await testLayout();
    try {
      const html = renderInWorkbench(<BehaviorLibrary kinds={["macros", "morse", "profiles"]} />, { bundle, state });
      for (const name of ["Macro 0", "Macro 5", "All your behaviors", "Create macro"]) expect(html).toContain(name);
      expect(html).toContain("2×"); // Macro 0 runs from two Cursor-layer keys
    } finally {
      await session.close();
    }
  });

  it("says in the side panel how many behaviors nothing uses", async () => {
    const { session, bundle, state } = await testLayout();
    try {
      const html = renderInWorkbench(<LibraryEntry open={false} onToggle={() => {}} />, { bundle, state });
      expect(html).toContain("Behavior Library");
      expect(html).toMatch(/\d+ not used/); // the two morse entries no key is bound to
    } finally {
      await session.close();
    }
  });
});
