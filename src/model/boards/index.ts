// Optional static enrichment for known boards, keyed by what the device
// reports about itself. The UI renders fine without a match — enrichment only
// adds legends and a nicer display name on top of what the device reports.

import type { DeviceInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import type { BoardEnrichment } from "../keyboard";
import { glove80Enrichment } from "./glove80";
import { go60Enrichment as go60AddressEnrichment } from "./go60";
import { GO60_TRANSFER_MODEL } from "./transfer";

const MOERGO_VENDOR_ID = 0x16c0;
const MOERGO_PRODUCT_ID = 0x27db;

// MoErgo ships more than one board behind that one USB identity — the Go60
// firmware declares the same pair as the Glove80 — so the product name is the
// only thing that separates them. Applying one board's matrix enrichment to
// another would misidentify its keys, so an unrecognized name must fall
// through to what the device itself reports.
const GLOVE80_PRODUCT_NAME = "Glove80";
const GO60_PRODUCT_NAME = "Go60";

const go60Enrichment: BoardEnrichment = {
  ...go60AddressEnrichment,
  labels: Object.fromEntries(GO60_TRANSFER_MODEL.physical),
};

export function enrichmentFor(info: DeviceInfo): BoardEnrichment | undefined {
  if (info.vendor_id !== MOERGO_VENDOR_ID || info.product_id !== MOERGO_PRODUCT_ID)
    return undefined;
  if (info.product_name === GLOVE80_PRODUCT_NAME) return glove80Enrichment;
  if (info.product_name === GO60_PRODUCT_NAME) return go60Enrichment;
  return undefined;
}
