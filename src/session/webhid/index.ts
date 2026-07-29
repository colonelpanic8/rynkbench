// WebHID backend: the vendored rynk-wasm client over a raw-HID byte link.
// Chromium-only — WebHID has not shipped in Firefox or Safari.

import { connect } from "../../vendor/rynk-wasm/rynk_wasm";
import { LinkSession } from "../link-session";
import type { SessionProvider } from "../types";
import { initWasm } from "../wasm";
import { hidByteLink, openRynkHidDevice } from "./link";

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
      return new LinkSession(client, link, {
        kind: "webhid",
        watchDisconnect(onUnplug) {
          const handler = (ev: { device: HIDDevice }) => {
            if (ev.device === device) onUnplug();
          };
          navigator.hid.addEventListener("disconnect", handler);
          return () => navigator.hid.removeEventListener("disconnect", handler);
        },
      });
    } catch (error) {
      await link.close().catch(() => undefined);
      throw error;
    }
  },
};
