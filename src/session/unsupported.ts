// Telling "the firmware does not know this command" apart from "the request
// failed". Only the first is a fact about the board; treating the second as one
// makes the UI claim a firmware limitation that does not exist, with no way for
// the user to retry. The classification itself lives in ./errors.

import { classifyError, UnsupportedError } from "./errors";

/** Whether a failed request means the firmware lacks the command. */
export function isUnsupportedError(error: unknown): boolean {
  return classifyError(error) === "unsupported";
}

/** The error every backend rejects with for a surface the firmware lacks.
 *  Real firmware answers UnknownCmd; feature-gated and simulated backends must
 *  say the same thing. */
export function unsupported(what: string): Error {
  return new UnsupportedError(what);
}
