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

const { webSerialProvider } = await import("./index");

function port() {
  const close = vi.fn(() => Promise.resolve());
  return {
    readable: new ReadableStream(),
    writable: new WritableStream(),
    open: () => Promise.resolve(),
    close,
    getInfo: () => ({ usbVendorId: 0x4c4b, usbProductId: 0x4643 }),
  } as unknown as SerialPort & { close: typeof close };
}

function install(selected: SerialPort) {
  let disconnect: ((event: Event) => void) | null = null;
  const requestPort = vi.fn(() => {
    order.push("picker");
    return Promise.resolve(selected);
  });
  (globalThis as { navigator?: unknown }).navigator = {
    serial: {
      requestPort,
      addEventListener: (_type: string, handler: (event: Event) => void) => {
        disconnect = handler;
      },
      removeEventListener: () => undefined,
    },
  };
  return {
    requestPort,
    disconnect: () => disconnect?.({ target: selected } as unknown as Event),
  };
}

describe("Web Serial provider", () => {
  beforeEach(() => {
    order.length = 0;
    failHandshake = false;
    stallHandshake = false;
    unplugged = false;
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  afterEach(() => vi.useRealTimers());

  it("opens the browser chooser before loading wasm and handshaking", async () => {
    const selected = port();
    const { requestPort, disconnect } = install(selected);

    const session = (await webSerialProvider.connect()) as unknown as {
      client: { label: string };
    };

    expect(requestPort).toHaveBeenCalledOnce();
    expect(order).toEqual(["picker", "wasm", "handshake"]);
    expect(session.client.label).toBe("USB 4c4b:4643 (Web Serial)");

    disconnect();
    expect(unplugged).toBe(true);
  });

  it("reconnects the selected port without reopening the chooser", async () => {
    const selected = port();
    const { requestPort } = install(selected);
    const original = await webSerialProvider.connect();
    await original.close();

    await webSerialProvider.reconnect();

    expect(requestPort).toHaveBeenCalledOnce();
  });

  it("closes the serial port when the Rynk handshake fails", async () => {
    const selected = port();
    install(selected);
    failHandshake = true;

    await expect(webSerialProvider.connect()).rejects.toThrow("protocol mismatch");
    expect(selected.close).toHaveBeenCalledOnce();
  });

  it("times out a selected serial port that never answers", async () => {
    vi.useFakeTimers();
    const selected = port();
    install(selected);
    stallHandshake = true;

    const connecting = webSerialProvider.connect();
    const rejected = expect(connecting).rejects.toThrow(/No Rynk response/);
    await vi.runAllTimersAsync();

    await rejected;
    expect(selected.close).toHaveBeenCalledOnce();
  });
});
