import { describe, expect, it } from "vitest";
import { RYNK_HID_REPORT_SIZE, RynkFrameBuffer, toReports } from "./rynk-link";

function report(...bytes: number[]): Uint8Array {
  const padded = new Uint8Array(RYNK_HID_REPORT_SIZE);
  padded.set(bytes);
  return padded;
}

describe("RynkFrameBuffer", () => {
  /// The regression that stopped rynkbench talking to current firmware: this
  /// buffer used to trim each report to a length it read out of bytes 3..4,
  /// from a pre-COBS wire format whose header was 5 bytes. Against a
  /// COBS-encoded stream with a 3-byte header those bytes are payload, so the
  /// computed length was noise and the deframer downstream saw a mangled
  /// stream with its 0x00 delimiters cut off.
  it("delivers reports whole, padding included", async () => {
    const buffer = new RynkFrameBuffer();
    // A COBS frame for cmd 0x0001 seq 1: bytes 3..4 are zero padding, which
    // the old length calculation read as "no payload follows".
    buffer.push(report(0x02, 0x01, 0x02, 0x01, 0x00));

    expect(await buffer.recv()).toEqual(report(0x02, 0x01, 0x02, 0x01, 0x00));
  });

  it("concatenates reports that arrive before recv drains them", async () => {
    const buffer = new RynkFrameBuffer();
    buffer.push(new Uint8Array([1, 2]));
    buffer.push(new Uint8Array([3]));

    expect(await buffer.recv()).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("resolves a waiting recv when a report lands, then reports link death", async () => {
    const buffer = new RynkFrameBuffer();
    const pending = buffer.recv();
    buffer.push(new Uint8Array([7]));
    expect(await pending).toEqual(new Uint8Array([7]));

    buffer.end();
    expect(await buffer.recv()).toEqual(new Uint8Array());
  });
});

describe("toReports", () => {
  it("pads a short frame to one full report", () => {
    const reports = toReports(new Uint8Array([1, 2, 3]));
    expect(reports).toHaveLength(1);
    expect(reports[0]).toEqual(report(1, 2, 3));
  });

  it("splits a frame longer than one report", () => {
    const frame = new Uint8Array(RYNK_HID_REPORT_SIZE + 1).fill(9);
    const reports = toReports(frame);

    expect(reports).toHaveLength(2);
    expect(reports[0].every((b) => b === 9)).toBe(true);
    expect(reports[1]).toEqual(report(9));
  });
});
