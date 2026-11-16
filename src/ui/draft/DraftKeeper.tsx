// What the draft does on its own, mounted once per workbench:
// - keeps it in this browser for the keyboard (by serial), so closing the tab
//   or losing the connection loses nothing, and offers it back next time;
// - asks before the page closes while changes are not on the keyboard;
// - in Live mode, sends lighting once the painting pauses (a scene is written
//   whole, so not on every stroke).

import { useEffect, useRef } from "react";
import { readSetting, SETTING_KEYS, writeSetting } from "../settings";
import { useWorkbench } from "../state";
import { draftSnapshot, parseStoredDraft } from "../../workbench/draft/changes";
import { earlierDraft, setEarlier } from "./earlier";
import { useDraft } from "./useDraft";
import { useLink } from "./link";

/** How long Live waits after the last change before writing it. */
const LIVE_PAUSE_MS = 600;

export function DraftKeeper() {
  const { bundle, state, dispatch } = useWorkbench();
  const draft = useDraft();
  const key = SETTING_KEYS.draft(bundle.info.serial_number);
  const offered = useRef(false);

  // On connect: offer a draft kept from before, unless this one already has changes.
  useEffect(() => {
    if (draft.offline || offered.current) return;
    offered.current = true;
    const kept = parseStoredDraft(readSetting(key));
    setEarlier(kept && kept.size > 0 && draft.size === 0 ? kept : null);
    return () => setEarlier(null);
    // Once per keyboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Keep the draft for this keyboard, a moment after each change.
  useEffect(() => {
    if (draft.offline || earlierDraft.get()) return;
    const timer = setTimeout(() => {
      const snapshot = draftSnapshot(state);
      writeSetting(key, snapshot ? JSON.stringify(snapshot) : "");
    }, 400);
    return () => clearTimeout(timer);
  }, [state, key, draft.offline]);

  // Without the keyboard, everything waits in the draft (ADR 0012).
  const { lost } = useLink();
  useEffect(() => {
    if (lost && !state.batchMode) dispatch({ type: "batchMode", enabled: true });
  }, [lost, state.batchMode, dispatch]);

  // Ask before closing the page with changes not on the keyboard.
  useEffect(() => {
    if (draft.offline || draft.size === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft.offline, draft.size]);

  // Live: what waits (lighting, lock and battery lights) goes once the painting
  // pauses, and at once when the page is hidden or closed (ADR 0012).
  const waiting = draft.live && !draft.offline ? draft.size : 0;
  const flush = useRef(draft.flush);
  flush.current = draft.flush;
  useEffect(() => {
    if (waiting === 0 || draft.sending) return;
    const timer = setTimeout(() => void flush.current(), LIVE_PAUSE_MS);
    const leave = () => {
      if (document.visibilityState === "hidden") void flush.current();
    };
    document.addEventListener("visibilitychange", leave);
    window.addEventListener("pagehide", leave);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", leave);
      window.removeEventListener("pagehide", leave);
    };
  }, [waiting, draft.sending, state.layerDrafts, state.runtimeConditionalDraft]);

  return null;
}
