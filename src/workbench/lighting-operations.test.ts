// The lighting operations as the workbench applies them (ADR 0019): what a
// change for several keys leaves in the draft, and that Undo takes it back whole.

import { describe, expect, it } from "vitest";
import { mockProvider } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { WorkbenchState } from "../model/workbench-state";
import { DEFAULT_TIMING } from "../model/lighting/effect";
import type { KeyLight } from "../model/lighting/key-light";
import { openBundle } from "../ui/bundle";
import { ledNodesOf } from "./apply";
import { draftOf } from "./draft/want";
import { initialWorkbenchState } from "./initial-state";
import { ioFeaturesFor, makeIo, type WorkbenchIo } from "./io";
import { lightingDraftFor } from "./lighting-drafts";
import { makeWorkbenchReducer } from "./reducer";

const RED = { r: 255, g: 0, b: 0 };
const red: KeyLight = { kind: "color", color: RED, effect: "Solid", timing: DEFAULT_TIMING };

/** A simulated Glove80 in Draft, with no lights stored. */
async function inDraft(check: (io: WorkbenchIo, state: () => WorkbenchState) => Promise<void>) {
  const session = await mockProvider({ ...glove80Board, seedScenes: [] }).connect();
  try {
    const bundle = await openBundle(session);
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: true };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const io = makeIo(session, () => state, (action) => { state = reducer(state, action); }, {
      cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle), ledNodes: ledNodesOf(bundle),
    });
    await check(io, () => state);
  } finally {
    await session.close();
  }
}

describe("a light for several keys", () => {
  it("is one change of the layer's lighting and one Undo step", async () => {
    await inDraft(async (io, state) => {
      expect(await io.apply("set_key_light", { layer: 1, leds: [3, 4, 5], light: red })).toEqual({ ok: true });
      expect(Object.keys(lightingDraftFor(state(), 1)).map(Number)).toEqual([3, 4, 5]);
      expect(draftOf(state()).changes.map((change) => change.item)).toEqual([{ kind: "lighting", layer: 1 }]);
      expect(state().history.past).toHaveLength(1);
      expect(await io.travel("undo")).toEqual({ ok: true });
      expect(lightingDraftFor(state(), 1)).toEqual({});
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("puts a status light for keys on both halves in the rules, each watching its own half", async () => {
    await inDraft(async (io, state) => {
      const battery: KeyLight = { kind: "battery", level: 40, below: RED, above: { r: 0, g: 255, b: 0 } };
      // LED 3 is on the left half, LED 43 on the right.
      expect(await io.apply("set_key_light", { layer: 1, leds: [3, 43], light: battery })).toEqual({ ok: true });
      const before = new Set(state().runtimeConditionalScenes);
      const nodes = state().runtimeConditionalDraft.filter((rule) => !before.has(rule)).map((rule) => [rule.cell.led_id, rule.cell.conditions.battery?.node]);
      expect(nodes).toEqual([[3, 0], [3, 0], [43, 1], [43, 1]]);
      expect(state().history.past).toHaveLength(1);
    });
  });
});
