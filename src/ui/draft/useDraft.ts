// The draft, as the status chip and the review window use it. In Draft mode
// changes stay in Rynkbench until Send writes them all to the keyboard in one
// go; in Live mode each change goes at once. RMK stores every write, so the
// draft is held here, not on the keyboard (docs/adr/0010-draft-and-live.md).

import { useMemo, useRef } from "react";
import { askConfirm, showToast } from "../messages/store";
import { useWorkbench } from "../state";
import { draftGroups, draftSize, lightingLayers, type DraftGroup } from "../../workbench/draft/changes";
import { discardDraftHistory, resetDraftHistory } from "./useDraftHistory";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function useDraft() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const latest = useRef(state);
  latest.current = state;
  const groups = useMemo(() => draftGroups(state), [state]);
  const size = draftSize(groups);
  const sending = state.batchBusy || state.lightingBusy;

  return {
    /** A file has no keyboard to send to: everything is the file's. */
    offline: bundle.session.kind === "offline",
    live: !state.batchMode,
    groups,
    size,
    sending,

    /** Sends everything; true when the keyboard has it all. */
    async send(): Promise<boolean> {
      if (sending || size === 0) return size === 0;
      const total = size;
      const sent = await io.applyBatch();
      if (!sent.ok && sent.guarded) return false; // Guard has said why
      resetDraftHistory();
      const left = draftSize(draftGroups(latest.current));
      if (sent.ok && left === 0) {
        showToast(`${plural(total, "change")} sent: the keyboard has them all`, { tone: "ok" });
        return true;
      }
      const why = sent.ok ? "" : ` (${sent.message})`;
      showToast(`${plural(left, "change")} could not be sent and stay in the draft${why}: try Send again`, { tone: "danger" });
      return false;
    },

    /** Live: what is waiting (lighting, lock and battery lights) goes through the same path as Send. */
    async flush(): Promise<void> {
      if (!sending && size > 0) await io.applyBatch();
    },

    async discard() {
      const yes = await askConfirm({
        title: `Discard ${plural(size, "change")}?`,
        body: "They are not on the keyboard, and they will be gone. The keyboard keeps what it has.",
        confirmLabel: "Discard",
        danger: true,
      });
      if (yes) discardAll();
    },

    /** Drops one group of the review window. */
    discardGroup(group: DraftGroup) {
      const now = latest.current;
      if (group.area === "keys") {
        for (const edit of Object.values(now.stagedKeys).filter((edit) => edit.layer === group.layer)) {
          dispatch({ type: "keyStage", layer: edit.layer, row: edit.row, col: edit.col, action: edit.before });
        }
      } else if (group.area === "encoders") {
        for (const edit of Object.values(now.stagedEncoders).filter((edit) => edit.layer === group.layer)) {
          if (edit.before) dispatch({ type: "encoderStage", layer: edit.layer, id: edit.id, action: edit.before });
        }
      } else if (group.area === "combos" || group.area === "morse" || group.area === "forks") {
        for (const edit of Object.values(now.stagedSlots).filter((edit) => edit.kind === group.area)) {
          dispatch({ type: "slotStage", kind: edit.kind, index: edit.index, value: edit.before });
        }
      } else if (group.area === "lighting") {
        dispatch({ type: "draftReset", target: group.layer });
      } else {
        dispatch({ type: "conditionalDraftReset" });
      }
    },

    async setLive(live: boolean) {
      if (!live) return dispatch({ type: "batchMode", enabled: true });
      if (size > 0) return;
      const yes = await askConfirm({
        title: "Send each change to the keyboard at once?",
        body:
          "In Live mode every change is written to the keyboard's memory as you make it, which wears it a little with each write. " +
          "Planning several changes? Stay in Draft and send them once.",
        confirmLabel: "Turn on Live",
      });
      if (yes) dispatch({ type: "batchMode", enabled: false });
    },
  };

  function discardAll() {
    discardDraftHistory();
    dispatch({ type: "batchDiscard" });
    for (const layer of lightingLayers(latest.current).keys()) dispatch({ type: "draftReset", target: layer });
    dispatch({ type: "conditionalDraftReset" });
  }
}

export type Draft = ReturnType<typeof useDraft>;
