// Optional static enrichment for known boards, keyed by what the device
// reports about itself. The UI renders fine without a match — enrichment only
// adds legends and a nicer display name on top of what the device reports.

import type { DeviceInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import type { BoardEnrichment } from "../keyboard";
import { glove80Enrichment } from "./glove80";

const MOERGO_VENDOR_ID = 0x16c0;
const MOERGO_PRODUCT_ID = 0x27db;

// MoErgo ships more than one board behind that one USB identity — the Go60
// firmware declares the same pair as the Glove80 — so the product name is the
// only thing that separates them. Applying the Glove80's 6x14 legends to
// another board's matrix would mislabel its keys, so an unrecognized name must
// fall through to what the device itself reports.
const GLOVE80_PRODUCT_NAME = "Glove80";

export function enrichmentFor(info: DeviceInfo): BoardEnrichment | undefined {
  if (
    info.vendor_id === MOERGO_VENDOR_ID &&
    info.product_id === MOERGO_PRODUCT_ID &&
    info.product_name === GLOVE80_PRODUCT_NAME
  ) {
    return glove80Enrichment;
  }
  return undefined;
}
