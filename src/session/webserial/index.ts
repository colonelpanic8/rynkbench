// Web Serial backend for upstream RMK's USB CDC-ACM Rynk transport.
// Chromium-only; the selected port carries the same Rynk byte stream as every
// other backend, so protocol handling remains in LinkSession and rynk-wasm.

import { connect } from "../../vendor/rynk-wasm/rynk_wasm";
import { LinkSession, REQUEST_TIMEOUT_MS } from "../link-session";
import type { SessionProvider } from "../types";
import { initWasm } from "../wasm";
import { requestRynkSerialPort, serialByteLink } from "./link";

let lastPort: SerialPort | null = null;

export const webSerialProvider: SessionProvider = {
  kind: "webserial",
  title: "USB (Web Serial)",
  description:
    "Connect to an upstream RMK keyboard over its Rynk serial port. Requires Chrome or Edge.",
  available: () => typeof navigator !== "undefined" && "serial" in navigator,
  async connect() {
    // requestPort must run before any await that would consume the click's user
    // activation. The chooser is intentionally unfiltered because RMK boards
    // do not share a vendor/product id.
    return rememberedSession(await requestRynkSerialPort());
  },
  async reconnect() {
    if (!lastPort) throw new Error("No Web Serial keyboard has been connected yet");
    // Reusing the granted SerialPort is permitted without a user gesture and
    // avoids opening a chooser while the workbench is recovering.
    return rememberedSession(lastPort);
  },
};

async function rememberedSession(port: SerialPort) {
  const connected = await session(port);
  lastPort = port;
  return connected;
}

async function session(port: SerialPort) {
  const link = await serialByteLink(port);
  try {
    await initWasm();
    const client = await handshake(link);
    return new LinkSession(client, link, {
      kind: "webserial",
      watchDisconnect(onUnplug) {
        const handler = (event: Event) => {
          const serialEvent = event as Event & { port?: SerialPort };
          if (event.target === port || serialEvent.port === port) onUnplug();
        };
        navigator.serial.addEventListener("disconnect", handler);
        return () => navigator.serial.removeEventListener("disconnect", handler);
      },
    });
  } catch (error) {
    await link.close().catch(() => undefined);
    throw error;
  }
}

async function handshake(link: Awaited<ReturnType<typeof serialByteLink>>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      connect(link),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          link.end();
          reject(
            new Error(
              `No Rynk response from the selected serial port within ${REQUEST_TIMEOUT_MS}ms`,
            ),
          );
        }, REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
