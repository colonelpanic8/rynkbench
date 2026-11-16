import { describe, expect, it } from "vitest";
import type { KeyAction } from "../../model/action-types";
import { mockProvider } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import type { RynkSession } from "../../session/types";
import { openBundle } from "../../ui/bundle";
import type { WorkbenchState } from "../../model/workbench-state";
import type { PatchEntry } from "../../sync";
import { initialWorkbenchState } from "../initial-state";
import { ioFeaturesFor, makeIo, type WorkbenchIo } from "../io";
import { makeWorkbenchReducer } from "../reducer";
import { emptyHistory, HISTORY_LIMIT, recordStep, travel, type History } from "./history";
import { draftOf } from "./want";

const key = (code: string) => ({ Single: { Key: { Hid: code } } }) as KeyAction;
const change = (offset: number, before: KeyAction, after: KeyAction): PatchEntry => ({ item: { kind: "key", layer: 0, offset }, before, after });
const RED = { Solid: { color: { r: 255, g: 0, b: 0 } } };

describe("the history (pure)", () => {
  it("keeps commits as patches, undoes with the inverse and redoes with the patch", () => {
    let history = recordStep(emptyHistory(), [change(0, "No", key("A"))]);
    history = recordStep(history, [change(1, "No", key("B"))]);
    const back = travel(history, "undo")!;
    expect(back.patch).toEqual([change(1, key("B"), "No")]);
    const again = travel(back.history, "redo")!;
    expect(again.patch).toEqual([change(1, "No", key("B"))]);
    // A new commit ends what could be redone.
    expect(recordStep(back.history, [change(2, "No", key("C"))]).future).toEqual([]);
  });

  it("joins a Paint stroke into one step, and a failed write into the step it undoes", () => {
    let history: History = { ...emptyHistory(), stroke: "open" };
    history = recordStep(history, [change(0, "No", key("A"))]);
    history = recordStep(history, [change(1, "No", key("A"))]);
    expect(history.past).toHaveLength(1);
    expect(history.past[0].changes).toHaveLength(2);
    // A write that failed and put both back leaves no step at all.
    history = recordStep({ ...history, stroke: "none" }, [change(0, key("A"), "No"), change(1, key("A"), "No")], true);
    expect(history.past).toEqual([]);
  });

  it("keeps at most a hundred steps, and none while a bulk write runs", () => {
    let history = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT + 5; i += 1) history = recordStep(history, [change(0, "No", key(`F${i}`))]);
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    expect(recordStep({ ...history, suspended: true }, [change(1, "No", key("A"))]).past).toHaveLength(HISTORY_LIMIT);
  });
});

/** A simulated Glove80 with the io the workbench uses, in Draft or in Live. */
async function workbench(draft: boolean, check: (h: { session: RynkSession; io: WorkbenchIo; state: () => WorkbenchState; dispatch: (a: Parameters<ReturnType<typeof makeWorkbenchReducer>>[1]) => void }) => Promise<void>) {
  const session = await mockProvider(glove80Board).connect();
  try {
    const bundle = await openBundle(session);
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: draft };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const dispatch = (action: Parameters<typeof reducer>[1]) => { state = reducer(state, action); };
    const io = makeIo(session, () => state, dispatch, { cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle) });
    await check({ session, io, state: () => state, dispatch });
  } finally {
    await session.close();
  }
}

describe("one history in Draft", () => {
  it("undoes keys, a renamed layer and a Discard, newest first", async () => {
    await workbench(true, async ({ io, state, dispatch }) => {
      const original = state().layers[0][0];
      await io.setKey(0, 0, 0, key("F13"));
      expect(await io.renameLayer(1, "Nav")).toEqual({ ok: true });
      dispatch({ type: "batchDiscard" });
      expect(draftOf(state()).changes).toEqual([]);

      expect(await io.travel("undo")).toEqual({ ok: true }); // the Discard
      expect(state().layers[0][0]).toEqual(key("F13"));
      expect(state().layerMetadata![1].name).toBe("Nav");
      await io.travel("undo"); // the name
      expect(state().layerMetadata![1].name).not.toBe("Nav");
      await io.travel("undo"); // the key
      expect(state().layers[0][0]).toEqual(original);
      expect(draftOf(state()).changes).toEqual([]);
      await io.travel("redo");
      expect(state().layers[0][0]).toEqual(key("F13"));
    });
  });

  it("is left alone by Send", async () => {
    await workbench(true, async ({ io, state }) => {
      await io.setKey(0, 0, 0, key("F13"));
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect(state().history.past).toHaveLength(1);
    });
  });
});

describe("one history in Live", () => {
  it("undoes a key written at once and a layer's lighting in turn, and the keyboard follows", async () => {
    await workbench(false, async ({ session, io, state, dispatch }) => {
      const original = state().layers[0][0];
      await io.setKey(0, 0, 0, key("F13"));
      dispatch({ type: "historyStroke", open: true });
      dispatch({ type: "paint", cells: [{ led_id: 3, effect: RED, ttl_ms: undefined }], target: 1 });
      dispatch({ type: "paint", cells: [{ led_id: 4, effect: RED, ttl_ms: undefined }], target: 1 });
      dispatch({ type: "historyStroke", open: false });
      expect(state().history.past).toHaveLength(2);

      expect(await io.travel("undo")).toEqual({ ok: true }); // the whole stroke
      expect(Object.keys(state().layerDrafts[1] ?? {})).not.toContain("3");
      expect(draftOf(state()).changes).toEqual([]);

      expect(await io.travel("undo")).toEqual({ ok: true }); // the key, written back
      expect((await session.keymap.readAll())[0].actions[0]).toEqual(original);
      expect(draftOf(state()).changes).toEqual([]);

      expect(await io.travel("redo")).toEqual({ ok: true });
      expect((await session.keymap.readAll())[0].actions[0]).toEqual(key("F13"));
    });
  });

  it("drops the step of a write that failed", async () => {
    await workbench(false, async ({ session, io, state }) => {
      session.keymap.setKey = () => Promise.reject(new Error("flash busy"));
      expect(await io.setKey(0, 0, 0, key("F13"))).toEqual({ ok: false, message: "flash busy" });
      expect(state().history.past).toEqual([]);
    });
  });
});
