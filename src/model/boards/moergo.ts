import type { BoardEnrichment } from "../keyboard";

export interface MatrixPosition {
  row: number;
  col: number;
}

/**
 * MoErgo's support-friendly physical vocabulary. Finger columns count from
 * the thumb side outward and rows count from the top down. Thumb keys count
 * outer-to-inner; the Glove80 numbers its upper fan first, then its lower fan.
 */
export function moergoPhysicalAddress({ row, col }: MatrixPosition): string {
  if (col === 6) return `LH-T${row + 1}`;
  if (col === 7) return `RH-T${row + 1}`;
  if (col < 6) return `LH-C${6 - col}R${row + 1}`;
  return `RH-C${col - 7}R${row + 1}`;
}

export function buildMoergoAddresses(
  positions: readonly MatrixPosition[],
): NonNullable<BoardEnrichment["addresses"]> {
  return Object.fromEntries(
    positions.map((position) => [
      `${position.row},${position.col}`,
      moergoPhysicalAddress(position),
    ]),
  );
}
