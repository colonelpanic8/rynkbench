// The screens' module-level stores hold what one workbench is doing: a pick of
// keys on the board, the lit view and trying out, the open Layout properties.
// They end with the workbench, so the next keyboard opens without them.

import { lightView } from "./keymap/lightView";
import { keyPick } from "./lighting/keyPick";
import { closeProperties } from "./properties/store";

export function endWorkbench(): void {
  keyPick.stop();
  lightView.end();
  closeProperties();
}
