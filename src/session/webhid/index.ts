// WebHID backend: the vendored rynk-wasm client over a raw-HID byte link.
// Chromium-only — WebHID has not shipped in Firefox or Safari.

import { connect } from "../../vendor/rynk-wasm/rynk_wasm";
import { LinkSession } from "../link-session";
import type { SessionProvider } from "../types";
import { initWasm } from "../wasm";
import {
  grantedRynkDevices,
  hidByteLink,
  openRynkHidDevice,
  rejectRynkDevice,
  requestRynkDevice,
} from "./link";

export const webHidProvider: SessionProvider = {
  kind: "webhid",
  title: "USB (WebHID)",
  description:
    "Connect to a Rynk keyboard over USB. Requires a Chromium-based browser (Chrome, Edge).",
  available: () => typeof navigator !== "undefined" && "hid" in navigator,
  async connect() {
    // More than one keyboard of the same model can be granted, and WebHID
    // offers no serial number to tell them apart, so the only way to know
    // which grant is the right one is to complete the handshake. Try each
    // before prompting: picking the first Rynk interface reconnects to
    // whichever grant sorts first, which on a second keyboard running
    // incompatible firmware fails identically on every reload.
    const granted = await grantedRynkDevices();
    let failure: unknown;
    for (const candidate of granted) {
      try {
        return await session(candidate);
      } catch (error) {
        // A grant that cannot handshake is out of the running for this page
        // session, so a later attempt reaches the picker instead of retrying
        // it. Being unable to open it at all counts the same way.
        rejectRynkDevice(candidate);
        failure ??= error;
      }
    }

    if (granted.length > 0) {
      throw new Error(
        `No granted device completed the Rynk handshake${
          failure instanceof Error ? `: ${failure.message}` : ""
        }. If more than one keyboard is connected, connect again to choose a different one.`,
      );
    }

    // No usable grant, so this is the first run (or every grant has been
    // ruled out). The picker must open before any await on wasm init would
    // burn the user gesture that allows it.
    return await session(await requestRynkDevice());
  },
};

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
