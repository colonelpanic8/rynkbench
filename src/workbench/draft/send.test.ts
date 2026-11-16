import { describe, expect, it, vi } from "vitest";
import { mockProvider, storedKeysOf } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import type { RynkSession } from "../../session/types";
import type { KeyAction } from "../../model/action-types";
import { openBundle } from "../../ui/bundle";
import { initialWorkbenchState } from "../initial-state";
import { ioFeaturesFor, makeIo } from "../io";
import { makeWorkbenchReducer } from "../reducer";
import type { WorkbenchAction, WorkbenchState } from "../../model/workbench-state";
import { draftOf } from "./want";

const key = (code: string) => ({ Single: { Key: { Hid: code } } }) as KeyAction;

interface Harness {
  session: RynkSession;
  io: ReturnType<typeof makeIo>;
  state: () => WorkbenchState;
  dispatch: (action: WorkbenchAction) => void;
  /** Resolves once an action of this type has been dispatched. */
  seen: (type: WorkbenchAction["type"]) => Promise<void>;
}

/** A simulated Glove80 in Draft (or Live), with the io the workbench uses. */
async function inDraft(check: (h: Harness) => Promise<void>, draft = true, board = glove80Board) {
  const session = await mockProvider(board).connect();
  try {
    const bundle = await openBundle(session);
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: draft };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const types: string[] = [];
    const dispatch = (action: WorkbenchAction) => {
      state = reducer(state, action);
      types.push(action.type);
    };
    const io = makeIo(session, () => state, dispatch, {
      cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle),
    });
    const seen = (type: WorkbenchAction["type"]) => vi.waitFor(() => expect(types).toContain(type));
    await check({ session, io, state: () => state, dispatch, seen });
  } finally {
    await session.close();
  }
}

