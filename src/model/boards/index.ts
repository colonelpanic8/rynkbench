import type { DeviceInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import type { BoardEnrichment } from "../keyboard";
import { profileForIdentity } from "./profiles";

export { resolveBoardProfile } from "./profiles";
export type { BoardProfile } from "./profiles";

/** Legacy identity-only enrichment for callers without matrix capabilities. */
export function enrichmentFor(info: DeviceInfo): BoardEnrichment | undefined {
  return profileForIdentity(info)?.enrichment;
}
