// Backend registry: the single place the UI learns what it can connect to.
// The UI imports ONLY from this module (and types.ts / model/) — never from
// a specific backend directory.

import { nativeProvider } from "./native";
import { nativeBleProvider } from "./native-ble";
import { webHidProvider } from "./webhid";
import { webSerialProvider } from "./webserial";
import type { SessionProvider } from "./types";

export type { RynkSession, SessionKind, SessionProvider } from "./types";

/** All providers, in display order. Availability is checked at render time.
 * Tauri exposes native HID and native BLE; Chromium exposes the two browser
 * transports: vendor WebHID for fork firmware and Web Serial for upstream RMK.
 * USB leads in both environments — it is faster and needs no prior pairing. */
export function sessionProviders(): SessionProvider[] {
  return [nativeProvider, nativeBleProvider, webHidProvider, webSerialProvider];
}
