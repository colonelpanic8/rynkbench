// WebHID backend: the vendored rynk-wasm client over a raw-HID byte link.
// Chromium-only — WebHID has not shipped in Firefox or Safari.

import wasmInit, { connect } from "../../vendor/rynk-wasm/rynk_wasm";
import type { SessionProvider } from "../types";
import { hidByteLink, openRynkHidDevice } from "./link";
import { WebHidSession } from "./session";

let wasmReady: Promise<unknown> | null = null;

function initWasm(): Promise<unknown> {
  wasmReady ??= wasmInit().catch((error: unknown) => {
    wasmReady = null; // failed init is retryable on the next connect
    throw error;
  });
  return wasmReady;
}

export const webHidProvider: SessionProvider = {
  kind: "webhid",
  title: "USB (WebHID)",
  description:
    "Connect to a Rynk keyboard over USB. Requires a Chromium-based browser (Chrome, Edge).",
  available: () => typeof navigator !== "undefined" && "hid" in navigator,
  async connect() {
    // Called from a user gesture: the picker must open before any await on
    // wasm init would burn the gesture.
    const device = await openRynkHidDevice();
    const link = hidByteLink(device);
    try {
      await initWasm();
      const client = await connect(link);
      return new WebHidSession(client, link, device);
    } catch (error) {
      await link.close().catch(() => undefined);
      throw error;
    }
  },
};
