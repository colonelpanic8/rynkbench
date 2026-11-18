import { describe, expect, it, vi } from "vitest";
import { mockProvider } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import { openBundle } from "./bundle";

// The order things happen in: the wasm modules must be loaded before the board
// is read, so no screen can call into them before they are ready.
const order = vi.hoisted(() => [] as string[]);
vi.mock("../config/document", async (original) => ({
  ...(await original<typeof import("../config/document")>()),
  initConfigWasm: () => {
    order.push("wasm");
    return Promise.resolve();
  },
}));

describe("opening a board", () => {
  it("loads both wasm modules before anything is read, for a simulated board too", async () => {
    const session = await mockProvider(glove80Board).connect();
    const info = session.device.info.bind(session.device);
    vi.spyOn(session.device, "info").mockImplementation(() => {
      order.push("read");
      return info();
    });
    try {
      await openBundle(session);
    } finally {
      await session.close();
    }
    expect(order[0]).toBe("wasm");
    expect(order).toContain("read");
  });
});
