import { describe, expect, it, vi } from "vitest";
import {
  BLE_SAFE_WRITE,
  RYNK_INPUT_CHAR_UUID,
  RYNK_OUTPUT_CHAR_UUID,
  RYNK_SERVICE_UUID,
  bluetoothByteLink,
} from "./link";

class FakeCharacteristic extends EventTarget {
  value: DataView | null = null;
  written: Uint8Array[] = [];
  startNotifications = vi.fn(() => Promise.resolve(this));
  stopNotifications = vi.fn(() => Promise.resolve(this));
  writeValueWithoutResponse = vi.fn((bytes: BufferSource) => {
    this.written.push(new Uint8Array(bytes as ArrayBuffer).slice());
    return Promise.resolve();
  });

  notify(bytes: Uint8Array) {
    this.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

function fakeDevice(name?: string) {
  const input = new FakeCharacteristic();
  const output = new FakeCharacteristic();
  const service = {
    getCharacteristic: (uuid: string) => {
      if (uuid === RYNK_INPUT_CHAR_UUID) return Promise.resolve(input);
      if (uuid === RYNK_OUTPUT_CHAR_UUID) return Promise.resolve(output);
      return Promise.reject(new Error(`unexpected characteristic ${uuid}`));
    },
  };
  const disconnect = vi.fn();
  const device = Object.assign(new EventTarget(), {
    id: "fake",
    name,
    gatt: {
      connected: false,
      connect: vi.fn(function (this: { connected: boolean }) {
        this.connected = true;
        return Promise.resolve(this);
      }),
      disconnect,
      getPrimaryService: (uuid: string) =>
        uuid === RYNK_SERVICE_UUID
          ? Promise.resolve(service)
          : Promise.reject(new Error("unexpected service")),
    },
  }) as unknown as BluetoothDevice;
  return { device, input, output, disconnect };
}

describe("Web Bluetooth byte link", () => {
  it("subscribes, chunks outbound frames to the safe write size, and labels by name", async () => {
    const { device, input, output } = fakeDevice("Glove80");
    const link = await bluetoothByteLink(device);

    expect(link.label).toBe("Glove80 (Web Bluetooth)");
    expect(input.startNotifications).toHaveBeenCalledOnce();

    const frame = Uint8Array.from({ length: BLE_SAFE_WRITE + 5 }, (_v, i) => i);
    await link.send(frame);
    expect(output.written).toEqual([
      frame.slice(0, BLE_SAFE_WRITE),
      frame.slice(BLE_SAFE_WRITE),
    ]);

    input.notify(new Uint8Array([1, 2, 0]));
    expect(await link.recv()).toEqual(new Uint8Array([1, 2, 0]));
  });

  it("copies notification bytes out of the reused DataView buffer", async () => {
    const { device, input } = fakeDevice();
    const link = await bluetoothByteLink(device);

    expect(link.label).toBe("Rynk (Web Bluetooth)");
    const reused = new Uint8Array([9, 9, 9]);
    input.notify(reused);
    reused.fill(0);
    expect(await link.recv()).toEqual(new Uint8Array([9, 9, 9]));
  });

  it("ends the stream and rejects sends when the GATT server disconnects", async () => {
    const { device } = fakeDevice();
    const link = await bluetoothByteLink(device);
    const pending = link.recv();

    device.dispatchEvent(new Event("gattserverdisconnected"));

    expect(await pending).toEqual(new Uint8Array());
    await expect(link.send(new Uint8Array([1]))).rejects.toThrow(/closed/);
    await link.close();
  });

  it("unsubscribes and disconnects on close", async () => {
    const { device, input, disconnect } = fakeDevice();
    const link = await bluetoothByteLink(device);

    await link.close();

    expect(input.stopNotifications).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("disconnects when the subscription cannot be established", async () => {
    const { device, input, disconnect } = fakeDevice();
    input.startNotifications.mockRejectedValueOnce(new Error("insufficient encryption"));

    await expect(bluetoothByteLink(device)).rejects.toThrow("insufficient encryption");
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
