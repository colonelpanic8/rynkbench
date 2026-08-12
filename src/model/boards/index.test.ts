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
    expect(enrichment?.addresses?.["2,5"]).toBe("LH-C1R3");
  });

  it("recognizes a Go60 without applying Glove80 legends", () => {
    const enrichment = enrichmentFor(moergo("Go60"));
    expect(enrichment?.displayName).toBe("Go60");
    expect(enrichment?.addresses?.["2,8"]).toBe("RH-C1R3");
    expect(enrichment?.labels).toBeUndefined();
  });

  it("leaves an unknown MoErgo board behind the shared USB identity unenriched", () => {
    expect(enrichmentFor(moergo("Future80"))).toBeUndefined();
  });
});