describe("Send", () => {
  it("stores only the drafted keys, in one pass, and empties the draft", async () => {
    await inDraft(async ({ session, io, state }) => {
      await io.setKey(0, 0, 0, key("F13"));
      await io.setKey(0, 0, 1, key("F14"));
      await io.setKey(1, 2, 3, key("F15"));
      const before = storedKeysOf(session);
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect(storedKeysOf(session) - before).toBe(3);
      expect(draftOf(state()).changes).toEqual([]);
      expect(state().base).not.toHaveProperty("activeLayers");
      expect(state().batchBusy).toBe(false);
      const [layer0] = await session.keymap.readAll();
      expect(layer0.actions[0]).toEqual(key("F13"));
    });
  });

  it("stores nothing for a key drafted back to what the keyboard holds", async () => {
    await inDraft(async ({ session, io, state }) => {
      const original = state().layers[0][0];
      await io.setKey(0, 0, 0, key("F13"));
      await io.setKey(0, 0, 0, original);
      const before = storedKeysOf(session);
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect(storedKeysOf(session)).toBe(before);
    });
  });

  it("asks before overwriting a key changed on the keyboard since, and keeps the draft on no", async () => {
    await inDraft(async ({ session, io, state }) => {
      await io.setKey(0, 0, 0, key("F13"));
      await session.keymap.setKey(0, 0, 0, key("F20")); // changed elsewhere meanwhile
      let asked: unknown[] = [];
      const result = await io.applyBatch({ confirmOverwrite: async (items) => { asked = items; return false; } });
      expect(asked).toEqual([{ kind: "key", layer: 0, offset: 0 }]);
      expect(result).toMatchObject({ ok: false, guarded: true });
      expect(draftOf(state()).changes).toHaveLength(1);
      expect((await session.keymap.readAll())[0].actions[0]).toEqual(key("F20"));
    });
  });

  it("keeps what did not reach the keyboard in the draft, and sends it next time", async () => {
    await inDraft(async ({ session, io, state }) => {
      await io.setKey(0, 0, 0, key("F13"));
      await io.setKey(2, 0, 0, key("F14"));
      const writeKeys = session.keymap.writeKeys;
      let failures = 1;
      session.keymap.writeKeys = (layer, start, actions) =>
        layer === 2 && failures-- > 0 ? Promise.reject(new Error("link dropped")) : writeKeys(layer, start, actions);
      expect(await io.applyBatch()).toEqual({ ok: false, message: "link dropped" });
      expect(draftOf(state()).changes.map(({ item }) => item)).toEqual([{ kind: "key", layer: 2, offset: 0 }]);
      const before = storedKeysOf(session);
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect(storedKeysOf(session) - before).toBe(1);
    });
  });

  it("sends a drafted morse entry with the keys, and keeps what it was based on in the draft", async () => {
    await inDraft(async ({ session, io, state }) => {
      const entry = { profile: state().morse[0].profile, actions: [[1, { Key: { Hid: "F13" } }]] } as never;
      await io.setSlot("morse", 0, entry);
      expect(draftOf(state()).changes).toMatchObject([{ item: { kind: "slot", table: "morse", index: 0 }, after: entry }]);
      expect(await io.applyBatch()).toEqual({ ok: true });
      expect((await session.morse.readAll())[0]).toEqual(entry);
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("still asks about a key changed on the keyboard after a layer operation read the keyboard", async () => {
    await inDraft(async ({ session, io, state }) => {
      await io.setKey(0, 0, 0, key("F13"));
      await session.keymap.setKey(0, 0, 0, key("F20")); // changed elsewhere meanwhile
      expect(await io.moveLayer(2, 3)).toEqual({ ok: true });
      let asked: unknown[] = [];
      const result = await io.applyBatch({ confirmOverwrite: async (items) => { asked = items; return false; } });
      expect(asked).toEqual([{ kind: "key", layer: 0, offset: 0 }]);
      expect(result).toMatchObject({ ok: false, guarded: true });
      expect(state().layers[0][0]).toEqual(key("F13"));
      expect((await session.keymap.readAll())[0].actions[0]).toEqual(key("F20"));
    }, true, { ...glove80Board, seedScenes: [], compiledScenes: [], conditionalScenes: [], seedRuntimeConditionalScenes: [] });
  });

  it("still asks about a setting changed on the keyboard after a lighting refresh read it", async () => {
    await inDraft(async ({ session, io, state, seen }) => {
      const held = state().lightingOutputMode!.wake_layers;
      const [mine, theirs] = [0b10, 0b100, 0b1000].filter((layers) => layers !== held);
      expect(await io.setWakeLayers(mine)).toEqual({ ok: true });
      await session.lighting.setWakeLayers(theirs); // changed elsewhere meanwhile
      io.refreshLighting();
      await seen("lightingRefresh");
      let asked: unknown[] = [];
      const result = await io.applyBatch({ confirmOverwrite: async (items) => { asked = items; return false; } });
      expect(asked).toEqual([{ kind: "wakeLayers" }]);
      expect(result).toMatchObject({ ok: false, guarded: true });
      expect(state().lightingOutputMode?.wake_layers).toBe(mine);
    });
  });

  it("drops a drafted item from the draft when a read finds the keyboard already holds it", async () => {
    await inDraft(async ({ session, io, state, seen }) => {
      const held = state().lightingOutputMode!.wake_layers;
      const mine = held === 0b10 ? 0b100 : 0b10;
      expect(await io.setWakeLayers(mine)).toEqual({ ok: true });
      await session.lighting.setWakeLayers(mine);
      io.refreshLighting();
      await seen("lightingRefresh");
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("in Live: a change made now does not take along a drafted item the keyboard changed meanwhile", async () => {
    await inDraft(async ({ session, io, state, dispatch }) => {
      const item = { kind: "key" as const, layer: 1, offset: 0 };
      dispatch({ type: "draftRestore", patch: [{ item, before: state().layers[1][0], after: key("F13") }] });
      await session.keymap.setKey(1, 0, 0, key("F20")); // changed elsewhere meanwhile
      expect(await io.writeKeys([{ layer: 0, row: 0, col: 0, action: key("F14") }])).toEqual({ ok: true });
      const layers = await session.keymap.readAll();
      expect(layers[0].actions[0]).toEqual(key("F14"));
      expect(layers[1].actions[0]).toEqual(key("F20"));
      expect(draftOf(state()).changes.map((change) => change.item)).toEqual([item]);
      let asked: unknown[] = [];
      await io.applyBatch({ confirmOverwrite: async (items) => { asked = items; return false; } });
      expect(asked).toEqual([item]);
    }, false);
  });
});
