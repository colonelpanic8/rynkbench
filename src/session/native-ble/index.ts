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

import type { LinkSession } from "../link-session";
import { openLinkSession } from "../open-link";
import { firstHandshake, openTauriLink, tauri, type TauriLinkWire } from "../native/tauri-link";
import type { SessionProvider } from "../types";

const WIRE: TauriLinkWire = {
  open: "rynk_ble_open",
  send: "rynk_ble_send",
  close: "rynk_ble_close",
  chunk: "rynk-ble-chunk",
  disconnect: "rynk-ble-disconnect",
};

interface BleCandidate {
  id: string;
  label: string;
}

let lastId: string | null = null;
let hasConnected = false;

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

/** On reconnect the previous device goes first, but a keyboard that re-bonded
 *  under a new adapter handle still gets a turn. */
async function connectBle(preferredId: string | null = null): Promise<LinkSession> {
  const candidates = await tauri().core.invoke<BleCandidate[]>("rynk_ble_list");
  if (!candidates.length) {
    throw new Error(
      "No connected Rynk keyboard found over Bluetooth. Pair and connect it first — " +
        "the desktop app attaches to an already-connected device rather than scanning.",
    );
  }
  if (preferredId) {
    candidates.sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId));
  }
  const { session, candidate } = await firstHandshake(
    candidates,
    (c) => openSession(c.id),
    () => candidates.map((c) => c.label).join(", "),
  );
  lastId = candidate.id;
  hasConnected = true;
  return session;
}

async function openSession(id: string): Promise<LinkSession> {
  const { link, watchDisconnect } = await openTauriLink(WIRE, { id });
  return openLinkSession(link, { kind: "nativeble", watchDisconnect });
}
