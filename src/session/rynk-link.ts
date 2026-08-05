// The Rynk raw-HID byte link shared by every USB transport (WebHID in the
// browser, the native hidapi backend in the Tauri desktop app): 32-byte
// reports each way, no report IDs.
//
// This layer is a byte pipe and nothing more. Framing belongs to the wasm
// driver, which COBS-encodes what it sends and runs a deframer over what it
// receives, so reports must reach it whole — including the zero padding,
// which the deframer reads as the inter-frame delimiter it resyncs on.

/**
 * Vendor usage pages that can carry Rynk, newest first. Firmware built with
 * RMK's `rynk` feature puts the protocol on its own interface; before that it
 * rode on the Via report, which older boards still expose. Discovery must
 * accept every page here — matching on one silently finds nothing when the
 * firmware moves, which is exactly how this broke before.
 */
export const RYNK_USAGE_PAGES = [0xff14, 0xff60] as const;
export const RYNK_USAGE = 0x61;
export const RYNK_HID_REPORT_SIZE = 32;

/** Whether a HID collection's page/usage pair belongs to a Rynk interface. */
export function isRynkUsage(usagePage: number, usage: number): boolean {
  return usage === RYNK_USAGE && RYNK_USAGE_PAGES.includes(usagePage as never);
}

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

/** Accumulates raw HID input reports and hands the bytes to an async
 * `recv()` consumer for the wasm driver to deframe. */
export class RynkFrameBuffer {
  private rx = new Uint8Array();
  private closed = false;
  private wake: (() => void) | null = null;

  private signal(): void {
    const pending = this.wake;
    this.wake = null;
    pending?.();
  }

  /** Feed one raw input report, padding included. */
  push(data: Uint8Array): void {
    if (data.length === 0) return;
    const grown = new Uint8Array(this.rx.length + data.length);
    grown.set(this.rx);
    grown.set(data, this.rx.length);
    this.rx = grown;
    this.signal();
  }

  /** Wait for buffered bytes; empty after `end()` means the link died. */
  async recv(): Promise<Uint8Array> {
    while (this.rx.length === 0 && !this.closed) {
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
    const bytes = this.rx;
    this.rx = new Uint8Array();
    return bytes;
  }

  end(): void {
    this.closed = true;
    this.signal();
  }
}

/** Split an outbound frame into zero-padded 32-byte reports. */
export function toReports(bytes: Uint8Array): Uint8Array<ArrayBuffer>[] {
  const reports: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < bytes.length; offset += RYNK_HID_REPORT_SIZE) {
    const report = new Uint8Array(RYNK_HID_REPORT_SIZE);
    report.set(bytes.subarray(offset, offset + RYNK_HID_REPORT_SIZE));
    reports.push(report);
  }
  return reports;
}
