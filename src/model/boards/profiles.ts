import type { DeviceCapabilities, DeviceInfo } from "../../vendor/rynk-wasm/rynk_wasm";
import type { BoardProfile } from "./profile";
import { MOERGO_PROFILES } from "./profiles/moergo";

export type { BoardDocumentTools, BoardProfile } from "./profile";

export const BOARD_PROFILES: readonly BoardProfile[] = [...MOERGO_PROFILES];

export function profileById(id: string): BoardProfile | undefined {
  return BOARD_PROFILES.find((profile) => profile.id === id);
}

export function profileForIdentity(info: DeviceInfo): BoardProfile | undefined {
  return BOARD_PROFILES.find(({ identity }) =>
    info.vendor_id === identity.vendorId &&
    info.product_id === identity.productId &&
    info.product_name === identity.productName,
  );
}

/** Matrix dimensions validate an identity match; they never identify a board. */
export function resolveBoardProfile(
  info: DeviceInfo,
  caps: Pick<DeviceCapabilities, "num_rows" | "num_cols">,
): BoardProfile | undefined {
  const profile = profileForIdentity(info);
  return profile?.matrix.rows === caps.num_rows && profile.matrix.cols === caps.num_cols
    ? profile : undefined;
}
