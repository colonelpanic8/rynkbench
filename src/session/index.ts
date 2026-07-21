// Backend registry: the single place the UI learns what it can connect to.
// The UI imports ONLY from this module (and types.ts / model/) — never from
// a specific backend directory.

import { mockProviders } from "./mock";
import { webHidProvider } from "./webhid";
import type { SessionProvider } from "./types";

export type { RynkSession, SessionKind, SessionProvider } from "./types";

/** All providers, in display order. Availability is checked at render time. */
export function sessionProviders(): SessionProvider[] {
  return [webHidProvider, ...mockProviders];
}
