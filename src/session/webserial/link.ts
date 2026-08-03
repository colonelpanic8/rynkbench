// Web Serial byte link for upstream RMK's USB CDC-ACM Rynk transport. Unlike
// WebHID, CDC exposes the COBS-framed byte stream directly: no report splitting
// or padding belongs in this layer.

import type { RynkByteLink } from "../rynk-link";

const RYNK_BAUD_RATE = 115_200;

export async function requestRynkSerialPort(): Promise<SerialPort> {
  // RMK boards do not share a VID/PID, and Web Serial exposes no usage-like
  // protocol marker. Let the user choose instead of excluding custom boards.
  return navigator.serial.requestPort();
}

export async function serialByteLink(port: SerialPort): Promise<RynkByteLink> {
  await port.open({ baudRate: RYNK_BAUD_RATE });

  if (!port.readable || !port.writable) {
    await port.close().catch(() => undefined);
    throw new Error("The selected serial port did not expose readable and writable streams");
  }

  const reader = port.readable.getReader();
  const writer = port.writable.getWriter();
  let ended = false;
  let released = false;

  const end = () => {
    if (ended) return;
    ended = true;
    // Wake a pending recv(). Cancellation settles its read with `done`; close()
    // awaits the same operation before releasing the stream locks.
    void reader.cancel().catch(() => undefined);
  };

  return {
    label: serialPortLabel(port),
    async send(bytes) {
      if (ended) throw new Error("Serial link is closed");
      await writer.write(bytes);
    },
    async recv() {
      while (!ended) {
        const { value, done } = await reader.read();
        if (done) {
          ended = true;
          break;
        }
        if (value && value.length > 0) return value;
      }
      return new Uint8Array();
    },
    async close() {
      if (released) return;
      released = true;
      end();
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
      await writer.close().catch(() => undefined);
      writer.releaseLock();
      await port.close().catch(() => undefined);
    },
    end,
  };
}

function serialPortLabel(port: SerialPort): string {
  const { usbVendorId, usbProductId } = port.getInfo();
  if (usbVendorId === undefined || usbProductId === undefined) return "Rynk (Web Serial)";
  return `USB ${hex(usbVendorId)}:${hex(usbProductId)} (Web Serial)`;
}

function hex(value: number): string {
  return value.toString(16).padStart(4, "0");
}
