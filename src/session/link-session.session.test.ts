import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DeviceCapabilities,
  LightingCapabilities,
  LightingOverlayCell,
  LightingState,
  RynkClient,
} from "../vendor/rynk-wasm/rynk_wasm";
import { SessionLog } from "./diagnostics";
import { LinkSession, watchdogClient } from "./link-session";
import { EXTENSION_EFFECTS, LAYER_SCENES } from "./lighting-features";
import type { RynkByteLink } from "./rynk-link";
import { isUnsupportedError } from "./unsupported";

const caps = {
  num_rows: 1,
  num_cols: 2,
  num_layers: 1,
  bulk_transfer_supported: false,
  max_combos: 0,
  max_morse: 0,
  max_forks: 0,
  macro_space_size: 0,
} as DeviceCapabilities;

const lightingCaps = (features: number) =>
  ({ features, overlay_chunk_capacity: 2, topology_revision: 1 }) as LightingCapabilities;

const lightingState = (revision: number) => ({ revision, overlay_len: 0 }) as LightingState;

const effect = { Solid: { color: { r: 1, g: 2, b: 3 } } };
const cell = (led_id: number): LightingOverlayCell => ({ led_id, effect, ttl_ms: undefined });

/** A wasm client stand-in: every method is a spy, `next_topic` parks until
 *  the link is ended, and unlisted methods reject so a test cannot pass by
 *  accident. */
function harness(methods: Record<string, (...args: never[]) => unknown>, log?: SessionLog) {
  let endTopics: (() => void) | undefined;
  const parked = new Promise<never>((_resolve, reject) => {
    endTopics = () => reject(new Error("link died"));
  });
  const spies = Object.fromEntries(
    Object.entries(methods).map(([name, fn]) => [name, vi.fn(fn as (...a: unknown[]) => unknown)]),
  ) as Record<string, ReturnType<typeof vi.fn>>;
  const client = new Proxy(
    { next_topic: () => parked, free: vi.fn(), ...spies },
    {
      get(target, prop: string) {
        if (prop in target) return target[prop as keyof typeof target];
        return () => Promise.reject(new Error(`unexpected call ${prop}`));
      },
    },
  ) as unknown as RynkClient;
  const link: RynkByteLink = {
    label: "fake",
    send: () => Promise.resolve(),
    recv: () => parked,
    close: async () => endTopics?.(),
    end: () => endTopics?.(),
  };
  let unplug = () => {};
  const session = new LinkSession(client, link, {
    kind: "webhid",
    watchDisconnect: (handler) => {
      unplug = handler;
      return () => undefined;
    },
    requestTimeoutMs: 200,
    log: log ?? new SessionLog(),
  });
  return { session, spies, client, link, unplug: () => unplug() };
}

