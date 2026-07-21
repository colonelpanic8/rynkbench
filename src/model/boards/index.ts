// Optional static enrichment for known boards, keyed by USB identity. The UI
// renders fine without a match — enrichment only adds legends and a nicer
// display name on top of what the device itself reports.

import type { DeviceInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import type { BoardEnrichment } from "../keyboard";
import { glove80Enrichment } from "./glove80";

const GLOVE80_VENDOR_ID = 0x16c0;
const GLOVE80_PRODUCT_ID = 0x27db;

export function enrichmentFor(info: DeviceInfo): BoardEnrichment | undefined {
  if (info.vendor_id === GLOVE80_VENDOR_ID && info.product_id === GLOVE80_PRODUCT_ID) {
    return glove80Enrichment;
  }
  return undefined;
}
