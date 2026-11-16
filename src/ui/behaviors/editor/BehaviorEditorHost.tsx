// Draws the behavior editor window (ADR 0020) on the page's body while one is
// open, with the editor for its kind.

import { createPortal } from "react-dom";
import { closeBehaviorEditor, useBehaviorEditor } from "./store";
import { MorseEditor } from "./MorseEditor";
import { MacroEditor } from "./MacroEditor";
import { ForkEditor } from "./ForkEditor";
import { ProfileEditor } from "./ProfileEditor";

export function BehaviorEditorHost() {
  const target = useBehaviorEditor();
  if (!target) return null;
  const key = `${target.kind}:${target.focus}`;
  const props = { focus: target.focus, onClose: closeBehaviorEditor };
  const editor = {
    morse: <MorseEditor key={key} {...props} />,
    macros: <MacroEditor key={key} {...props} />,
    forks: <ForkEditor key={key} {...props} />,
    profiles: <ProfileEditor key={key} {...props} />,
  }[target.kind];
  return createPortal(editor, document.body);
}
