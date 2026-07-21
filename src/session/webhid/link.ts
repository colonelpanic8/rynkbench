// WebHID byte link for the Rynk raw-HID interface (usage page 0xFF60 /
// usage 0x61): 32-byte reports each way, no report IDs. Inbound reports are
// trimmed to the frame length announced by the 5-byte Rynk header (payload
// length little-endian at bytes 3..4) so report padding never reaches the
// wasm driver; outbound bytes are split into zero-padded 32-byte reports.

const RYNK_USAGE_PAGE = 0xff60;
const RYNK_USAGE = 0x61;
const RYNK_HEADER_LEN = 5;
const RYNK_HID_REPORT_SIZE = 32;

/**
 * The byte link handed to the wasm `connect()` — the web transport's
 * RynkDevice shape (send/recv/close), plus `end()` so the session can tear
 * the link down from the outside when the device unplugs: `recv()` drains
 * what is buffered, then returns empty, which the wasm driver reads as
 * link death.
 */
export interface RynkByteLink {
  readonly label: string;
  send(bytes: Uint8Array): Promise<void>;
  recv(): Promise<Uint8Array>;
  close(): Promise<void>;
  end(): void;
}

function isRynkInterface(device: HIDDevice): boolean {
  return device.collections.some((c) => c.usagePage === RYNK_USAGE_PAGE && c.usage === RYNK_USAGE);
}

/** Show the browser device picker and open the Rynk raw-HID interface. */
export async function openRynkHidDevice(): Promise<HIDDevice> {
  // Previously-granted devices open without a picker, so reloads reconnect
  // with one click. A stale grant (unplugged, claimed elsewhere) falls
  // through to the chooser.
  try {
    const granted = (await navigator.hid.getDevices()).find(isRynkInterface);
    if (granted) {
      if (!granted.opened) await granted.open();
      return granted;
    }
  } catch {
    // fall through to the picker
  }
  const devices = await navigator.hid.requestDevice({
    filters: [{ usagePage: RYNK_USAGE_PAGE, usage: RYNK_USAGE }],
  });
  // Chromium returns every HID interface of the chosen physical device; pick
  // the Rynk collection, not a look-alike raw interface.
  const device = devices.find(isRynkInterface) ?? devices[0];
  if (!device) throw new Error("No Rynk device chosen");
  if (!device.opened) await device.open();
  return device;
}

export function hidByteLink(device: HIDDevice): RynkByteLink {
  let rx = new Uint8Array();
  let remaining = 0;
  let closed = false;
  let wake: (() => void) | null = null;
  const signal = () => {
    const pending = wake;
    wake = null;
    pending?.();
  };
  const onReport = (event: HIDInputReportEvent) => {
    const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength);
    if (remaining === 0 && data.length >= RYNK_HEADER_LEN) {
      remaining = RYNK_HEADER_LEN + data[3] + (data[4] << 8);
    }
    const take = Math.min(remaining, data.length);
    if (take === 0) return;
    remaining -= take;
    const grown = new Uint8Array(rx.length + take);
    grown.set(rx);
    grown.set(data.subarray(0, take), rx.length);
    rx = grown;
    signal();
  };
  device.addEventListener("inputreport", onReport);
  const end = () => {
    closed = true;
    signal();
  };
  return {
    label: device.productName || "Rynk (WebHID)",
    async send(bytes) {
      for (let offset = 0; offset < bytes.length; offset += RYNK_HID_REPORT_SIZE) {
        const report = new Uint8Array(RYNK_HID_REPORT_SIZE);
        report.set(bytes.subarray(offset, offset + RYNK_HID_REPORT_SIZE));
        await device.sendReport(0, report);
      }
    },
    async recv() {
      while (rx.length === 0 && !closed) {
        await new Promise<void>((resolve) => (wake = resolve));
      }
      const bytes = rx;
      rx = new Uint8Array();
      return bytes;
    },
    async close() {
      end();
      device.removeEventListener("inputreport", onReport);
      await device.close().catch(() => undefined);
    },
    end,
  };
}
