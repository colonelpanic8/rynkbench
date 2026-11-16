// What a key face needs from the session and the preferences: the computer
// modifiers are written for, the Bluetooth profiles the firmware has, the
// pictures the board gives its own User actions, and the layer names.

import { useMemo } from "react";
import { useOs } from "../preferences";
import { useWorkbench } from "../state";
import { useLayerNames } from "../layer-names";
import { isKeyIcon, type FaceContext } from "./keyFace";
import type { KeyIconName } from "./keyIconData";

export function useFaceContext(): FaceContext {
  const os = useOs();
  const { bundle } = useWorkbench();
  const bleProfiles = bundle.caps.ble_enabled ? bundle.caps.num_ble_profiles : 0;
  const userActions = bundle.boardProfile?.userActions;
  const layerNames = useLayerNames();
  return useMemo(() => {
    const userIcons = new Map<number, KeyIconName>();
    for (const item of userActions ?? []) if (item.icon && isKeyIcon(item.icon)) userIcons.set(item.id, item.icon);
    return { os, bleProfiles, userIcons, layerNames };
  }, [os, bleProfiles, userActions, layerNames]);
}
