import { describe, expect, it, vi } from "vitest";
import { serialByteLink } from "./link";

function serialPort({
  readable,
  writable,
  info = {},
}: {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  info?: SerialPortInfo;
}) {
  const open = vi.fn(() => Promise.resolve());
  const close = vi.fn(() => Promise.resolve());
  return {
    readable,
    writable,
    open,
    close,
    getInfo: () => info,
  } as unknown as SerialPort & { open: typeof open; close: typeof close };
}

describe("Web Serial byte link", () => {
  it("passes the CDC byte stream through unchanged and labels USB ports", async () => {
    const written: Uint8Array[] = [];
    const port = serialPort({
      readable: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array());
          controller.enqueue(new Uint8Array([1, 2, 0]));
        },
      }),
      writable: new WritableStream({
        write(bytes: Uint8Array) {
          written.push(bytes.slice());
        },
      }),
      info: { usbVendorId: 0x4c4b, usbProductId: 0x43 },
    });

    const link = await serialByteLink(port);
    await link.send(new Uint8Array([3, 4, 0]));

    expect(port.open).toHaveBeenCalledWith({ baudRate: 115_200 });
    expect(link.label).toBe("USB 4c4b:0043 (Web Serial)");
    expect(written).toEqual([new Uint8Array([3, 4, 0])]);
    expect(await link.recv()).toEqual(new Uint8Array([1, 2, 0]));

    await link.close();
    expect(port.close).toHaveBeenCalledOnce();
  });

  it("wakes a pending receive when the session ends", async () => {
    const port = serialPort({
      readable: new ReadableStream(),
      writable: new WritableStream(),
    });
    const link = await serialByteLink(port);
    const pending = link.recv();

    link.end();

    expect(await pending).toEqual(new Uint8Array());
    await link.close();
  });

  it("closes a selected port that lacks usable streams", async () => {
    const port = serialPort({ readable: null, writable: null });

    await expect(serialByteLink(port)).rejects.toThrow(/readable and writable streams/);
    expect(port.close).toHaveBeenCalledOnce();
  });
});
