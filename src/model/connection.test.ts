import { describe, expect, it } from "vitest";
import { selectedBle } from "./connection";

describe("selectedBle", () => {
  it("reads the selected profile, and an offline one past the end", () => {
    const ble = [
      { state: "Inactive" as const, bonded: true },
      { state: "Connected" as const, bonded: true },
    ];
    const status = { usb: "Configured" as const, ble, selected: 1, preferred: "Ble" as const };
    expect(selectedBle(status)).toEqual({ state: "Connected", bonded: true });
    expect(selectedBle({ ...status, selected: 4 })).toEqual({ state: "Inactive", bonded: false });
  });
});
