/** Retry cadence for an unexpected drop. The first attempt is immediate;
 * later attempts leave enough time for USB enumeration to settle. */
export const RECONNECT_DELAYS_MS = [0, 500, 1_000, 2_000, 3_000] as const;

export interface ReconnectRetryOptions {
  delaysMs?: readonly number[];
  onAttempt?: (attempt: number, total: number) => void;
  wait?: (delayMs: number) => Promise<void>;
}

const wait = (delayMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });

/**
 * Retry a complete reconnect operation, including its validation/loading
 * work. Keeping that whole operation inside the retry means a link that
 * opens but drops again during initial reads does not strand a partial
 * session in the UI.
 */
export async function retryReconnect<T>(
  reconnect: () => Promise<T>,
  options: ReconnectRetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs ?? RECONNECT_DELAYS_MS;
  if (delays.length === 0) throw new Error("Reconnect requires at least one attempt");

  const pause = options.wait ?? wait;
  let lastError: unknown;
  for (let index = 0; index < delays.length; index++) {
    const delay = delays[index];
    if (delay > 0) await pause(delay);
    options.onAttempt?.(index + 1, delays.length);
    try {
      return await reconnect();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
