import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../vendor/rynk-wasm/rynk_wasm", () => ({
  connect: (link: { label: string }) => Promise.resolve({ label: link.label }),
}));
vi.mock("../wasm", () => ({ initWasm: () => Promise.resolve() }));
vi.mock("../link-session", () => ({
  LinkSession: class {
    readonly client: { label: string };
    constructor(client: { label: string }) {
      this.client = client;
    }
  },
}));

const { nativeBleProvider } = await import("./index");

function withTauri(invoke: ReturnType<typeof vi.fn>) {
  (globalThis as { window?: unknown }).window = {
    __TAURI__: {
      core: { invoke },
      event: { listen: () => Promise.resolve(() => undefined) },
    },
  };
}

describe("native BLE provider", () => {
  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("prefers the previously connected device on reconnect", async () => {
    const lists = [
      [{ id: "Device(1)", label: "Glove80" }],
      [
        { id: "Device(9)", label: "Other board" },
        { id: "Device(1)", label: "Glove80" },
      ],
    ];
    const openedIds: unknown[] = [];
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === "rynk_ble_list") return Promise.resolve(lists.shift() ?? []);
      if (command === "rynk_ble_open") {
        openedIds.push(args?.id);
        return Promise.resolve({ label: "Glove80" });
      }
      return Promise.resolve(undefined);
    });
    withTauri(invoke);

    await nativeBleProvider.connect();
    await nativeBleProvider.reconnect();

    expect(openedIds).toEqual(["Device(1)", "Device(1)"]);
  });

  it("explains that the keyboard must already be connected", async () => {
    withTauri(vi.fn(() => Promise.resolve([])));

    await expect(nativeBleProvider.connect()).rejects.toThrow(/already-connected|connect it first/i);
  });
});
