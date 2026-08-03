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

const { nativeProvider } = await import("./index");

describe("native provider reconnect", () => {
  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("prefers the previously connected serial after HID re-enumeration", async () => {
    const lists = [
      [{ path: "/dev/hidraw1", label: "Glove80", serial: "wanted" }],
      [
        { path: "/dev/hidraw2", label: "Other board", serial: "other" },
        { path: "/dev/hidraw7", label: "Glove80", serial: "wanted" },
      ],
    ];
    const openedPaths: unknown[] = [];
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === "rynk_list") return Promise.resolve(lists.shift() ?? []);
      if (command === "rynk_open") {
        openedPaths.push(args?.path);
        return Promise.resolve({ label: "Glove80" });
      }
      return Promise.resolve(undefined);
    });
    (globalThis as { window?: unknown }).window = {
      __TAURI__: {
        core: { invoke },
        event: { listen: () => Promise.resolve(() => undefined) },
      },
    };

    await nativeProvider.connect();
    await nativeProvider.reconnect();

    expect(openedPaths).toEqual(["/dev/hidraw1", "/dev/hidraw7"]);
  });
});
