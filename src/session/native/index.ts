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

import type { LinkSession } from "../link-session";
import { openLinkSession } from "../open-link";
import type { SessionProvider, SessionTarget } from "../types";
import { firstHandshake, openTauriLink, tauri, type TauriLinkWire } from "./tauri-link";

const WIRE: TauriLinkWire = {
  open: "rynk_open",
  send: "rynk_send",
  close: "rynk_close",
  chunk: "rynk-report",
  disconnect: "rynk-disconnect",
};

interface NativeCandidate {
  path: string;
  label: string;
  serial?: string;
}

let lastCandidate: NativeCandidate | null = null;
let hasConnected = false;

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

async function listCandidates(): Promise<NativeCandidate[]> {
  try {
    return await tauri().core.invoke<NativeCandidate[]>("rynk_list");
  } catch {
    // Older desktop shells do not expose enumeration. An empty list tells the
    // app to use the shell's default-device behavior instead.
    return [];
  }
}

async function listNativeTargets(): Promise<SessionTarget[]> {
  return (await listCandidates()).map((candidate, index) => ({
    id: candidate.path,
    label: candidate.label,
    detail: candidate.serial ? `Serial ${candidate.serial}` : `USB device ${index + 1}`,
  }));
}

/**
 * On reconnect, prefer the previous serial/path but still tolerate a changed
 * hidraw path after USB re-enumeration; an explicit selection tries only that
 * path.
 */
async function connectNative(
  preferred: NativeCandidate | null = null,
  selectedPath?: string,
): Promise<LinkSession> {
  const candidates = await listCandidates();
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

  const { session, candidate: path } = await firstHandshake(paths, openSession, () =>
    candidates.length
      ? candidates.map((c) => c.serial ?? c.label).join(", ")
      : "the default interface",
  );
  lastCandidate =
    candidates.find((candidate) => candidate.path === path) ??
    (path ? { path, label: "Rynk (native)" } : null);
  hasConnected = true;
  return session;
}

function matchesCandidate(candidate: NativeCandidate, preferred: NativeCandidate): boolean {
  return preferred.serial
    ? candidate.serial === preferred.serial
    : candidate.path === preferred.path;
}

async function openSession(path?: string): Promise<LinkSession> {
  const { link, watchDisconnect } = await openTauriLink(WIRE, path ? { path } : {});
  return openLinkSession(link, { kind: "native", watchDisconnect });
}
