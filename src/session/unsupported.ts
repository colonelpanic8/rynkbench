// Telling "the firmware does not know this command" apart from "the request
// failed". Only the first is a fact about the board; treating the second as one
// makes the UI claim a firmware limitation that does not exist, with no way for
// the user to retry.

/** Whether a failed request means the firmware lacks the command. */
export function isUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /UnknownCmd|Unimplemented|Unsupported|does not support/i.test(message);
}

/** The error every backend rejects with for a surface the firmware lacks —
 *  phrased so `isUnsupportedError` recognizes it. Real firmware answers
 *  UnknownCmd; feature-gated and simulated backends must say the same thing. */
export function unsupported(what: string): Error {
  return new Error(`this firmware does not support ${what}`);
}
