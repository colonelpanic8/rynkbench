import { describe, expect, it } from "vitest";
import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import {
  historyShortcut,
  initialKeyEditHistory,
  reduceKeyEditHistory,
  type KeyEditHistoryEntry,
} from "./history";

const action = (key: "A" | "B"): KeyAction => ({
  Single: { Key: { Hid: key } },
});

function edit(sequence: number, key: "A" | "B"): KeyEditHistoryEntry {
  return {
    sequence,
    layer: 0,
    row: 1,
    col: sequence,
    before: "No",
    after: action(key),
  };
}

describe("key edit history", () => {
  it("moves entries through undo and redo without changing them", () => {
    const first = edit(1, "A");
    let history = reduceKeyEditHistory(initialKeyEditHistory(), {
      type: "record",
      entry: first,
    });

    history = reduceKeyEditHistory(history, {
      type: "start",
      direction: "undo",
      entry: first,
    });
    expect(history.operation).toEqual({ direction: "undo", entry: first });
    history = reduceKeyEditHistory(history, {
      type: "finish",
      direction: "undo",
      entry: first,
    });
    expect(history.past).toEqual([]);
    expect(history.future).toEqual([first]);

    history = reduceKeyEditHistory(history, {
      type: "start",
      direction: "redo",
      entry: first,
    });
    history = reduceKeyEditHistory(history, {
      type: "finish",
      direction: "redo",
      entry: first,
    });
    expect(history.past).toEqual([first]);
    expect(history.future).toEqual([]);
  });

  it("preserves history on failure and clears redo after a divergent edit", () => {
    const first = edit(1, "A");
    const second = edit(2, "B");
    let history = reduceKeyEditHistory(initialKeyEditHistory(), {
      type: "record",
      entry: first,
    });
    history = reduceKeyEditHistory(history, {
      type: "finish",
      direction: "undo",
      entry: first,
    });
    history = reduceKeyEditHistory(history, {
      type: "fail",
      direction: "redo",
      message: "device busy",
    });
    expect(history).toMatchObject({
      past: [],
      future: [first],
      operation: null,
      error: "Redo failed: device busy",
    });

    history = reduceKeyEditHistory(history, { type: "record", entry: second });
    expect(history.past).toEqual([second]);
    expect(history.future).toEqual([]);
    expect(history.error).toBeNull();
  });

  it("orders asynchronously completed edits by their initiation sequence", () => {
    const first = edit(1, "A");
    const second = edit(2, "B");
    let history = reduceKeyEditHistory(initialKeyEditHistory(), {
      type: "record",
      entry: second,
    });
    history = reduceKeyEditHistory(history, { type: "record", entry: first });
    expect(history.past).toEqual([first, second]);
  });
});

function shortcutEvent(
  key: string,
  overrides: Partial<Parameters<typeof historyShortcut>[0]> = {},
): Parameters<typeof historyShortcut>[0] {
  return {
    key,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    target: null,
    ...overrides,
  };
}

describe("history shortcuts", () => {
  it("recognizes platform undo and redo chords", () => {
    expect(historyShortcut(shortcutEvent("z"))).toBe("undo");
    expect(historyShortcut(shortcutEvent("Z", { shiftKey: true }))).toBe("redo");
    expect(historyShortcut(shortcutEvent("y"))).toBe("redo");
    expect(historyShortcut(shortcutEvent("z", { ctrlKey: false, metaKey: true }))).toBe("undo");
  });

  it("does not claim shortcuts from text-entry controls", () => {
    const target = { closest: () => ({}) } as unknown as EventTarget;
    expect(historyShortcut(shortcutEvent("z", { target }))).toBeNull();
    expect(historyShortcut(shortcutEvent("y", { target }))).toBeNull();
  });

  it("ignores unrelated or already-handled chords", () => {
    expect(historyShortcut(shortcutEvent("z", { altKey: true }))).toBeNull();
    expect(historyShortcut(shortcutEvent("z", { defaultPrevented: true }))).toBeNull();
    expect(historyShortcut(shortcutEvent("x"))).toBeNull();
  });
});
