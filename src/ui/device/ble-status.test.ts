import { afterEach, describe, expect, it, vi } from "vitest";
import type { RynkSession } from "../../session/types";
import type { ConnectionStatus } from "../../vendor/rynk-wasm/rynk_wasm";
import { unsupported } from "../../session/unsupported";
import { readBleStatus } from "./ble-status";

const connection = (profile: number): ConnectionStatus => ({
  usb: "Configured", preferred: "Usb", ble: { profile, state: "Advertising" },
});

function session(connectionStatus: () => Promise<ConnectionStatus>) {
  return { device: { connectionStatus, bleStatus: vi.fn(async () => connection(2).ble) } } as unknown as RynkSession;
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
    expect((await result).ble.profile).toBe(2);
    expect(get).toHaveBeenCalledTimes(5);
  });

  it("falls back to the BLE endpoint when combined connection status is unsupported", async () => {
    const device = session(async () => { throw unsupported("connection status"); });
    expect(await readBleStatus(device, 2)).toEqual({ connection: null, ble: connection(2).ble });
    expect(device.device.bleStatus).toHaveBeenCalledOnce();
  });

  it("reports connection read failures without misclassifying them as unsupported", async () => {
    const device = session(async () => { throw new Error("link lost"); });
    await expect(readBleStatus(device)).rejects.toThrow("link lost");
    expect(device.device.bleStatus).not.toHaveBeenCalled();
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
