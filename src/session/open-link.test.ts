import { afterEach, describe, expect, it, vi } from "vitest";
import type { RynkByteLink } from "./rynk-link";

let stallHandshake = false;

vi.mock("../vendor/rynk-wasm/rynk_wasm", () => ({
  connect: (link: { label: string }) =>
    stallHandshake ? new Promise(() => {}) : Promise.resolve({ label: link.label }),
}));
vi.mock("./wasm", () => ({ initWasm: () => Promise.resolve() }));
vi.mock("./link-session", () => ({
  REQUEST_TIMEOUT_MS: 5_000,
  LinkSession: class {
    client: { label: string };
    constructor(client: { label: string }) {
      this.client = client;
    }
  },
}));

const { openLinkSession } = await import("./open-link");

function link() {
  const close = vi.fn(() => Promise.resolve());
  const end = vi.fn();
  const byteLink: RynkByteLink = {
    label: "Board",
    send: () => Promise.resolve(),
    recv: () => new Promise(() => {}),
    close,
    end,
  };
  return { byteLink, close, end };
}

const hooks = { kind: "webhid" as const, watchDisconnect: () => () => undefined };

describe("openLinkSession", () => {
  afterEach(() => {
    stallHandshake = false;
    vi.useRealTimers();
  });

  it("hands the handshaken client to a session", async () => {
    const { byteLink, close } = link();
    const session = (await openLinkSession(byteLink, hooks)) as unknown as {
      client: { label: string };
    };
    expect(session.client.label).toBe("Board");
    expect(close).not.toHaveBeenCalled();
  });

  it("bounds the handshake, ends the link, and names the transport's hint", async () => {
    vi.useFakeTimers();
    stallHandshake = true;
    const { byteLink, close, end } = link();

    const opening = openLinkSession(byteLink, hooks, {
      handshakeTimeoutMs: 50,
      handshakeHint: "check the cable",
    });
    const rejected = expect(opening).rejects.toThrow(
      "No Rynk response from Board within 50ms — check the cable",
    );
    await vi.runAllTimersAsync();

    await rejected;
    expect(end).toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
