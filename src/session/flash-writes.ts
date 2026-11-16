// Writing keys the way RMK's flash wants them (ADR 0012, docs/sync.md). The
// keymap is stored as one flash item per row segment, and a write that touches
// a segment stores it whole; the firmware takes a write only when its flash
// queue can hold it whole and otherwise answers `Busy`, which means "nothing
// was applied, send it again".

import { classifyError } from "./errors";

/** Whether a rejected request was the firmware's `Busy`: its flash queue had
 *  no room for the write, nothing was applied, and the same request is welcome
 *  again once the queue drains. */
export function isBusyError(error: unknown): boolean {
  return classifyError(error) === "busy";
}

const BUSY_RETRY_DELAY_MS = 100;
const BUSY_RETRY_LIMIT_MS = 300_000;

/** Run a keymap write, sending it again while the firmware answers `Busy`.
 *  The firmware waits about half a second for flash-queue room before saying
 *  so, which paces the retries; the limit spans a page migration of minutes. */
export async function retryBusy<T>(op: () => Promise<T>): Promise<T> {
  const started = performance.now();
  for (;;) {
    try {
      return await op();
    } catch (error) {
      if (!isBusyError(error) || performance.now() - started >= BUSY_RETRY_LIMIT_MS) throw error;
      await new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_DELAY_MS));
    }
  }
}

/** Cells of one row the firmware stores as one flash item (RMK's `KEYMAP_SEGMENT_KEYS`). */
export const KEYMAP_SEGMENT_KEYS = 16;

/** Flash items stored by writing `count` cells from row-major offset `start` of
 *  a layer `cols` wide: one per row segment the cells fall in. */
export function keymapSegments(start: number, count: number, cols: number): number {
  let segments = 0;
  for (let offset = start; offset < start + count; offset += 1) {
    if (offset === start || (offset % cols) % KEYMAP_SEGMENT_KEYS === 0) segments += 1;
  }
  return segments;
}
