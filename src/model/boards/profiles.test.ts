import { describe, expect, it } from "vitest";
import type { DeviceInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import { resolveBoardProfile } from "./profiles";

const info = (product_name: string): DeviceInfo => ({
  vendor_id: 0x16c0, product_id: 0x27db, product_name,
  manufacturer: "MoErgo", serial_number: "TEST",
  rmk_version: { major: 0, minor: 7, patch: 0 },
});

describe("board profiles", () => {
  it.each([["Glove80", 6, "go60"], ["Go60", 5, "glove80"]] as const)(
    "resolves %s document tools only for its identity and matrix", (name, rows, peer) => {
      const profile = resolveBoardProfile(info(name), { num_rows: rows, num_cols: 14 });
      expect(profile?.documents?.migrationTarget?.id).toBe(peer);
      expect(profile?.presets.includes("glove80-status")).toBe(name === "Glove80");
    },
  );
  it.each([
    [info("Future80"), 6, 14],
    [info("My Glove80 clone"), 6, 14],
    [{ ...info("Glove80"), vendor_id: 1 }, 6, 14],
    [{ ...info("Glove80"), product_id: 1 }, 6, 14],
    [info("Glove80"), 5, 14],
    [info("Go60"), 6, 14],
    [info("Glove80"), 6, 13],
  ] as const)("does not infer a profile from a familiar name or matrix (%j)", (device, rows, cols) => {
    expect(resolveBoardProfile(device, { num_rows: rows, num_cols: cols })).toBeUndefined();
  });
});
