// The tabs of the panel below the keyboard (EditorPanel.tsx).

import { useCapabilities } from "../use-capabilities";

export type EditorTab = "pick" | "layer" | "lighting" | "all";

/** The tabs a panel offers; Lighting only for a key on a board with layer lighting. */
export function useEditorTabs(withLighting: boolean): EditorTab[] {
  const capabilities = useCapabilities();
  const lighting = withLighting && (capabilities.has("lighting.scenes") || capabilities.has("lighting.compiled"));
  return lighting ? ["pick", "layer", "lighting", "all"] : ["pick", "layer", "all"];
}