describe("LinkSession", () => {
  it("reads each capabilities record once per session", async () => {
    const { session, spies } = harness({
      get_capabilities: async () => caps,
      get_lighting_capabilities: async () => lightingCaps(LAYER_SCENES),
      get_key: async () => "No",
      get_lighting_scene_status: async () => ({ revision: 1, capacity: 4, scene_len: 0 }),
    });

    await session.device.capabilities();
    await session.keymap.readAll();
    await session.keymap.readAll();
    await session.lighting.scenes.sceneStatus();
    await session.lighting.scenes.sceneStatus();

    expect(spies.get_capabilities).toHaveBeenCalledTimes(1);
    expect(spies.get_lighting_capabilities).toHaveBeenCalledTimes(1);
    await session.close();
  });

  it("does not cache a capabilities read that failed", async () => {
    let attempts = 0;
    const { session, spies } = harness({
      get_capabilities: async () => {
        if (attempts++ === 0) throw new Error("transport hiccup");
        return caps;
      },
    });

    await expect(session.device.capabilities()).rejects.toThrow("transport hiccup");
    await expect(session.device.capabilities()).resolves.toEqual(caps);
    expect(spies.get_capabilities).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it("feature-gates optional lighting surfaces with an unsupported error", async () => {
    const { session, spies } = harness({
      get_lighting_capabilities: async () => lightingCaps(0),
      get_lighting_scene_status: async () => ({ revision: 1, capacity: 4, scene_len: 0 }),
    });

    const error = await session.lighting.scenes.sceneStatus().catch((e: unknown) => e);
    expect(isUnsupportedError(error)).toBe(true);
    expect(spies.get_lighting_scene_status).not.toHaveBeenCalled();
    await session.close();
  });

  it("retries a revision-pinned write once from a fresh revision", async () => {
    let revision = 1;
    const { session, spies } = harness({
      get_lighting_state: async () => lightingState(revision),
      set_lighting_state: async ({ expected_revision }: { expected_revision: number }) => {
        if (expected_revision !== 2) {
          revision = 2;
          throw new Error("StateRevisionConflict: expected 1, current 2");
        }
        return lightingState(3);
      },
    });

    await expect(
      session.lighting.setState({ output_enabled: true } as never),
    ).resolves.toMatchObject({ revision: 3 });
    expect(spies.set_lighting_state).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ expected_revision: 2 }),
    );
    await session.close();
  });

  it("surfaces a non-revision write failure without retrying", async () => {
    const { session, spies } = harness({
      get_lighting_capabilities: async () => lightingCaps(EXTENSION_EFFECTS),
      get_lighting_extension: async () => ({ revision: 4, effect_count: 0, palette_count: 0 }),
      set_lighting_extension_state: async () => {
        throw new Error("InvalidEffect");
      },
    });

    await expect(session.lighting.setExtensionState({} as never)).rejects.toThrow("InvalidEffect");
    expect(spies.set_lighting_extension_state).toHaveBeenCalledTimes(1);
    await session.close();
  });

  it("stages a replacement in chunks and aborts the transaction when a chunk fails", async () => {
    const { session, spies } = harness({
      get_lighting_capabilities: async () => lightingCaps(0),
      get_lighting_state: async () => lightingState(7),
      begin_lighting_overlay_replace: async () => ({ id: 42, cell_count: 3 }),
      put_lighting_overlay_chunk: async ({ offset }: { offset: number }) => {
        if (offset > 0) throw new Error("chunk rejected");
      },
      commit_lighting_overlay_replace: async () => lightingState(8),
      abort_lighting_overlay_replace: async () => undefined,
    });

    await expect(
      session.lighting.replaceOverlay([cell(1), cell(2), cell(3)]),
    ).rejects.toThrow("chunk rejected");
    expect(spies.begin_lighting_overlay_replace).toHaveBeenCalledWith({
      expected_revision: 7,
      cell_count: 3,
    });
    expect(spies.put_lighting_overlay_chunk).toHaveBeenNthCalledWith(1, {
      transaction_id: 42,
      offset: 0,
      cells: [cell(1), cell(2)],
    });
    expect(spies.commit_lighting_overlay_replace).not.toHaveBeenCalled();
    expect(spies.abort_lighting_overlay_replace).toHaveBeenCalledWith({ transaction_id: 42 });
    await session.close();
  });

  it("keeps successful matrix polls out of the diagnostics trace", async () => {
    const log = new SessionLog();
    const { session } = harness(
      {
        get_matrix_state: async () => ({ rows: 1, cols: 2, bitmap: [0] }),
        get_battery_status: async () => "Unavailable",
      },
      log,
    );

    await session.device.matrixState();
    await session.device.battery();

    expect(log.entries().filter((entry) => "op" in entry).map((entry) => entry.op)).toEqual([
      "get_battery_status",
    ]);
    await session.close();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("session lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("serializes whole multi-request reads before the next operation", async () => {
    const firstKey = deferred<string>();
    const { session, spies } = harness({
      get_capabilities: async () => caps,
      get_key: () => firstKey.promise,
      get_battery_status: async () => "Unavailable",
    });
    const read = session.keymap.readAll();
    const battery = session.device.battery();
    await vi.waitFor(() => expect(spies.get_key).toHaveBeenCalledOnce());
    expect(spies.get_battery_status).not.toHaveBeenCalled();
    firstKey.resolve("No");
    await read;
    await battery;
    expect(spies.get_key).toHaveBeenCalledTimes(2);
    expect(spies.get_battery_status).toHaveBeenCalledOnce();
    await session.close();
  });

  it("rejects queued work, cached reads, and remaining pages after close", async () => {
    const key = deferred<string>();
    const { session, spies, client, link } = harness({
      get_capabilities: async () => caps,
      get_key: () => key.promise,
      set_key: async () => {},
    });
    await session.device.capabilities();
    const read = session.keymap.readAll();
    const readFailed = expect(read).rejects.toThrow("Session is closed");
    const write = session.keymap.setKey(0, 0, 1, "No");
    const writeFailed = expect(write).rejects.toThrow("Session is closed");
    await vi.waitFor(() => expect(spies.get_key).toHaveBeenCalledOnce());
    const transportClosed = deferred<void>();
    vi.spyOn(link, "close").mockReturnValue(transportClosed.promise);
    const closing = session.close();
    expect(session.close()).toBe(closing);
    await expect(session.device.capabilities()).rejects.toThrow("Session is closed");
    expect(client.free).not.toHaveBeenCalled();
    key.resolve("No");
    await Promise.all([readFailed, writeFailed]);
    transportClosed.resolve();
    await closing;
    expect(spies.get_key).toHaveBeenCalledOnce();
    expect(spies.set_key).not.toHaveBeenCalled();
    expect(client.free).toHaveBeenCalledOnce();
    expect(link.close).toHaveBeenCalledOnce();
  });

  it("treats unplug as terminal even before the UI calls close", async () => {
    const { session, spies, unplug } = harness({ get_capabilities: async () => caps });
    await session.device.capabilities();
    const disconnected = vi.fn();
    session.onDisconnect(disconnected);
    unplug();
    unplug();
    await expect(session.device.capabilities()).rejects.toThrow("Session is closed");
    expect(spies.get_capabilities).toHaveBeenCalledOnce();
    expect(disconnected).toHaveBeenCalledOnce();
    await session.close();
  });

  it("stops queued traffic on a quiet request timeout and logs no late success", async () => {
    vi.useFakeTimers();
    const matrix = deferred<unknown>();
    const log = new SessionLog();
    const { session, spies } = harness({
      get_matrix_state: () => matrix.promise,
      get_battery_status: async () => "Unavailable",
    }, log);
    const disconnected = vi.fn();
    session.onDisconnect(disconnected);
    const timedOut = expect(session.device.matrixState()).rejects.toThrow("did not answer");
    const skipped = expect(session.device.battery()).rejects.toThrow("Session is closed");
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all([timedOut, skipped]);
    matrix.resolve({ rows: 1, cols: 2, bitmap: [0] });
    await session.close();
    expect(spies.get_battery_status).not.toHaveBeenCalled();
    expect(disconnected).toHaveBeenCalledOnce();
    expect(log.entries().filter((entry) => "op" in entry)).toEqual([
      expect.objectContaining({ op: "get_matrix_state", outcome: "timeout" }),
    ]);
  });

  it.each(["resolve", "reject"] as const)("logs only one result after a timed-out request later %ss", async (settle) => {
    vi.useFakeTimers();
    const request = deferred<unknown>();
    const log = new SessionLog();
    const client = watchdogClient({ get_state: () => request.promise }, {
      timeoutMs: 10, onTimeout: () => {}, log,
    });
    const timedOut = expect(client.get_state()).rejects.toThrow("did not answer");
    await vi.advanceTimersByTimeAsync(10);
    await timedOut;
    request[settle](new Error("late"));
    await Promise.resolve();
    expect(log.entries()).toEqual([expect.objectContaining({ outcome: "timeout" })]);
  });
});
