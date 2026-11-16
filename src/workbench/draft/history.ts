// One history in Draft, Live and a file (ADR 0018): the list of commits, each
// kept as its items with their value before and after (a patch, not two
// images), up to 100. Undo commits the inverse patch and Redo the patch again;
// the mode decides when the keyboard is written, as for any edit. A Paint
// stroke, however many keys it crosses, is one step. Send and a mode switch
// leave the history alone; Discard is a step like any other. It belongs to the
// open workbench and starts over with another keyboard or file. Pure.

import type { History, HistoryStep } from "../../model/history";
import { invertPatch, joinPatches, type PatchEntry } from "../../sync";

export type { History, HistoryStep };

export const HISTORY_LIMIT = 100;

export const emptyHistory = (): History => ({ past: [], future: [], stroke: "none", suspended: false });

/** A commit: a new step (the future is gone), or joined to the last one (the rest
 *  of a Paint stroke, or a write that failed and put things back). */
export function recordStep(history: History, changes: readonly PatchEntry[], join = false): History {
  if (history.suspended || changes.length === 0) return history;
  const last = history.past.at(-1);
  if ((join || history.stroke === "joined") && last) {
    const joined = joinPatches(last.changes, changes);
    const past = joined.length === 0 ? history.past.slice(0, -1) : [...history.past.slice(0, -1), { changes: joined }];
    return { ...history, past, future: join ? history.future : [] };
  }
  if (join) return history;
  return {
    ...history,
    past: [...history.past, { changes }].slice(-HISTORY_LIMIT),
    future: [],
    stroke: history.stroke === "open" ? "joined" : history.stroke,
  };
}

/** The step Undo or Redo takes, the patch that does it, and the history after. */
export function travel(history: History, direction: "undo" | "redo"): { patch: PatchEntry[]; step: HistoryStep; history: History } | null {
  const from = direction === "undo" ? history.past : history.future;
  const step = from.at(-1);
  if (!step) return null;
  const rest = from.slice(0, -1);
  const moved =
    direction === "undo"
      ? { ...history, past: rest, future: [...history.future, step], stroke: "none" as const }
      : { ...history, past: [...history.past, step], future: rest, stroke: "none" as const };
  return { patch: direction === "undo" ? invertPatch(step.changes) : [...step.changes], step, history: moved };
}
