import { afterEach, describe, expect, it, vi } from "vitest";
import { openTauriLink, type TauriLinkWire } from "./tauri-link";

const wire: TauriLinkWire = {
  open: "open", send: "send", close: "close", chunk: "chunk", disconnect: "disconnect",
};

afterEach(() => vi.unstubAllGlobals());

describe("Tauri link setup cleanup", () => {
  it("removes the chunk listener when subscribing to disconnect fails", async () => {
    const unlisten = vi.fn();
    const invoke = vi.fn();
    const listen = vi.fn()
      .mockResolvedValueOnce(unlisten)
      .mockRejectedValueOnce(new Error("subscription failed"));
    vi.stubGlobal("window", { __TAURI__: { core: { invoke }, event: { listen } } });

    await expect(openTauriLink(wire, {})).rejects.toThrow("subscription failed");

    expect(unlisten).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("removes both listeners when opening the device fails", async () => {
    const unlistenChunk = vi.fn();
    const unlistenDisconnect = vi.fn();
    const invoke = vi.fn().mockRejectedValue(new Error("device unavailable"));
    const listen = vi.fn()
      .mockResolvedValueOnce(unlistenChunk)
      .mockResolvedValueOnce(unlistenDisconnect);
    vi.stubGlobal("window", { __TAURI__: { core: { invoke }, event: { listen } } });

    await expect(openTauriLink(wire, {})).rejects.toThrow("device unavailable");

    expect(unlistenChunk).toHaveBeenCalledOnce();
    expect(unlistenDisconnect).toHaveBeenCalledOnce();
  });
});
