import { describe, expect, it } from "vitest";
import { mockProvider, storedKeysOf } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { planSync, readImage, SyncStopped, syncTo, type KeyboardImage } from "./index";

const FEATURES = { scenesSupported: true, conditionalScenesSupported: true, pointingSupported: false, lightingOutputSupported: false, layerMetadata: true };
const key = (code: string): KeyAction => ({ Single: { Key: { Hid: code as never } } });

const open = () => mockProvider(glove80Board).connect();

function withKeys(image: KeyboardImage, changes: [layer: number, offset: number, action: KeyAction][]): KeyboardImage {
  const layers = image.layers.map((cells) => [...cells]);
  for (const [layer, offset, action] of changes) layers[layer][offset] = action;
  return { ...image, layers };
}

describe("syncTo", () => {
  it("stores only the keys that change and reads back what was wanted", async () => {
    const session = await open();
    const now = await readImage(session, FEATURES);
    const want = withKeys(now, [[0, 0, key("F13")], [0, 1, key("F14")], [1, 40, key("F15")]]);
    const before = storedKeysOf(session);
    const { readback, stored } = await syncTo(session, now, want, FEATURES);
    expect(stored).toBe(3);
    expect(storedKeysOf(session) - before).toBe(3);
    expect(planSync(readback, want)).toEqual([]);
  });

  it("stores nothing when the keyboard already holds the layout", async () => {
    const session = await open();
    const now = await readImage(session, FEATURES);
    const before = storedKeysOf(session);
    expect((await syncTo(session, now, now, FEATURES)).stored).toBe(0);
    expect(storedKeysOf(session)).toBe(before);
  });

  it("resumes after a failure by planning again: nothing is stored twice", async () => {
    const session = await open();
    const now = await readImage(session, FEATURES);
    const want = withKeys(now, [[0, 0, key("F13")], [2, 5, key("F14")]]);
    let failures = 1;
    const flaky: RynkSession = {
      ...session,
      keymap: {
        ...session.keymap,
        writeKeys: (layer, start, actions) => {
          if (layer === 2 && failures-- > 0) return Promise.reject(new Error("link dropped"));
          return session.keymap.writeKeys(layer, start, actions);
        },
      },
    };
    const before = storedKeysOf(session);
    await expect(syncTo(flaky, now, want, FEATURES)).rejects.toBeInstanceOf(SyncStopped);
    const fresh = await readImage(session, FEATURES);
    expect(planSync(fresh, want)).toEqual([{ kind: "keys", layer: 2, start: 5, actions: [key("F14")] }]);
    await syncTo(flaky, fresh, want, FEATURES);
    expect(storedKeysOf(session) - before).toBe(2);
  });
});
