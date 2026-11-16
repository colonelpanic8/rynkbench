// Copy and paste of one key's binding, on the system clipboard when the
// browser allows it and inside Rynkbench otherwise. The Ctrl/⌘ C and V
// shortcuts and the key quick menu run the same steps; the planning itself is
// pure (keyManipulation.ts).

import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { KeyAction } from "../../model/action-types";

import { useWorkbench } from "../state";
import { type WorkbenchState } from "../../workbench";
import {
  keyClipboardShortcut,
  parseKeyActionClipboard,
  pasteStillTargets,
  planClipboardAction,
  serializeKeyAction,
  type ClipboardBoard,
} from "./keyManipulation";
import { useKeyText } from "../useKeyText";

function clipboardBoard(state: WorkbenchState, cols: number): ClipboardBoard {
  return { layers: state.layers, cols, pending: state.pending };
}

/** Returns the step that copies or pastes for a selection, and listens for
 *  the keyboard shortcuts. The step returns whether it acted. */
export function useKeyClipboard(
  latestStateRef: MutableRefObject<WorkbenchState>,
  report: (message: string) => void,
): (shortcut: "copy" | "paste", selection: WorkbenchState["selection"]) => boolean {
  const keyText = useKeyText();
  const { bundle, io } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const localClipboardRef = useRef<KeyAction | null>(null);

  // Copy and paste of one key's binding: the Ctrl/⌘ C and V shortcuts and the
  // key's quick menu run the same steps. Returns whether it acted.
  const runClipboard = (shortcut: "copy" | "paste", selection: WorkbenchState["selection"]): boolean => {
    const snapshot = latestStateRef.current;
    const plan = planClipboardAction(
      shortcut,
      selection,
      snapshot.uiLayer,
      clipboardBoard(snapshot, cols),
    );
    if (plan.kind === "ignore") return false;
    if (plan.kind === "blocked") {
      report(plan.message);
      return true;
    }
    const target = plan.target;
    const { layer: selectedLayer, row, col, action } = target;

    if (plan.kind === "copy") {
      localClipboardRef.current = structuredClone(action);
      if (!navigator.clipboard?.writeText) {
        report(
          "Copied within Rynkbench; system clipboard access is unavailable.",
        );
        return true;
      }
      void navigator.clipboard.writeText(serializeKeyAction(action)).then(
        () =>
          report(
            `Copied ${keyText.describe(action)} from ${keyText.layer(selectedLayer)}, r${row} c${col}.`,
          ),
        () =>
          report(
            "Copied within Rynkbench; the browser did not allow system clipboard access.",
          ),
      );
      return true;
    }

    const paste = async (pasted: KeyAction | null) => {
      if (!pasted) {
        report(
          "The clipboard does not contain a Rynkbench key binding.",
        );
        return;
      }
      // Reading the clipboard is asynchronous, so the key may have moved on.
      if (!pasteStillTargets(target, clipboardBoard(latestStateRef.current, cols))) {
        report(
          "Paste cancelled because the selected key changed.",
        );
        return;
      }
      const result = await io.setKey(selectedLayer, row, col, pasted);
      report(
        result.ok
          ? `Pasted ${keyText.describe(pasted)} to ${keyText.layer(selectedLayer)}, r${row} c${col}.`
          : result.guarded
            ? result.message
            : `Paste failed: ${result.message}`,
      );
    };
    if (!navigator.clipboard?.readText) {
      void paste(
        localClipboardRef.current &&
          structuredClone(localClipboardRef.current),
      );
      return true;
    }
    void navigator.clipboard.readText().then(
      (text) => paste(parseKeyActionClipboard(text)),
      () =>
        paste(
          localClipboardRef.current &&
            structuredClone(localClipboardRef.current),
        ),
    );
    return true;
  };
  const runClipboardRef = useRef(runClipboard);
  useEffect(() => {
    runClipboardRef.current = runClipboard;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = keyClipboardShortcut(event);
      if (shortcut === null || window.getSelection()?.isCollapsed === false) return;
      if (runClipboardRef.current(shortcut, latestStateRef.current.selection)) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [latestStateRef]);

  return runClipboard;
}
