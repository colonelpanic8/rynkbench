// A surface the simulated firmware was built without. Every call rejects as
// unsupported, the way real firmware answers UnknownCmd, so a screen that
// calls it anyway fails in tests instead of quietly working on a simulation.

import { unsupported } from "../unsupported";

/** The same shape as `ops`, every call (nested ones too) rejecting as unsupported. */
export function absentSurface<T extends object>(ops: T, name: string): T {
  const absent: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(ops)) {
    absent[key] =
      typeof value === "function"
        ? () => Promise.reject(unsupported(`${name}.${key}`))
        : absentSurface(value as object, `${name}.${key}`);
  }
  return absent as T;
}
