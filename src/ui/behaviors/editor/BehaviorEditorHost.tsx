// Draws the behavior editor window (ADR 0020) on the page's body while one is
// open, with the editor for its kind.

import { createPortal } from "react-dom";
import { closeBehaviorEditor, useBehaviorEditor } from "./store";
import { MorseEditor } from "./MorseEditor";

export function BehaviorEditorHost() {
  const target = useBehaviorEditor();
  if (!target) return null;
  const key = `${target.kind}:${target.focus}`;
  switch (target.kind) {
    case "morse":
      return createPortal(<MorseEditor key={key} focus={target.focus} onClose={closeBehaviorEditor} />, document.body);
    default:
      return null;
  }
}
