// Native backend for the Tauri desktop app: the same vendored rynk-wasm
// client as the browser transports, but raw-HID I/O lives in the Rust process
// (hidapi), because WebKitGTK/WKWebView never shipped WebHID.
//
// Wire shape (see src-tauri/src/main.rs):
// - invoke("rynk_list")  -> Candidate[] every Rynk interface, with serials
// - invoke("rynk_open")  { path? } -> { label }   opens one, starts the reader
// - invoke("rynk_send")  { bytes }      writes one frame (Rust splits reports)
// - invoke("rynk_close")                stops the reader, closes the device
// - event  "rynk-report"     number[]   one raw input report, padding included
// - event  "rynk-disconnect"            the reader saw the device vanish

import { connect } from "../../vendor/rynk-wasm/rynk_wasm";
import { LinkSession } from "../link-session";
import { RynkFrameBuffer, type RynkByteLink } from "../rynk-link";
import type { SessionProvider, SessionTarget } from "../types";
import { initWasm } from "../wasm";

interface NativeCandidate {
  path: string;
  label: string;
  serial?: string;
}

interface NativeOpenResult {
  label: string;
}

let lastCandidate: NativeCandidate | null = null;
let hasConnected = false;

function tauri(): TauriGlobal {
  const t = window.__TAURI__;
  if (!t) throw new Error("Tauri runtime is not available");
  return t;
}

interface NativeLink {
  link: RynkByteLink;
  /** Register the single unplug callback (LinkSession's watchDisconnect). */
  onUnplug(handler: (() => void) | null): void;
}

async function openNativeLink(path?: string): Promise<NativeLink> {
  const t = tauri();
  const buffer = new RynkFrameBuffer();
  let unplugHandler: (() => void) | null = null;
  // Subscribe before opening so no report can slip past the listener.
  const unlistenReport = await t.event.listen<number[]>("rynk-report", (event) => {
    buffer.push(Uint8Array.from(event.payload));
  });
  const unlistenDisconnect = await t.event.listen<void>("rynk-disconnect", () => {
    buffer.end();
    unplugHandler?.();
  });
  const unlisten = () => {
    unlistenReport();
    unlistenDisconnect();
  };
  let opened: NativeOpenResult;
  try {
    opened = await t.core.invoke<NativeOpenResult>("rynk_open", path ? { path } : {});
  } catch (error) {
    unlisten();
    throw error;
  }
  return {
    link: {
      label: opened.label,
      send: (bytes) => t.core.invoke<void>("rynk_send", { bytes: Array.from(bytes) }),
      recv: () => buffer.recv(),
      async close() {
        buffer.end();
        unlisten();
        await t.core.invoke<void>("rynk_close").catch(() => undefined);
      },
      end: () => buffer.end(),
    },
    onUnplug(handler) {
      unplugHandler = handler;
    },
  };
}

export const nativeProvider: SessionProvider = {
  kind: "native",
  title: "USB (native)",
  description: "Connect to a Rynk keyboard over USB through the desktop app's HID backend.",
  available: () => typeof window !== "undefined" && window.__TAURI__ !== undefined,
  listTargets: listNativeTargets,
  connect: (targetId) => connectNative(null, targetId),
  reconnect: () => {
    if (!hasConnected) throw new Error("No native keyboard has been connected yet");
    return connectNative(lastCandidate);
  },
};

async function listNativeTargets(): Promise<SessionTarget[]> {
  let candidates: NativeCandidate[];
  try {
    candidates = await tauri().core.invoke<NativeCandidate[]>("rynk_list");
  } catch {
    // Older desktop shells do not expose enumeration. An empty list tells the
    // app to use the shell's default-device behavior instead.
    return [];
  }
  return candidates.map((candidate, index) => ({
    id: candidate.path,
    label: candidate.label,
    detail: candidate.serial ? `Serial ${candidate.serial}` : `USB device ${index + 1}`,
  }));
}

/**
 * Two keyboards of the same model expose identical labels, and only a
 * completed handshake proves which interface is a usable Rynk peer. On
 * reconnect, prefer the previous serial/path but still tolerate a changed
 * hidraw path after USB re-enumeration.
 */
async function connectNative(
  preferred: NativeCandidate | null = null,
  selectedPath?: string,
): Promise<LinkSession> {
  const t = tauri();
  let candidates: NativeCandidate[] = [];
  try {
    candidates = await t.core.invoke<NativeCandidate[]>("rynk_list");
  } catch {
    // An older desktop shell has no rynk_list; fall back to its own choice.
  }
  if (preferred && !selectedPath) {
    candidates.sort(
      (a, b) =>
        Number(matchesCandidate(b, preferred)) - Number(matchesCandidate(a, preferred)),
    );
  }
  const paths: (string | undefined)[] = selectedPath
    ? [selectedPath]
    : candidates.length
      ? candidates.map((candidate) => candidate.path)
      : [undefined];

  let failure: unknown;
  for (const path of paths) {
    try {
      const session = await openSession(path);
      lastCandidate =
        candidates.find((candidate) => candidate.path === path) ??
        (path ? { path, label: "Rynk (native)" } : null);
      hasConnected = true;
      return session;
    } catch (error) {
      failure ??= error;
    }
  }
  throw failure instanceof Error
    ? new Error(
        `No Rynk interface completed the handshake (tried ${describe(candidates)}): ${failure.message}`,
      )
    : failure;
}

function matchesCandidate(candidate: NativeCandidate, preferred: NativeCandidate): boolean {
  return preferred.serial
    ? candidate.serial === preferred.serial
    : candidate.path === preferred.path;
}

function describe(candidates: NativeCandidate[]): string {
  if (!candidates.length) return "the default interface";
  return candidates.map((c) => c.serial ?? c.label).join(", ");
}

async function openSession(path?: string): Promise<LinkSession> {
  const { link, onUnplug } = await openNativeLink(path);
  try {
    await initWasm();
    const client = await connect(link);
    return new LinkSession(client, link, {
      kind: "native",
      watchDisconnect(handler) {
        onUnplug(handler);
        return () => onUnplug(null);
      },
    });
  } catch (error) {
    await link.close().catch(() => undefined);
    throw error;
  }
}
