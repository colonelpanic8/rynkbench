// Keeps the behavior labels (ADR 0020) in this browser for the keyboard (by
// serial): read when it connects, without those on slots the keyboard holds
// nothing in, and saved a moment after each change. A file brings its own.

import { useEffect, useRef } from "react";
import { readSetting, SETTING_KEYS, writeSetting } from "../settings";
import { useWorkbench } from "../state";
import { labelsFromText, labelsToText } from "../../model/behavior-labels";
import { labelsFor } from "../../workbench/labels";

export function LabelKeeper() {
  const { bundle, state, dispatch } = useWorkbench();
  const offline = bundle.session.kind === "offline";
  const key = SETTING_KEYS.behaviorLabels(bundle.info.serial_number);
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    if (offline || loaded.current === key) return;
    loaded.current = key;
    const kept = labelsFromText(readSetting(key));
    dispatch({ type: "labelsLoaded", labels: labelsFor(kept, state.base) });
    // Once per keyboard: the base is what it held when it connected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, offline]);

  useEffect(() => {
    if (offline || loaded.current !== key) return;
    const timer = setTimeout(() => writeSetting(key, labelsToText(state.labels)), 400);
    return () => clearTimeout(timer);
  }, [state.labels, key, offline]);

  return null;
}
