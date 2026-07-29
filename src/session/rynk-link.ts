// The Rynk raw-HID byte link shared by every USB transport (WebHID in the
// browser, the native hidapi backend in the Tauri desktop app): 32-byte
// reports each way, no report IDs. Inbound reports are trimmed to the frame
// length announced by the 5-byte Rynk header (payload length little-endian at
// bytes 3..4) so report padding never reaches the wasm driver.

export const RYNK_USAGE_PAGE = 0xff60;
export const RYNK_USAGE = 0x61;
export const RYNK_HID_REPORT_SIZE = 32;
const RYNK_HEADER_LEN = 5;

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

/** Reassembles Rynk frames from padded HID input reports and hands the
 * trimmed bytes to an async `recv()` consumer. */
export class RynkFrameBuffer {
  private rx = new Uint8Array();
  private remaining = 0;
  private closed = false;
  private wake: (() => void) | null = null;

  private signal(): void {
    const pending = this.wake;
    this.wake = null;
    pending?.();
  }

  /** Feed one raw input report (padding included). */
  push(data: Uint8Array): void {
    if (this.remaining === 0 && data.length >= RYNK_HEADER_LEN) {
      this.remaining = RYNK_HEADER_LEN + data[3] + (data[4] << 8);
    }
    const take = Math.min(this.remaining, data.length);
    if (take === 0) return;
    this.remaining -= take;
    const grown = new Uint8Array(this.rx.length + take);
    grown.set(this.rx);
    grown.set(data.subarray(0, take), this.rx.length);
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
