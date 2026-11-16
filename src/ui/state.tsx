// The workbench in React: one context the screens read with useWorkbench().
// The state, reducer and io it carries are the screen-free core in
// src/workbench (ADR 0017).

import { createContext, useContext } from "react";
import type { Dispatch } from "react";
import type { ConnectedBundle, WorkbenchAction, WorkbenchState } from "../model/workbench-state";
import type { WorkbenchIo } from "../workbench";

export interface WorkbenchContextValue {
  bundle: ConnectedBundle;
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  /** Bound async operations (optimistic writes, lighting transactions). */
  io: WorkbenchIo;
  history: {
    canUndo: boolean;
    canRedo: boolean;
    phase: "idle" | "writing" | "undoing" | "redoing";
    error: string | null;
    undoLabel: string | null;
    redoLabel: string | null;
    undo(): Promise<void>;
    redo(): Promise<void>;
  };
}

export const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function useWorkbench(): WorkbenchContextValue {
  const ctx = useContext(WorkbenchContext);
  if (!ctx) throw new Error("useWorkbench outside WorkbenchContext");
  return ctx;
}
