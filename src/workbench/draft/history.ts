// One history in Draft, Live and a file (ADR 0018): the list of commits, each
// kept as its items with their value before and after (a patch, not two
// images), up to 100. Undo commits the inverse patch and Redo the patch again;
// the mode decides when the keyboard is written, as for any edit. A Paint
// stroke, however many keys it crosses, is one step. Send and a mode switch
// leave the history alone; Discard is a step like any other. It belongs to the
// open workbench and starts over with another keyboard or file. Pure.

import type { History, HistoryStep, LabelsChange } from "../../model/history";
import { sameValue } from "../../model/deep-equal";
import { invertPatch, joinPatches, type PatchEntry } from "../../sync";

export type { History, HistoryStep, LabelsChange };

export const HISTORY_LIMIT = 100;

export const emptyHistory = (): History => ({ past: [], future: [], stroke: "none", suspended: false });

/** Two steps one after the other as one; null when together they change nothing. */
function joinSteps(first: HistoryStep, second: HistoryStep): HistoryStep | null {
  const changes = joinPatches(first.changes, second.changes);
  const before = first.labels?.before ?? second.labels?.before;
  const after = second.labels?.after ?? first.labels?.after;
  const labels = before && after && !sameValue(before, after) ? { before, after } : undefined;
  if (changes.length === 0 && !labels) return null;
  return labels ? { changes, labels } : { changes };
}

/** A commit: a new step (the future is gone), or joined to the last one (the rest
 *  of a Paint stroke, or a write that failed and put things back). `labels`: the
 *  behavior labels, when the commit changed them (ADR 0020). */
export function recordStep(history: History, changes: readonly PatchEntry[], join = false, labels?: LabelsChange): History {
  if (history.suspended || (changes.length === 0 && !labels)) return history;
  const step: HistoryStep = labels ? { changes, labels } : { changes };
  const last = history.past.at(-1);
  if ((join || history.stroke === "joined") && last) {
    const joined = joinSteps(last, step);
    const past = joined ? [...history.past.slice(0, -1), joined] : history.past.slice(0, -1);
    return { ...history, past, future: join ? history.future : [] };
  }
  if (join) return history;
  return {
    ...history,
    past: [...history.past, step].slice(-HISTORY_LIMIT),
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
