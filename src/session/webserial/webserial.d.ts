// Minimal ambient Web Serial declarations — just the surface this backend
// uses. TypeScript's DOM library does not currently include Web Serial.

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface Serial extends EventTarget {
  requestPort(): Promise<SerialPort>;
  addEventListener(type: "disconnect", listener: (event: Event) => void): void;
  removeEventListener(type: "disconnect", listener: (event: Event) => void): void;
}

interface Navigator {
  readonly serial: Serial;
}
