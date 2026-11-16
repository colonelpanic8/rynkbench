import type { KeyView } from "../model/keyboard";

export type AddressableKey = Pick<KeyView, "row" | "col"> &
  Partial<Pick<KeyView, "address" | "label">>;

export function matrixKeyLabel(key: Pick<AddressableKey, "row" | "col">): string {
  return `r${key.row} · c${key.col}`;
}

export function keyAddressLabel(key: AddressableKey): string {
  return key.address ?? `r${key.row}c${key.col}`;
}

export function keyAddressWithLegend(key: AddressableKey): string {
  const address = keyAddressLabel(key);
  return key.label ? `${address} · ${key.label}` : address;
}

export function keyHoverTitle(key: AddressableKey): string {
  const matrix = `matrix row ${key.row}, column ${key.col}`;
  const legend = key.label ? ` · ${key.label}` : "";
  return key.address ? `${key.address} · ${matrix}${legend}` : `${matrix}${legend}`;
}

export function keyAtPosition(
  keys: readonly AddressableKey[],
  position: Pick<AddressableKey, "row" | "col">,
): AddressableKey {
  return keys.find((key) => key.row === position.row && key.col === position.col) ?? position;
}

const HAND: Record<string, string> = { LH: "Left", RH: "Right" };

/** A key's place in words, as GLIDE's key heading says it: "Left hand · row 3,
 *  column 4" or "Right thumb · key 2" from a MoErgo address, else its matrix place. */
export function keyPlaceName(key: AddressableKey): string {
  const finger = key.address?.match(/^(LH|RH)-C(\d+)R(\d+)$/);
  if (finger) return `${HAND[finger[1]]} hand · row ${finger[3]}, column ${finger[2]}`;
  const thumb = key.address?.match(/^(LH|RH)-T(\d+)$/);
  if (thumb) return `${HAND[thumb[1]]} thumb · key ${thumb[2]}`;
  return `Row ${key.row}, column ${key.col}`;
}
