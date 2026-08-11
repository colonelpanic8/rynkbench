// WebHID backend: the vendored rynk-wasm client over a raw-HID byte link.
// Chromium-only — WebHID has not shipped in Firefox or Safari.

import { connect } from "../../vendor/rynk-wasm/rynk_wasm";
import { LinkSession } from "../link-session";
import type { SessionProvider } from "../types";
import { initWasm } from "../wasm";
import { hidByteLink, openRynkHidDevice, requestRynkDevice } from "./link";

let lastDevice: HIDDevice | null = null;

export const webHidProvider: SessionProvider = {
  kind: "webhid",
  title: "USB (WebHID)",
  description:
    "Connect to a Rynk keyboard over USB. Requires a Chromium-based browser (Chrome, Edge).",
  available: () => typeof navigator !== "undefined" && "hid" in navigator,
  async connect() {
    // Always let Chromium choose the physical keyboard. Reusing the first
    // grant is ambiguous as soon as two compatible boards are connected.
    // requestDevice must remain the first await so the click's user activation
    // is still available to the browser-owned chooser.
    return await rememberedSession(await requestRynkDevice());
  },
  async reconnect() {
    if (!lastDevice) throw new Error("No WebHID keyboard has been connected yet");
    // Do not reject or prompt for a device here. A transient USB loss is
    // expected during recovery, and the app will retry this exact grant.
    return rememberedSession(lastDevice);
  },
};

async function rememberedSession(device: HIDDevice) {
  const connected = await session(device);
  lastDevice = device;
  return connected;
}

async function session(device: HIDDevice) {
  await openRynkHidDevice(device);
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
}
