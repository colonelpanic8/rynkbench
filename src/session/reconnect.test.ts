import { describe, expect, it, vi } from "vitest";
import { retryReconnect } from "./reconnect";

describe("retryReconnect", () => {
  it("retries a failed reconnect and reports each attempt", async () => {
    const reconnect = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("not enumerated yet"))
      .mockRejectedValueOnce(new Error("still unavailable"))
      .mockResolvedValue("connected");
    const wait = vi.fn(() => Promise.resolve());
    const onAttempt = vi.fn();

    await expect(
      retryReconnect(reconnect, { delaysMs: [0, 10, 20], wait, onAttempt }),
    ).resolves.toBe("connected");

    expect(reconnect).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[10], [20]]);
    expect(onAttempt.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it("surfaces the final failure after exhausting the attempts", async () => {
    const finalError = new Error("keyboard stayed offline");
    const reconnect = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(new Error("first failure"))
      .mockRejectedValue(finalError);

    await expect(
      retryReconnect(reconnect, {
        delaysMs: [0, 1],
        wait: () => Promise.resolve(),
      }),
    ).rejects.toBe(finalError);
  });
});
