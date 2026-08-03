// Backend registry: the single place the UI learns what it can connect to.
// The UI imports ONLY from this module (and types.ts / model/) — never from
// a specific backend directory.

import { nativeProvider } from "./native";
import { webHidProvider } from "./webhid";
import { webSerialProvider } from "./webserial";
import type { SessionProvider } from "./types";

export type { RynkSession, SessionKind, SessionProvider } from "./types";

/** All providers, in display order. Availability is checked at render time.
 * Tauri exposes native HID; Chromium exposes the two browser transports:
 * vendor WebHID for fork firmware and Web Serial for upstream RMK. */
export function sessionProviders(): SessionProvider[] {
  return [nativeProvider, webHidProvider, webSerialProvider];
}
