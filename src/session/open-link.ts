// The one way a transport turns a byte link into a session: load the wasm
// driver, run the Rynk handshake under a deadline, wrap the client in a
// LinkSession. Every transport used to carry its own copy of this sequence,
// and only two of them bounded the handshake — a keyboard that never answers
// (wrong interface, unencrypted BLE link) hung the others forever.

import { connect } from "../vendor/rynk-wasm/rynk_wasm";
import { LinkSession, REQUEST_TIMEOUT_MS, type LinkSessionHooks } from "./link-session";
import type { RynkByteLink } from "./rynk-link";
import { initWasm } from "./wasm";

export interface OpenLinkOptions {
  /** Bound on the protocol handshake. Defaults to REQUEST_TIMEOUT_MS. */
  handshakeTimeoutMs?: number;
  /** Transport-specific advice appended to the handshake-timeout error. */
  handshakeHint?: string;
}

/** Open a session over `link`, closing the link if anything before the
 *  session exists fails. */
export async function openLinkSession(
  link: RynkByteLink,
  hooks: LinkSessionHooks,
  options: OpenLinkOptions = {},
): Promise<LinkSession> {
  try {
    await initWasm();
    const client = await handshake(link, options);
    return new LinkSession(client, link, hooks);
  } catch (error) {
    await link.close().catch(() => undefined);
    throw error;
  }
}

async function handshake(link: RynkByteLink, options: OpenLinkOptions) {
  const timeoutMs = options.handshakeTimeoutMs ?? REQUEST_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      connect(link),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          link.end();
          const hint = options.handshakeHint ? ` — ${options.handshakeHint}` : "";
          reject(new Error(`No Rynk response from ${link.label} within ${timeoutMs}ms${hint}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
