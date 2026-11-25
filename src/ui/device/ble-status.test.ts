import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConnectionStatus } from "../../model/connection";
import type { RynkSession } from "../../session/types";
import { readBleStatus } from "./ble-status";

const connection = (selected: number): ConnectionStatus => ({
  usb: "Configured",
  preferred: "Usb",
  ble: Array.from({ length: 4 }, () => ({ state: "Advertising" as const, bonded: false })),
  selected,
});

function session(connectionStatus: () => Promise<ConnectionStatus>) {
  return { device: { connectionStatus } } as unknown as RynkSession;
}

afterEach(() => vi.useRealTimers());

describe("BLE status readback", () => {
  it("waits for a queued profile switch to settle without a topic push", async () => {
    vi.useFakeTimers();
    const get = vi.fn(async () => connection(0));
    const result = readBleStatus(session(get), 2);
    await vi.advanceTimersByTimeAsync(300);
    get.mockResolvedValue(connection(2));
    await vi.advanceTimersByTimeAsync(100);
    expect((await result).selected).toBe(2);
    expect(get).toHaveBeenCalledTimes(5);
  });

  it("reports connection read failures", async () => {
    await expect(readBleStatus(session(async () => { throw new Error("link lost"); }))).rejects.toThrow("link lost");
  });

  it("stops polling and reports a switch that never took effect", async () => {
    vi.useFakeTimers();
    const get = vi.fn(async () => connection(0));
    const result = expect(readBleStatus(session(get), 2)).rejects.toThrow("did not become active");
    await vi.runAllTimersAsync();
    await result;
    expect(get).toHaveBeenCalledTimes(20);
  });
});
