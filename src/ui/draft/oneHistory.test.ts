import { describe, expect, it } from "vitest";
import type { KeyEditHistory, KeyEditHistoryEntry } from "../../model/history";
import { oneHistory } from "./oneHistory";

type Device = Parameters<typeof oneHistory>[1];
type Staged = Parameters<typeof oneHistory>[2];

const calls: string[] = [];
const device = (canUndo: boolean, canRedo: boolean): Device => ({
  canUndo,
  canRedo,
  phase: "idle",
  error: null,
  undoLabel: "A on Base",
  redoLabel: "B on Base",
  undo: async () => void calls.push("key undo"),
  redo: async () => void calls.push("key redo"),
  clear: () => {},
});
const staged = (past?: number, future?: number): Staged => ({
  tops: { past, future },
  canUndo: past !== undefined,
  canRedo: future !== undefined,
  undoLabel: "RGB Lighting on Base",
  redoLabel: "RGB Lighting on Base",
  undo: () => void calls.push("light undo"),
  redo: () => void calls.push("light redo"),
});
const entry = (sequence: number) => ({ sequence }) as KeyEditHistoryEntry;
const keys = (past: number[], future: number[] = []): KeyEditHistory => ({
  past: past.map(entry),
  future: future.map(entry),
  operation: null,
  error: null,
});

describe("one Undo for keys and lights", () => {
  it("in Draft is the staged history alone", async () => {
    calls.length = 0;
    const history = oneHistory(true, device(true, false), staged(1), keys([5]));
    expect(history.undoLabel).toBe("RGB Lighting on Base");
    await history.undo();
    expect(calls).toEqual(["light undo"]);
  });

  it("in Live undoes the newest edit, key or light", async () => {
    calls.length = 0;
    await oneHistory(false, device(true, false), staged(3), keys([5])).undo();
    await oneHistory(false, device(true, false), staged(7), keys([5])).undo();
    expect(calls).toEqual(["key undo", "light undo"]);
  });

  it("in Live redoes nothing older than an edit done since", () => {
    const history = oneHistory(false, device(true, true), staged(undefined, 4), keys([9], [8]));
    expect(history.canRedo).toBe(false);
  });

  it("in Live still undoes lights while a key write is busy", () => {
    const history = oneHistory(false, device(false, false), staged(2), keys([5]));
    expect(history.canUndo).toBe(true);
    expect(history.undoLabel).toBe("RGB Lighting on Base");
  });
});
