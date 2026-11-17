// A typed timing value: shown as typed, committed once when it settles, never
// lost to a commit still under way or one that was refused.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { numberEntry, SETTLE_PAUSE_MS, type NumberEntryOptions } from "./numberEntry";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A field holding `value`, whose commits answer with `answer`. */
function field(value: number, answer: (n: number) => unknown = () => true) {
  const at: NumberEntryOptions & { shown: string | null; inputs: number[]; commits: number[] } = {
    min: 100,
    max: 10_000,
    value,
    shown: null,
    inputs: [],
    commits: [],
    onInput: (n) => at.inputs.push(n),
    commit: (n) => {
      at.commits.push(n);
      return answer(n);
    },
    show: (text) => {
      at.shown = text;
    },
  };
  return { at, entry: numberEntry(() => at) };
}
const typing = (entry: ReturnType<typeof numberEntry>, text: string) => {
  for (let end = 1; end <= text.length; end += 1) entry.type(text.slice(0, end));
};

describe("a typed number", () => {
  it("is reported as each whole number within bounds is typed, and committed once, after a pause", async () => {
    const { at, entry } = field(200);
    typing(entry, "2000");
    expect(at.inputs).toEqual([200, 2000]);
    expect(at.commits).toEqual([]);
    await vi.advanceTimersByTimeAsync(SETTLE_PAUSE_MS);
    expect(at.commits).toEqual([2000]);
    expect(at.shown).toBe("2000");
  });

  it("is committed on leaving the field, brought within bounds, and the field then shows its value", async () => {
    const { at, entry } = field(500);
    typing(entry, "40");
    await entry.settle("leave");
    expect(at.commits).toEqual([100]);
    expect(at.shown).toBeNull();
  });

  it("waits for a commit still under way instead of being refused alongside it", async () => {
    let land: (ok: boolean) => void = () => {};
    const { at, entry } = field(1000, (n) => (n === 200 ? new Promise((resolve) => (land = resolve)) : true));
    typing(entry, "200");
    await vi.advanceTimersByTimeAsync(SETTLE_PAUSE_MS);
    expect(at.commits).toEqual([200]);
    typing(entry, "2000");
    const leaving = entry.settle("leave");
    await vi.advanceTimersByTimeAsync(0);
    expect(at.commits).toEqual([200]);
    at.value = 200;
    land(true);
    await leaving;
    expect(at.commits).toEqual([200, 2000]);
  });

  it("stays in the field when its commit is refused", async () => {
    const { at, entry } = field(1000, () => Promise.resolve(false));
    typing(entry, "2000");
    await entry.settle("leave");
    expect(at.commits).toEqual([2000]);
    expect(at.shown).toBe("2000");
  });

  it("commits nothing when what it was typed for already holds it, as a Paint brush does", async () => {
    const { at, entry } = field(1000);
    at.onInput = (n) => (at.value = n);
    typing(entry, "2000");
    await entry.settle("enter");
    await vi.advanceTimersByTimeAsync(SETTLE_PAUSE_MS);
    expect(at.commits).toEqual([]);
  });

  it("is committed when the field goes away before its pause", async () => {
    const { at, entry } = field(1000);
    typing(entry, "1500");
    entry.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(at.commits).toEqual([1500]);
  });
});
