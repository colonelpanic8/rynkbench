import type { MorseHoldTriggerPosition } from "../vendor/rynk-wasm/rynk_wasm";

export type MatrixPosition = Pick<MorseHoldTriggerPosition, "row" | "col">;

export function profilePositionCount(
  positions: MorseHoldTriggerPosition[],
  profile: number,
): number {
  return positions.filter((position) => position.profile === profile).length;
}

/** Replace one profile's related keys without disturbing any other stable slot. */
export function replaceProfilePositions(
  positions: MorseHoldTriggerPosition[],
  profile: number,
  replacement: MatrixPosition[],
): MorseHoldTriggerPosition[] {
  return positions
    .filter((position) => position.profile !== profile)
    .concat(replacement.map(({ row, col }) => ({ profile, row, col })));
}
