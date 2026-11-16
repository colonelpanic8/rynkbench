// The pill at the top of the keymap canvas, as in GLIDE: what is happening
// (a move under way, what a move or paste did) or, until dismissed, how to use
// the canvas. Dismissing the hint is remembered in this browser.

import { useSyncExternalStore } from "react";
import { createSetting, SETTING_KEYS } from "../settings";
import { CloseIcon } from "../icons";

const hintDismissed = createSetting(SETTING_KEYS.canvasHintDismissed, (raw) => raw === "1", (value) => (value ? "1" : "0"));

const HINT = "Click a key to edit • Right-click for options • Drag to swap";

export function CanvasPill({ message }: { message: string | null }) {
  const dismissed = useSyncExternalStore(hintDismissed.subscribe, hintDismissed.get, hintDismissed.get);
  if (!message && dismissed) return null;
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 rounded-full border border-line-strong bg-panel/90 py-1.5 pr-2 pl-4 text-small font-medium text-mute shadow-lg backdrop-blur"
    >
      <span className="truncate">{message ?? HINT}</span>
      {!message && (
        <button
          type="button"
          aria-label="Hide this hint"
          title="Hide this hint"
          onClick={() => hintDismissed.set(true)}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-faint hover:bg-hover hover:text-ink"
        >
          <CloseIcon size={10} />
        </button>
      )}
    </div>
  );
}
