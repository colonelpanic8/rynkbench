import { describe, expect, it } from "vitest";
import { mockProvider, storedSegmentsOf } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { planSync, readImage, SyncStopped, syncTo, type KeyboardImage } from "./index";

const FEATURES = { scenesSupported: true, conditionalScenesSupported: true, pointingSupported: false, lightingOutputSupported: false, layerMetadata: true };
const COLS = glove80Board.capabilities.num_cols;
const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });

const open = () => mockProvider(glove80Board).connect();

type Change = [layer: number, row: number, col: number, action: KeyAction];

function withKeys(image: KeyboardImage, changes: Change[]): KeyboardImage {
  const layers = image.layers.map((cells) => [...cells]);
  for (const [layer, row, col, action] of changes) layers[layer][row * COLS + col] = action;
  return { ...image, layers };
}

/** The session with its row writes listed as [layer, row]; `fails` rejects a write. */
function recording(session: RynkSession, fails: (layer: number, row: number) => boolean = () => false) {
  const rows: [layer: number, row: number][] = [];
  const recorded: RynkSession = {
    ...session,
    keymap: {
      ...session.keymap,
      setRows: (layer, row, actions) => {
        if (fails(layer, row)) return Promise.reject(new Error("link dropped"));
        rows.push([layer, row]);
        return session.keymap.setRows(layer, row, actions);
      },
    },
  };
  return { recorded, rows };
}

describe("syncTo", () => {
  it("stores only the rows that change and reads back what was wanted", async () => {
    const session = await open();
    const now = await readImage(session, FEATURES);
    const want = withKeys(now, [[0, 0, 0, key("F13")], [0, 0, 1, key("F14")], [1, 2, 12, key("F15")]]);
    const before = storedSegmentsOf(session);
    const { readback, stored } = await syncTo(session, now, want, FEATURES);
    expect(stored).toBe(2);
    expect(storedSegmentsOf(session) - before).toBe(2);
    expect(planSync(readback, want, COLS)).toEqual([]);
  });

  it("writes scattered changes in one row as one row, the rest of it as it was", async () => {
    const session = await open();
    const now = await readImage(session, FEATURES);
    const want = withKeys(now, [0, 2, 4, 6, 8, 10, 12].map((col): Change => [0, 3, col, key("F13")]));
    const { recorded, rows } = recording(session);
    const before = storedSegmentsOf(session);
    const { readback } = await syncTo(recorded, now, want, FEATURES);
    expect(rows).toEqual([[0, 3]]);
    expect(storedSegmentsOf(session) - before).toBe(1);
    expect(readback.layers).toEqual(want.layers);
  });

  it("writes one row per row that holds a change and no other", async () => {
    const session = await open();
    const now = await readImage(session, FEATURES);
    const want = withKeys(now, [[0, 1, 4, key("F13")], [3, 5, 0, key("F14")], [3, 5, 13, key("F15")]]);
    const { recorded, rows } = recording(session);
    const before = storedSegmentsOf(session);
    await syncTo(recorded, now, want, FEATURES);
    expect(rows).toEqual([[0, 1], [3, 5]]);
    expect(storedSegmentsOf(session) - before).toBe(2);
  });

  it("stores nothing when the keyboard already holds the layout", async () => {
    const session = await open();
    const now = await readImage(session, FEATURES);
    const before = storedSegmentsOf(session);
    expect((await syncTo(session, now, now, FEATURES)).stored).toBe(0);
    expect(storedSegmentsOf(session)).toBe(before);
  });

  it("names the row that stopped, and resumes by planning again: nothing is stored twice", async () => {
    const session = await open();
    const now = await readImage(session, FEATURES);
    const want = withKeys(now, [[0, 0, 0, key("F13")], [2, 1, 5, key("F14")], [2, 4, 0, key("F15")]]);
    let failures = 1;
    const { recorded: flaky } = recording(session, (layer, row) => layer === 2 && row === 1 && failures-- > 0);
    const before = storedSegmentsOf(session);
    const stopped = await syncTo(flaky, now, want, FEATURES).catch((error: unknown) => error);
    expect(stopped).toBeInstanceOf(SyncStopped);
    expect(stopped).toMatchObject({ done: 1, total: 3, step: { kind: "keys", layer: 2, row: 1 }, message: "link dropped" });
    const fresh = await readImage(session, FEATURES);
    expect(planSync(fresh, want, COLS)).toEqual([
      { kind: "keys", layer: 2, row: 1, actions: want.layers[2].slice(COLS, 2 * COLS) },
      { kind: "keys", layer: 2, row: 4, actions: want.layers[2].slice(4 * COLS, 5 * COLS) },
    ]);
    await syncTo(flaky, fresh, want, FEATURES);
    expect(storedSegmentsOf(session) - before).toBe(3);
  });
});
