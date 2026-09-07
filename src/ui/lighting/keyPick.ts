/**
 * A preset card asking for keys from the board. While one is active the canvas
 * selects instead of painting, whatever the brush says, and a single-key pick
 * replaces the selection on every click so nothing has to be deselected first.
 */
export interface KeyPick {
  /** Shown on the board banner: what the keys are for. */
  label: string;
  /** Exactly one key, replaced on each click. */
  single: boolean;
}

export const CONNECTION_KEY_PICK: KeyPick = { label: "connection key", single: true };
export const BATTERY_BAR_PICK: KeyPick = { label: "battery bar", single: false };
