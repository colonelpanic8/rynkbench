// Bluetooth backend for the Tauri desktop app: the same vendored rynk-wasm
// client as every other transport, with GATT I/O in the Rust process (bluest),
// because WebKitGTK/WKWebView shipped neither WebHID nor Web Bluetooth.
//
// Unlike the HID backends this is a plain byte stream — no 32-byte reports, no
// padding — so it feeds the wasm deframer the way the Web Serial backend does.
//
// Wire shape (see src-tauri/src/ble.rs):
// - invoke("rynk_ble_list")  -> BleCandidate[] connected devices exposing Rynk
// - invoke("rynk_ble_open")  { id? } -> { label }  attaches, starts the reader
// - invoke("rynk_ble_send")  { bytes }   writes one frame (Rust chunks it)
// - invoke("rynk_ble_close")             unsubscribes and detaches
// - event  "rynk-ble-chunk"      number[]  one notification payload
// - event  "rynk-ble-disconnect"           the link died

import { connect } from "../../vendor/rynk-wasm/rynk_wasm";
import { LinkSession } from "../link-session";
import { RynkFrameBuffer, type RynkByteLink } from "../rynk-link";
import type { SessionProvider } from "../types";
import { initWasm } from "../wasm";

interface BleCandidate {
  id: string;
  label: string;
}

interface BleOpenResult {
  label: string;
}

let lastId: string | null = null;
let hasConnected = false;

function tauri(): TauriGlobal {
  const t = window.__TAURI__;
  if (!t) throw new Error("Tauri runtime is not available");
  return t;
}

interface BleLink {
  link: RynkByteLink;
  /** Register the single link-loss callback (LinkSession's watchDisconnect). */
  onDrop(handler: (() => void) | null): void;
}

async function openBleLink(id?: string): Promise<BleLink> {
  const t = tauri();
  const buffer = new RynkFrameBuffer();
  let dropHandler: (() => void) | null = null;
  // Subscribe before opening so no notification can slip past the listener.
  const unlistenChunk = await t.event.listen<number[]>("rynk-ble-chunk", (event) => {
    buffer.push(Uint8Array.from(event.payload));
  });
  const unlistenDisconnect = await t.event.listen<void>("rynk-ble-disconnect", () => {
    buffer.end();
    dropHandler?.();
  });
  const unlisten = () => {
    unlistenChunk();
    unlistenDisconnect();
  };
  let opened: BleOpenResult;
  try {
    opened = await t.core.invoke<BleOpenResult>("rynk_ble_open", id ? { id } : {});
  } catch (error) {
    unlisten();
    throw error;
  }
  return {
    link: {
      label: opened.label,
      send: (bytes) => t.core.invoke<void>("rynk_ble_send", { bytes: Array.from(bytes) }),
      recv: () => buffer.recv(),
      async close() {
        buffer.end();
        unlisten();
        await t.core.invoke<void>("rynk_ble_close").catch(() => undefined);
      },
      end: () => buffer.end(),
    },
    onDrop(handler) {
      dropHandler = handler;
    },
  };
}

export const nativeBleProvider: SessionProvider = {
  kind: "nativeble",
  title: "Bluetooth (native)",
  description:
    "Connect to an already-paired Rynk keyboard over Bluetooth LE through the desktop app.",
  available: () => typeof window !== "undefined" && window.__TAURI__ !== undefined,
  connect: () => connectBle(),
  reconnect: () => {
    if (!hasConnected) throw new Error("No Bluetooth keyboard has been connected yet");
    return connectBle(lastId);
  },
};

/**
 * Only a completed handshake proves a device is a usable Rynk peer, so try
 * every connected candidate. On reconnect the previous device goes first, but
 * a keyboard that re-bonded under a new adapter handle still gets a turn.
 */
async function connectBle(preferredId: string | null = null): Promise<LinkSession> {
  const t = tauri();
  const candidates = await t.core.invoke<BleCandidate[]>("rynk_ble_list");
  if (!candidates.length) {
    throw new Error(
      "No connected Rynk keyboard found over Bluetooth. Pair and connect it first — " +
        "the desktop app attaches to an already-connected device rather than scanning.",
    );
  }
  if (preferredId) {
    candidates.sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId));
  }

  let failure: unknown;
  for (const candidate of candidates) {
    try {
      const session = await openSession(candidate.id);
      lastId = candidate.id;
      hasConnected = true;
      return session;
    } catch (error) {
      failure ??= error;
    }
  }
  throw failure instanceof Error
    ? new Error(
        `No Bluetooth device completed the handshake (tried ${describe(candidates)}): ${failure.message}`,
      )
    : failure;
}

function describe(candidates: BleCandidate[]): string {
  return candidates.map((candidate) => candidate.label).join(", ");
}

async function openSession(id: string): Promise<LinkSession> {
  const { link, onDrop } = await openBleLink(id);
  try {
    await initWasm();
    const client = await connect(link);
    return new LinkSession(client, link, {
      kind: "nativeble",
      watchDisconnect(handler) {
        onDrop(handler);
        return () => onDrop(null);
      },
    });
  } catch (error) {
    await link.close().catch(() => undefined);
    throw error;
  }
}
