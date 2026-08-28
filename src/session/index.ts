// Backend registry: the single place the UI learns what it can connect to.
// The UI imports ONLY from this module (and types.ts / model/) — never from
// a specific backend directory.

import { nativeProvider } from "./native";
import { nativeBleProvider } from "./native-ble";
import { webBluetoothProvider } from "./webbluetooth";
import { webHidProvider } from "./webhid";
import { webSerialProvider } from "./webserial";
import type { SessionProvider } from "./types";

export type { RynkSession, SessionKind, SessionProvider } from "./types";

/** All providers, in display order. Availability is checked at render time.
 * Tauri exposes native HID and native BLE; Chromium exposes the three browser
 * transports: vendor WebHID for fork firmware, Web Serial for upstream RMK,
 * and Web Bluetooth for fork firmware's Rynk GATT service (the only one that
 * exists on Android). USB leads where it exists — it is faster and needs no
 * prior pairing. */
export function sessionProviders(): SessionProvider[] {
  return [nativeProvider, nativeBleProvider, webHidProvider, webSerialProvider, webBluetoothProvider];
}
