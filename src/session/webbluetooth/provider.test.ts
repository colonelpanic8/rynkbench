import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
let failHandshake = false;
let stallHandshake = false;
let unplugged = false;

vi.mock("../../vendor/rynk-wasm/rynk_wasm", () => ({
  connect: (link: { label: string }) => {
    order.push("handshake");
    if (stallHandshake) return new Promise(() => {});
    return failHandshake
      ? Promise.reject(new Error("protocol mismatch"))
      : Promise.resolve({ label: link.label });
  },
}));
vi.mock("../wasm", () => ({
  initWasm: () => {
    order.push("wasm");
    return Promise.resolve();
  },
}));
vi.mock("../link-session", () => ({
  REQUEST_TIMEOUT_MS: 5_000,
  LinkSession: class {
    client: { label: string };
    link: { close(): Promise<void> };
    constructor(
      client: { label: string },
      link: { close(): Promise<void> },
      hooks: { watchDisconnect: (onUnplug: () => void) => () => void },
    ) {
      this.client = client;
      this.link = link;
      hooks.watchDisconnect(() => {
        unplugged = true;
      });
    }
    close() {
      return this.link.close();
    }
  },
}));

const { webBluetoothProvider } = await import("./index");
const { RYNK_SERVICE_UUID } = await import("./link");

function characteristic() {
  return Object.assign(new EventTarget(), {
    value: null,
    startNotifications: vi.fn(function (this: unknown) {
      return Promise.resolve(this);
    }),
    stopNotifications: vi.fn(function (this: unknown) {
      return Promise.resolve(this);
    }),
    writeValueWithoutResponse: vi.fn(() => Promise.resolve()),
  });
}

function device(name?: string) {
  const disconnect = vi.fn();
  const service = { getCharacteristic: () => Promise.resolve(characteristic()) };
  return Object.assign(new EventTarget(), {
    id: "fake",
    name,
    gatt: {
      connected: false,
      connect: vi.fn(function (this: unknown) {
        return Promise.resolve(this);
      }),
      disconnect,
      getPrimaryService: () => Promise.resolve(service),
    },
  }) as unknown as BluetoothDevice & { gatt: { disconnect: typeof disconnect } };
}

function install(selected: BluetoothDevice) {
  const requestDevice = vi.fn((options: BluetoothRequestDeviceOptions) => {
    order.push("chooser");
    expect(options.filters).toEqual([{ services: [RYNK_SERVICE_UUID] }]);
    return Promise.resolve(selected);
  });
  (globalThis as { navigator?: unknown }).navigator = { bluetooth: { requestDevice } };
  return { requestDevice };
}

describe("Web Bluetooth provider", () => {
  beforeEach(() => {
    order.length = 0;
    failHandshake = false;
    stallHandshake = false;
    unplugged = false;
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  afterEach(() => vi.useRealTimers());

  it("opens the browser chooser before loading wasm and handshaking", async () => {
    const selected = device("Glove80");
    const { requestDevice } = install(selected);

    const session = (await webBluetoothProvider.connect()) as unknown as {
      client: { label: string };
    };

    expect(requestDevice).toHaveBeenCalledOnce();
    expect(order).toEqual(["chooser", "wasm", "handshake"]);
    expect(session.client.label).toBe("Glove80 (Web Bluetooth)");

    selected.dispatchEvent(new Event("gattserverdisconnected"));
    expect(unplugged).toBe(true);
  });

  it("reconnects the granted device without reopening the chooser", async () => {
    const selected = device("Glove80");
    const { requestDevice } = install(selected);
    const original = await webBluetoothProvider.connect();
    await original.close();

    await webBluetoothProvider.reconnect();

    expect(requestDevice).toHaveBeenCalledOnce();
  });

  it("disconnects the device when the Rynk handshake fails", async () => {
    const selected = device();
    install(selected);
    failHandshake = true;

    await expect(webBluetoothProvider.connect()).rejects.toThrow("protocol mismatch");
    expect(selected.gatt.disconnect).toHaveBeenCalled();
  });

  it("times out a device that never answers and points at pairing", async () => {
    vi.useFakeTimers();
    const selected = device();
    install(selected);
    stallHandshake = true;

    const connecting = webBluetoothProvider.connect();
    const rejected = expect(connecting).rejects.toThrow(/paired \(bonded\)/);
    await vi.runAllTimersAsync();

    await rejected;
    expect(selected.gatt.disconnect).toHaveBeenCalled();
  });
});
