import { describe, expect, it, vi } from "vitest";
import { mockProvider } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import type { KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { emptyMorse } from "../model/slots";
import { noLabels, withLabel } from "../model/behavior-labels";
import { openBundle } from "../ui/bundle";
import { initialWorkbenchState } from "./initial-state";
import { ioFeaturesFor, keepingCurrent, makeIo, type IoOptions, type WorkbenchIo } from "./io";
import { makeWorkbenchReducer } from "./reducer";
import type { WorkbenchAction, WorkbenchState } from "../model/workbench-state";
import { draftOf } from "./draft/want";

const letter = (code: string) => ({ Single: { Key: { Hid: code } } }) as KeyAction;

/** A simulated Glove80 whose base layer starts with A and B, in Live or Draft. */
async function withBoard(
  draft: boolean,
  check: (session: RynkSession, io: WorkbenchIo, state: () => WorkbenchState) => Promise<void>,
  options: Partial<IoOptions> = {},
) {
  const session = await mockProvider({
    ...glove80Board,
    defaultLayers: glove80Board.defaultLayers.map((layer, index) =>
      layer.map((action, offset) => (index === 0 && offset < 2 ? letter(offset === 0 ? "A" : "B") : action)),
    ),
  }).connect();
  try {
    const bundle = await openBundle(session);
    let state: WorkbenchState = { ...initialWorkbenchState(bundle), batchMode: draft };
    const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
    const io = makeIo(session, () => state, (action) => { state = reducer(state, action); }, {
      cols: bundle.caps.num_cols, onDisconnect: () => {}, features: ioFeaturesFor(bundle), ...options,
    });
    await check(session, io, () => state);
  } finally {
    await session.close();
  }
}

const swap = { a: { layer: 0, row: 0, col: 0 }, b: { layer: 0, row: 0, col: 1 } };
const firstTwo = async (session: RynkSession) => (await session.keymap.readAll())[0].actions.slice(0, 2);

describe("applying an operation (ADR 0019)", () => {
  it("in Draft: changes what you want as one step, writes nothing, and Undo takes it back", async () => {
    await withBoard(true, async (session, io, state) => {
      const before = await firstTwo(session);
      expect(await io.apply("swap_keys", swap)).toEqual({ ok: true });
      expect(state().layers[0].slice(0, 2)).toEqual([before[1], before[0]]);
      expect(await firstTwo(session)).toEqual(before);
      expect(state().history.past).toHaveLength(1);
      expect(draftOf(state()).changes).toHaveLength(2);
      expect(await io.travel("undo")).toEqual({ ok: true });
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("in Live: the keyboard follows at once, as one step", async () => {
    await withBoard(false, async (session, io, state) => {
      const before = await firstTwo(session);
      expect(await io.apply("swap_keys", swap)).toEqual({ ok: true });
      expect(await firstTwo(session)).toEqual([before[1], before[0]]);
      expect(state().history.past).toHaveLength(1);
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("in Live: all or nothing; a send that stops part-way is put back and leaves no step", async () => {
    await withBoard(false, async (session, io, state) => {
      const before = await firstTwo(session);
      const write = session.keymap.writeKeys.bind(session.keymap);
      let calls = 0;
      vi.spyOn(session.keymap, "writeKeys").mockImplementation(async (layer, start, actions) => {
        calls += 1;
        // The second run of keys fails; the first already reached the keyboard.
        if (calls === 2) throw new Error("flash failed");
        return write(layer, start, actions);
      });
      const keys = [
        { layer: 0, row: 0, col: 0, action: letter("X") },
        { layer: 1, row: 0, col: 0, action: letter("Y") },
      ];
      const result = await io.apply("set_keys", { keys });
      expect(result).toEqual({ ok: false, message: "flash failed; nothing was changed" });
      expect(await firstTwo(session)).toEqual(before);
      expect(state().history.past).toEqual([]);
      expect(draftOf(state()).changes).toEqual([]);
    });
  });

  it("does nothing for a change that changes nothing, and nothing when Guard says no", async () => {
    const judge = vi.fn(async () => ({ ok: false as const, message: "Rejected, so nothing was changed", guarded: true as const }));
    await withBoard(true, async (_session, io, state) => {
      expect(await io.apply("set_keys", { keys: [] })).toEqual({ ok: true });
      expect(judge).not.toHaveBeenCalled();
      expect(await io.apply("swap_keys", swap)).toMatchObject({ ok: false, guarded: true });
      expect(state().history.past).toEqual([]);
      expect(draftOf(state()).changes).toEqual([]);
    }, { judge });
  });

  it("answers a refused operation with its message", async () => {
    await withBoard(true, async (_session, io) => {
      expect(await io.apply("set_keys", { keys: [{ layer: 0, row: 99, col: 0, action: "No" }] })).toMatchObject({ ok: false });
    });
  });
});

describe("behavior operations (ADR 0020)", () => {
  const tapA = { ...emptyMorse(), actions: [[2, { Key: { Hid: "A" } }]] } as Morse;

  it("in Draft: a new tap pattern and its name are one step; Undo takes both back", async () => {
    await withBoard(true, async (_session, io, state) => {
      const slot = state().morse.findIndex((morse) => morse.actions.length === 0);
      expect(await io.apply("create_behavior", { kind: "morse", value: tapA, name: "Home" })).toEqual({ ok: true });
      expect(state().morse[slot]).toEqual(tapA);
      expect(state().labels.morse[slot]?.name).toBe("Home");
      expect(state().history.past).toHaveLength(1);
      expect(await io.travel("undo")).toEqual({ ok: true });
      expect(state().labels.morse).toEqual({});
      expect(state().morse[slot]).toEqual(emptyMorse());
      expect(await io.travel("redo")).toEqual({ ok: true });
      expect(state().labels.morse[slot]?.name).toBe("Home");
    });
  });

  it("in Live: a rename writes nothing and is still a step", async () => {
    await withBoard(false, async (session, io, state) => {
      const slot = state().morse.findIndex((morse) => morse.actions.length === 0);
      expect(await io.apply("create_behavior", { kind: "morse", value: tapA })).toEqual({ ok: true });
      const write = vi.spyOn(session.morse, "set");
      expect(await io.apply("rename_behavior", { kind: "morse", slot, name: "Home" })).toEqual({ ok: true });
      expect(write).not.toHaveBeenCalled();
      expect(state().history.past).toHaveLength(2);
      expect(await io.travel("undo")).toEqual({ ok: true });
      expect(state().labels.morse).toEqual({});
    });
  });

  it("takes kept or filed labels without those on slots that hold nothing", async () => {
    await withBoard(true, async (_session, io, state) => {
      const free = state().morse.findIndex((morse) => morse.actions.length === 0);
      expect(await io.apply("create_behavior", { kind: "morse", value: tapA })).toEqual({ ok: true });
      const labels = withLabel(withLabel(noLabels(), "morse", free, { name: "Kept", description: "" }), "morse", free + 1, { name: "Gone", description: "" });
      const reducer = makeWorkbenchReducer(2);
      expect(reducer(state(), { type: "labelsLoaded", labels }).labels.morse).toEqual({ [free]: { name: "Kept", description: "" } });
    });
  });

  it("in Live: Undo takes a new tap pattern off the keyboard again", async () => {
    await withBoard(false, async (session, io, state) => {
      const slot = state().morse.findIndex((morse) => morse.actions.length === 0);
      expect(await io.apply("create_behavior", { kind: "morse", value: tapA, name: "Home" })).toEqual({ ok: true });
      expect((await session.morse.readAll())[slot].actions).toEqual(tapA.actions);
      expect(await io.travel("undo")).toEqual({ ok: true });
      expect(state().morse[slot]).toEqual(emptyMorse());
      expect((await session.morse.readAll())[slot].actions).toEqual([]);
    });
  });

  it("in Live, where the state is kept elsewhere (a screen's), Undo takes a new tap pattern off the keyboard too", async () => {
    const session = await mockProvider(glove80Board).connect();
    try {
      const bundle = await openBundle(session);
      const reducer = makeWorkbenchReducer(bundle.caps.num_cols);
      const screen = { current: { ...initialWorkbenchState(bundle), batchMode: false } };
      // Like React: what is dispatched reaches the screen's state only later.
      const queued: WorkbenchAction[] = [];
      const render = () => (screen.current = queued.splice(0).reduce(reducer, screen.current));
      const kept = { current: screen.current };
      const io = makeIo(session, () => kept.current, keepingCurrent(kept, reducer, (action) => queued.push(action)), {
        cols: bundle.caps.num_cols,
        onDisconnect: () => {},
        features: ioFeaturesFor(bundle),
      });
      const slot = kept.current.morse.findIndex((morse) => morse.actions.length === 0);
      expect(await io.apply("create_behavior", { kind: "morse", value: tapA })).toEqual({ ok: true });
      expect((await session.morse.readAll())[slot].actions).toEqual(tapA.actions);
      expect(await io.travel("undo")).toEqual({ ok: true });
      expect((await session.morse.readAll())[slot].actions).toEqual([]);
      expect(render().morse[slot]).toEqual(emptyMorse());
    } finally {
      await session.close();
    }
  });
});
