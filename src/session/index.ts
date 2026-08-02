// Backend registry: the single place the UI learns what it can connect to.
// The UI imports ONLY from this module (and types.ts / model/) — never from
// a specific backend directory.

import { nativeProvider } from "./native";
import { webHidProvider } from "./webhid";
import type { SessionProvider } from "./types";

export type { RynkSession, SessionKind, SessionProvider } from "./types";

/** All providers, in display order. Availability is checked at render time.
 * Inside the Tauri desktop app the native HID backend is available and
 * WebHID is not (WebKit never shipped it); in a browser it is the reverse —
 * so exactly one USB provider lights up in any environment. */
export function sessionProviders(): SessionProvider[] {
  return [nativeProvider, webHidProvider];
}
