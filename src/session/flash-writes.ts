// Writing keys the way RMK's flash wants them (ADR 0012, docs/sync.md). Every
// key sent is one stored item; the firmware takes a page only when its flash
// queue can hold it whole and otherwise answers `Busy`, which means "nothing
// was applied, send it again".

import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
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

/** Cells per keymap write page. Every cell is one flash item and the firmware
 *  only accepts a page it can queue for flash whole, answering `Busy`
 *  otherwise; a longer page streams through the queue and holds the session
 *  for the length of a storage page migration. Matches the native client. */
export const KEYMAP_WRITE_PAGE_KEYS = 4;

/** The two keymap writes the protocol client offers. */
export interface KeyWriteClient {
  set_key(layer: number, row: number, col: number, action: KeyAction): Promise<unknown>;
  set_keymap_bulk(request: { layer: number; start_row: number; start_col: number; actions: KeyAction[] }): Promise<unknown>;
}

/** Neighbouring cells of one layer from a row-major `start`: bulk pages of
 *  `page` keys where the firmware has them (`page` > 0), else one by one. */
export async function writeKeyRun(
  client: KeyWriteClient,
  { rows, cols, page }: { rows: number; cols: number; page: number },
  layer: number,
  start: number,
  actions: KeyAction[],
): Promise<void> {
  if (start < 0 || start + actions.length > rows * cols) {
    throw new Error(`key run ${start}+${actions.length} leaves layer ${layer}`);
  }
  const step = page > 0 ? page : 1;
  for (let at = 0; at < actions.length; at += step) {
    const offset = start + at;
    const row = Math.floor(offset / cols);
    const col = offset % cols;
    await retryBusy(() =>
      page > 0
        ? client.set_keymap_bulk({ layer, start_row: row, start_col: col, actions: actions.slice(at, at + page) })
        : client.set_key(layer, row, col, actions[at]),
    );
  }
}
