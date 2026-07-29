import { beforeEach, describe, expect, it, vi } from "vitest";
import { RYNK_USAGE, RYNK_USAGE_PAGE } from "../rynk-link";

// The handshake is what distinguishes two keyboards of the same model, so the
// wasm client stands in for it: `handshakes` decides which links connect.
const handshakes = new Set<string>();

vi.mock("../../vendor/rynk-wasm/rynk_wasm", () => ({
  connect: (link: { label: string }) =>
    handshakes.has(link.label)
      ? Promise.resolve({ label: link.label })
      : Promise.reject(new Error("protocol mismatch")),
}));
vi.mock("../wasm", () => ({ initWasm: () => Promise.resolve() }));
vi.mock("../link-session", () => ({
  LinkSession: class {
    client: { label: string };
    constructor(client: { label: string }) {
      this.client = client;
    }
  },
}));

const { webHidProvider } = await import("./index");

function device(productName: string): HIDDevice {
  const listeners: unknown[] = [];
  return {
    productName,
    opened: false,
    collections: [{ usagePage: RYNK_USAGE_PAGE, usage: RYNK_USAGE }],
    open() {
      (this as { opened: boolean }).opened = true;
      return Promise.resolve();
    },
    close: () => Promise.resolve(),
    sendReport: () => Promise.resolve(),
    addEventListener: (_: string, fn: unknown) => listeners.push(fn),
    removeEventListener: () => undefined,
  } as unknown as HIDDevice;
}

function install(granted: HIDDevice[], picked?: HIDDevice) {
  const requestDevice = vi.fn(() => Promise.resolve(picked ? [picked] : []));
  (globalThis as { navigator?: unknown }).navigator = {
    hid: {
      getDevices: () => Promise.resolve(granted),
      requestDevice,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  };
  return requestDevice;
}

describe("WebHID provider device selection", () => {
  beforeEach(() => {
    handshakes.clear();
    delete (globalThis as { navigator?: unknown }).navigator;
  });

  /// The case that made rynkbench unusable with a second keyboard attached:
  /// the wrong grant sorts first and the old code opened it and stopped.
  it("skips a granted device that cannot handshake and uses the one that can", async () => {
    const stale = device("Glove80 (old firmware)");
    const working = device("Glove80");
    handshakes.add("Glove80");
    const requestDevice = install([stale, working]);

    const session = (await webHidProvider.connect()) as unknown as { client: { label: string } };

    expect(session.client.label).toBe("Glove80");
    // No picker: recovery is automatic once both devices are granted.
    expect(requestDevice).not.toHaveBeenCalled();
  });

  it("prompts when nothing is granted yet", async () => {
    const working = device("Glove80");
    handshakes.add("Glove80");
    const requestDevice = install([], working);

    const session = (await webHidProvider.connect()) as unknown as { client: { label: string } };

    expect(session.client.label).toBe("Glove80");
    expect(requestDevice).toHaveBeenCalledOnce();
  });

  /// A sole bad grant cannot be replaced in the same user gesture, so the
  /// attempt has to fail — but it must rule that device out, or the next
  /// click would retry it forever and never reach the picker.
  it("rules out a failing grant so the next attempt reaches the picker", async () => {
    const stale = device("Glove80 (old firmware)");
    const working = device("Glove80");
    install([stale]);

    await expect(webHidProvider.connect()).rejects.toThrow(/choose a different one/);

    handshakes.add("Glove80");
    const requestDevice = install([stale], working);
    const session = (await webHidProvider.connect()) as unknown as { client: { label: string } };

    expect(session.client.label).toBe("Glove80");
    expect(requestDevice).toHaveBeenCalledOnce();
  });
});
