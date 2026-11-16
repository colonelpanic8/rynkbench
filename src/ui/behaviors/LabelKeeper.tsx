// Keeps the behavior labels (ADR 0020) in this browser for the keyboard (by
// serial): read when it connects, without those on slots the keyboard holds
// nothing in, and saved a moment after each change. A TOML file opened without
// a keyboard brings its own.

import { useEffect, useRef } from "react";
import { readSetting, SETTING_KEYS, writeSetting } from "../settings";
import { useWorkbench } from "../state";
import { labelsFromText, labelsToText } from "../../model/behavior-labels";
import { labelsFromToml } from "../../config/behavior-labels";

export function LabelKeeper() {
  const { bundle, state, dispatch } = useWorkbench();
  const offline = bundle.session.kind === "offline";
  const key = SETTING_KEYS.behaviorLabels(bundle.info.serial_number);
  const loaded = useRef<string | null>(null);

  const fileText = bundle.workspace?.format === "toml" ? bundle.workspace.sourceText : null;
  useEffect(() => {
    if (loaded.current === key) return;
    loaded.current = key;
    if (offline) {
      if (fileText) dispatch({ type: "labelsLoaded", labels: labelsFromToml(fileText) });
      return;
    }
    dispatch({ type: "labelsLoaded", labels: labelsFromText(readSetting(key)) });
  }, [key, offline, fileText, dispatch]);

  useEffect(() => {
    if (offline || loaded.current !== key) return;
    const timer = setTimeout(() => writeSetting(key, labelsToText(state.labels)), 400);
    return () => clearTimeout(timer);
  }, [state.labels, key, offline]);

  return null;
}
