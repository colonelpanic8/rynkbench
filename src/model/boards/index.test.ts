import { describe, expect, it } from "vitest";
import type { DeviceInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import { enrichmentFor } from "./index";

const moergo = (product_name: string): DeviceInfo => ({
  rmk_version: { major: 0, minor: 7, patch: 0 },
  vendor_id: 0x16c0,
  product_id: 0x27db,
  manufacturer: "MoErgo",
  product_name,
  serial_number: "TEST-0001",
});

describe("enrichmentFor", () => {
  it("recognizes a Glove80", () => {
    const enrichment = enrichmentFor(moergo("Glove80"));
    expect(enrichment?.displayName).toBe("Glove80");
    expect(enrichment?.labels?.["2,1"]).toBe("Q");
  });

  // The Go60 firmware declares the Glove80's vendor and product ids, so a
  // match on those alone would hand a 5x14 board the Glove80's 6x14 legends.
  it("leaves another MoErgo board behind the same USB identity unenriched", () => {
    expect(enrichmentFor(moergo("Go60"))).toBeUndefined();
  });
});
