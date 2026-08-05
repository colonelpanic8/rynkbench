// WebHID byte link for the Rynk raw-HID interface (usage page 0xFF60 /
// usage 0x61). Framing (header-based trimming, 32-byte report split) lives in
// the shared rynk-link module; this file is only the WebHID plumbing.

import {
  RYNK_USAGE,
  RYNK_USAGE_PAGES,
  RynkFrameBuffer,
  isRynkUsage,
  toReports,
  type RynkByteLink,
} from "../rynk-link";

export type { RynkByteLink } from "../rynk-link";

function isRynkInterface(device: HIDDevice): boolean {
  return device.collections.some((c) => isRynkUsage(c.usagePage ?? -1, c.usage ?? -1));
}

/// Grants that failed to speak Rynk this page session. WebHID hands out
/// grants in its own order and exposes no serial number, so two keyboards of
/// the same model are indistinguishable before the handshake; without this,
/// a bad grant that sorts first would be retried forever and the picker
/// would never reappear.
const rejected = new WeakSet<HIDDevice>();

/** Every previously-granted Rynk interface worth trying, in browser order. */
export async function grantedRynkDevices(): Promise<HIDDevice[]> {
  try {
    return (await navigator.hid.getDevices()).filter((d) => isRynkInterface(d) && !rejected.has(d));
  } catch {
    return [];
  }
}

/// Record that `device` did not complete the Rynk handshake, so the next
/// connect skips it and falls through to the picker once nothing is left.
export function rejectRynkDevice(device: HIDDevice): void {
  rejected.add(device);
}

/** Show the browser device picker and return the chosen Rynk interface. */
export async function requestRynkDevice(): Promise<HIDDevice> {
  const devices = await navigator.hid.requestDevice({
    filters: RYNK_USAGE_PAGES.map((usagePage) => ({ usagePage, usage: RYNK_USAGE })),
  });
  // Chromium returns every HID interface of the chosen physical device; pick
  // the Rynk collection, not a look-alike raw interface.
  const device = devices.find(isRynkInterface) ?? devices[0];
  if (!device) throw new Error("No Rynk device chosen");
  return device;
}

export async function openRynkHidDevice(device: HIDDevice): Promise<HIDDevice> {
  if (!device.opened) await device.open();
  return device;
}

export function hidByteLink(device: HIDDevice): RynkByteLink {
  const buffer = new RynkFrameBuffer();
  const onReport = (event: HIDInputReportEvent) => {
    buffer.push(new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength));
  };
  device.addEventListener("inputreport", onReport);
  return {
    label: device.productName || "Rynk (WebHID)",
    async send(bytes) {
      for (const report of toReports(bytes)) {
        await device.sendReport(0, report);
      }
    },
    recv: () => buffer.recv(),
    async close() {
      buffer.end();
      device.removeEventListener("inputreport", onReport);
      await device.close().catch(() => undefined);
    },
    end: () => buffer.end(),
  };
}
