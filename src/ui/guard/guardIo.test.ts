import { afterEach, describe, expect, it } from "vitest";
import type { KeyAction } from "../../model/action-types";
import { testWorkbench, type DeepPartial } from "../../test/workbench";
import { getMessages, resetMessages } from "../messages/store";
import type { KeyWrite, WorkbenchIo, WorkbenchState } from "../../workbench";
import { guardIo } from "./guardIo";

const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code } } }) as KeyAction;
const mo = (layer: number): KeyAction => ({ Single: { LayerOn: layer } }) as KeyAction;

/** A two-column board whose layer 0 holds a letter and the only way to layer 1. */
function setup(state: DeepPartial<WorkbenchState> = {}) {
  const writes: KeyWrite[] = [];
  const workbench = testWorkbench({
    bundle: { caps: { num_cols: 2, num_layers: 2 } },
    state: { layers: [[key("A"), mo(1)], [key("B"), "No"]], ...state },
  });
  const inner = {
    setKey: async (layer: number, row: number, col: number, action: KeyAction) => {
      writes.push({ layer, row, col, action });
      return { ok: true };
    },
    writeKeys: async (edits: readonly KeyWrite[]) => {
      writes.push(...edits);
      return { ok: true };
    },
    applyBatch: async () => {
      writes.push({ layer: -1, row: 0, col: 0, action: "No" });
      return { ok: true };
    },
  } as Partial<WorkbenchIo> as WorkbenchIo;
  return { io: guardIo(inner, workbench.bundle, () => workbench.state), writes };
}

const answer = async (yes: boolean) => {
  await Promise.resolve();
  getMessages().confirm?.resolve(yes);
};

describe("guardIo", () => {
  afterEach(resetMessages);

  it("asks before cutting a layer off, and writes nothing on Reject", async () => {
    const { io, writes } = setup();
    const result = io.setKey(0, 0, 1, key("C"));
    await Promise.resolve();
    expect(getMessages().confirm).toMatchObject({ guard: true, title: "This cuts off Layer 1, which has 1 key" });
    await answer(false);
    expect(await result).toEqual({ ok: false, message: "Rejected, so nothing was changed", guarded: true });
    expect(writes).toEqual([]);
  });

  it("writes once approved", async () => {
    const { io, writes } = setup();
    const result = io.setKey(0, 0, 1, key("C"));
    await answer(true);
    expect(await result).toEqual({ ok: true });
    expect(writes).toHaveLength(1);
  });

  it("stops a key that points at a layer that does not exist, with a note", async () => {
    const { io, writes } = setup();
    expect(await io.setKey(0, 0, 0, mo(5))).toMatchObject({ ok: false, guarded: true });
    expect(getMessages().toasts.at(-1)).toMatchObject({ text: "Nothing was changed: Layer 5 does not exist", guard: true });
    expect(writes).toEqual([]);
  });

  it("judges several keys as one change: a swap asks nothing", async () => {
    const { io, writes } = setup();
    const swap: KeyWrite[] = [
      { layer: 0, row: 0, col: 0, action: mo(1) },
      { layer: 0, row: 0, col: 1, action: key("A") },
    ];
    expect(await io.writeKeys(swap)).toEqual({ ok: true });
    expect(getMessages().confirm).toBeNull();
    expect(writes).toEqual(swap);
  });

  it("does not send a key the keyboard already holds", async () => {
    const { io, writes } = setup();
    expect(await io.setKey(0, 0, 0, key("A"))).toEqual({ ok: true });
    expect(await io.writeKeys([{ layer: 0, row: 0, col: 1, action: mo(1) }])).toEqual({ ok: true });
    expect(writes).toEqual([]);
  });

  it("keeps a broken draft off the keyboard at Send", async () => {
    const { io, writes } = setup({
      layers: [[mo(7), mo(1)], [key("B"), "No"]],
      stagedKeys: { "0:0:0": { layer: 0, row: 0, col: 0, before: key("A"), action: mo(7) } },
    });
    expect(await io.applyBatch()).toMatchObject({ ok: false, guarded: true });
    expect(writes).toEqual([]);
  });
});
