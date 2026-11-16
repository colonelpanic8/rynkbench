import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { later } from "./later";

describe("later", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs only the last task, once the delay has passed since it was asked for", () => {
    const ran: string[] = [];
    const save = later(400);
    save.schedule(() => ran.push("first"));
    vi.advanceTimersByTime(300);
    save.schedule(() => ran.push("second"));
    vi.advanceTimersByTime(300);
    expect(ran).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(ran).toEqual(["second"]);
  });

  it("runs the waiting task at once on a flush, and not again when the delay passes", () => {
    const task = vi.fn();
    const save = later(400);
    save.schedule(task);
    save.flush();
    expect(task).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(400);
    save.flush();
    expect(task).toHaveBeenCalledOnce();
  });

  it("drops a cancelled task", () => {
    const task = vi.fn();
    const save = later(400);
    save.schedule(task);
    save.cancel();
    save.flush();
    vi.advanceTimersByTime(400);
    expect(task).not.toHaveBeenCalled();
  });
});
