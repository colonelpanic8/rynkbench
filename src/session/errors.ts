// What failed, as a value. The session layer reports three kinds of failure
// the rest of the app must tell apart, because each calls for a different
// reaction:
//
//   unsupported  the firmware lacks the command: a fact about the board, so the
//                feature is absent and retrying changes nothing
//   busy         the firmware's flash queue is full: nothing was applied, and
//                the same request is welcome again shortly
//   timeout      the keyboard did not answer: the link is closed
//
// New codes arrive with their first real user, not ahead of it.
//
// The firmware's own wording (`UnknownCmd`, `Busy`) reaches us as plain text on
// a rejected request. `classifyError` is the one place that reads that text and
// turns it into a code; everything else asks for the code.

export type SessionErrorCode = "unsupported" | "busy" | "timeout";

export class SessionError extends Error {
  readonly code: SessionErrorCode;

  constructor(code: SessionErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "SessionError";
  }
}

/** A surface the firmware lacks. Real firmware answers `UnknownCmd`;
 *  feature-gated and simulated backends throw this to say the same thing. */
export class UnsupportedError extends SessionError {
  constructor(what: string, options?: ErrorOptions) {
    super("unsupported", `this firmware does not support ${what}`, options);
    this.name = "UnsupportedError";
  }
}

const UNSUPPORTED_WIRE = /UnknownCmd|Unimplemented|Unsupported|does not support/i;
const BUSY_WIRE = /\bBusy\b/;

/** The code of a failure, or `undefined` when it is none of the known kinds
 *  (an ordinary failed request). */
export function classifyError(error: unknown): SessionErrorCode | undefined {
  if (error instanceof SessionError) return error.code;
  const message = error instanceof Error ? error.message : String(error);
  // The firmware's `Busy` rejection arrives as a `Rejected` error from the client.
  if (error instanceof Error && error.name === "Rejected" && BUSY_WIRE.test(message)) return "busy";
  if (UNSUPPORTED_WIRE.test(message)) return "unsupported";
  return undefined;
}

/** A failure as text for a message: an `Error`'s message, else the value as a string. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
