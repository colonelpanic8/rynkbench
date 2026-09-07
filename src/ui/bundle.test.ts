import { describe, expect, it, vi } from "vitest";
import { exportDocument } from "../config/transfer";
import { mockProvider } from "../session/mock/board";
import { ortho60Board } from "../session/mock/ortho60";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import { unsupported } from "../session/unsupported";
import { openBundle } from "./bundle";
import { initialWorkbenchState, type ConnectedBundle } from "./state";

async function readBundle(
  setup: (session: RynkSession) => void,
  check: (bundle: ConnectedBundle) => void,
) {
  const session = await mockProvider(glove80Board).connect();
  try {
    setup(session);
    check(await openBundle(session));
  } finally {
    await session.close();
  }
}

const lightingReads = [
  ["lighting overlay", (s: RynkSession) => vi.spyOn(s.lighting, "readOverlay")],
  ["compiled lighting scene status", (s: RynkSession) => vi.spyOn(s.lighting.scenes, "compiledStatus")],
  ["compiled lighting scenes", (s: RynkSession) => vi.spyOn(s.lighting.scenes, "readCompiledScenes")],
  ["compiled conditional lighting status", (s: RynkSession) => vi.spyOn(s.lighting.scenes, "conditionalStatus")],
  ["compiled conditional lighting scenes", (s: RynkSession) => vi.spyOn(s.lighting.scenes, "readConditionalScenes")],
] as const;

describe("connect-time snapshot", () => {
  it.each(lightingReads)("retains a failed %s read and prevents lossy export", async (label, spy) => {
    await readBundle(
      (session) => { spy(session).mockRejectedValue(new Error("read interrupted")); },
      (bundle) => {
        expect(bundle.incompleteReads).toContain(`${label}: read interrupted`);
        expect(bundle.overlayReadSupported).toBe(true);
        expect(() => exportDocument(
          initialWorkbenchState(bundle), { effects: [], palettes: [], params: [] },
          "toml", undefined, bundle.incompleteReads,
        )).toThrow(`${label}: read interrupted`);
      },
    );
  });

  it("accepts unsupported discovery without calling the absent table readers", async () => {
    await readBundle(
      (session) => {
        vi.spyOn(session.lighting, "readOverlay").mockRejectedValue(unsupported("overlay readback"));
        vi.spyOn(session.lighting.scenes, "compiledStatus").mockRejectedValue(unsupported("compiled scenes"));
        vi.spyOn(session.lighting.scenes, "conditionalStatus").mockRejectedValue(unsupported("conditional scenes"));
        vi.spyOn(session.lighting.scenes, "readCompiledScenes").mockRejectedValue(new Error("unexpected table read"));
        vi.spyOn(session.lighting.scenes, "readConditionalScenes").mockRejectedValue(new Error("unexpected table read"));
      },
      (bundle) => {
        expect(bundle.incompleteReads).toEqual([]);
        expect(bundle.overlayReadSupported).toBe(false);
        expect(bundle.compiledSceneStatus).toBeNull();
      },
    );
  });

  it("retains good state and capabilities when topology alone fails", async () => {
    await readBundle(
      (session) => { vi.spyOn(session.lighting, "topology").mockRejectedValue(new Error("bad page")); },
      (bundle) => {
        expect(bundle.lightingState).not.toBeNull();
        expect(bundle.lightingCaps).not.toBeNull();
        expect(bundle.incompleteReads).toEqual(["lighting topology: bad page"]);
      },
    );
  });
});

describe("board profile resolution at connect time", () => {
  it("exposes known-board tools together with enrichment", async () => {
    await readBundle(() => {}, bundle => {
      expect(bundle.boardProfile?.id).toBe("glove80");
      expect(bundle.model.keys.some(key => key.address === "LH-C1R3")).toBe(true);
    });
  });

  it("keeps generic capabilities and geometry without adding a board profile", async () => {
    const session = await mockProvider(ortho60Board).connect();
    try {
      const bundle = await openBundle(session);
      expect(bundle.boardProfile).toBeUndefined();
      expect(bundle.caps.num_cols).toBe(12);
      expect(bundle.model.keys).toHaveLength(60);
      expect(bundle.model.keys.every(key => key.address === undefined)).toBe(true);
      expect(bundle.lightingCaps).not.toBeNull();
    } finally {
      await session.close();
    }
  });

  it("does not enrich a same-shaped device from its product name alone", async () => {
    await readBundle(session => {
      vi.spyOn(session.device, "info").mockResolvedValue({ ...glove80Board.info, vendor_id: 123 });
    }, bundle => {
      expect(bundle.boardProfile).toBeUndefined();
      expect(bundle.model.keys.every(key => key.address === undefined)).toBe(true);
      expect(bundle.layers[0]).toHaveLength(84);
    });
  });
});
