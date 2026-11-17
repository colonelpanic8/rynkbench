// The tabs of the panel below the keyboard (EditorPanel.tsx), in GLIDE's order:
// Pick Key, Switch Layer, Other Behaviors, then Key Lighting.

import { useCapabilities } from "../use-capabilities";

export type EditorTab = "pick" | "layer" | "behaviors" | "lighting";

/** The tabs a panel offers; Key Lighting only for a key on a board with layer lighting. */
export function useEditorTabs(withLighting: boolean): EditorTab[] {
  const capabilities = useCapabilities();
  const lighting = withLighting && (capabilities.has("lighting.scenes") || capabilities.has("lighting.compiled"));
  return lighting ? ["pick", "layer", "behaviors", "lighting"] : ["pick", "layer", "behaviors"];
}
