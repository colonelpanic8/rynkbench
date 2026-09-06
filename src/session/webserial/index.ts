// Web Serial backend for upstream RMK's USB CDC-ACM Rynk transport.
// Chromium-only; the selected port carries the same Rynk byte stream as every
// other backend, so protocol handling remains in LinkSession and rynk-wasm.

import { openLinkSession } from "../open-link";
import type { SessionProvider } from "../types";
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
  return openLinkSession(
    link,
    {
      kind: "webserial",
      watchDisconnect(onUnplug) {
        const handler = (event: Event) => {
          const serialEvent = event as Event & { port?: SerialPort };
          if (event.target === port || serialEvent.port === port) onUnplug();
        };
        navigator.serial.addEventListener("disconnect", handler);
        return () => navigator.serial.removeEventListener("disconnect", handler);
      },
    },
    // The chooser is unfiltered, so the most likely silent port is simply
    // not a Rynk one.
    { handshakeHint: "check that the selected port is the keyboard's Rynk serial interface" },
  );
}
