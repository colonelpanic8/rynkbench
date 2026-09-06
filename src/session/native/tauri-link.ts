// What the two desktop transports share: a byte link whose I/O lives in the
// Rust process. The webview subscribes to one event per inbound chunk and one
// for link loss, and drives the device through three invoke commands. HID
// and BLE differ only in the command and event names.

import type { LinkSession, LinkSessionHooks } from "../link-session";
import { RynkFrameBuffer, type RynkByteLink } from "../rynk-link";

export interface TauriLinkWire {
  /** invoke: open the device (args are transport-specific), returns { label }. */
  open: string;
  /** invoke: { bytes: number[] } — one frame; Rust splits or chunks it. */
  send: string;
  /** invoke: stop the reader and release the device. */
  close: string;
  /** event: number[] — one inbound chunk, padding included. */
  chunk: string;
  /** event: the reader saw the device vanish. */
  disconnect: string;
}

export interface TauriLink {
  link: RynkByteLink;
  /** LinkSession's disconnect hook, wired to the transport's loss event. */
  watchDisconnect: LinkSessionHooks["watchDisconnect"];
}

export function tauri(): TauriGlobal {
  const t = window.__TAURI__;
  if (!t) throw new Error("Tauri runtime is not available");
  return t;
}

export async function openTauriLink(
  wire: TauriLinkWire,
  args: Record<string, unknown>,
): Promise<TauriLink> {
  const t = tauri();
  const buffer = new RynkFrameBuffer();
  let onDrop: (() => void) | null = null;
  // Subscribe before opening so no chunk can slip past the listener.
  const unlistenChunk = await t.event.listen<number[]>(wire.chunk, (event) => {
    buffer.push(Uint8Array.from(event.payload));
  });
  const unlistenDisconnect = await t.event.listen<void>(wire.disconnect, () => {
    buffer.end();
    onDrop?.();
  });
  const unlisten = () => {
    unlistenChunk();
    unlistenDisconnect();
  };
  let opened: { label: string };
  try {
    opened = await t.core.invoke<{ label: string }>(wire.open, args);
  } catch (error) {
    unlisten();
    throw error;
  }
  return {
    link: {
      label: opened.label,
      send: (bytes) => t.core.invoke<void>(wire.send, { bytes: Array.from(bytes) }),
      recv: () => buffer.recv(),
      async close() {
        buffer.end();
        unlisten();
        await t.core.invoke<void>(wire.close).catch(() => undefined);
      },
      end: () => buffer.end(),
    },
    watchDisconnect(handler) {
      onDrop = handler;
      return () => {
        onDrop = null;
      };
    },
  };
}

/**
 * Only a completed handshake proves a candidate is a usable Rynk peer — two
 * keyboards of one model expose identical labels — so try each in order and
 * keep the first that answers. The first failure is what gets reported: a
 * later candidate's error is usually just "not a Rynk device".
 */
export async function firstHandshake<T>(
  candidates: T[],
  open: (candidate: T) => Promise<LinkSession>,
  describe: () => string,
): Promise<{ session: LinkSession; candidate: T }> {
  let failure: unknown;
  for (const candidate of candidates) {
    try {
      return { session: await open(candidate), candidate };
    } catch (error) {
      failure ??= error;
    }
  }
  throw failure instanceof Error
    ? new Error(`No Rynk interface completed the handshake (tried ${describe()}): ${failure.message}`)
    : failure;
}
