// What the keyboard reports about its links, read the way the firmware reads it.

import type { BleStatus, ConnectionStatus } from "../vendor/rynk-wasm/rynk_wasm";

export type { BleStatus, ConnectionStatus };

const OFFLINE: BleStatus = { state: "Inactive", bonded: false };

/** The selected Bluetooth profile's status (`ConnectionStatus::selected_profile`). */
export function selectedBle(status: ConnectionStatus): BleStatus {
  return status.ble[status.selected] ?? OFFLINE;
}

/** `count` Bluetooth profiles, each offline but the selected one. */
export function bleProfiles(count: number, selected: number, status: BleStatus = OFFLINE): BleStatus[] {
  return Array.from({ length: count }, (_, slot) => ({ ...(slot === selected ? status : OFFLINE) }));
}
