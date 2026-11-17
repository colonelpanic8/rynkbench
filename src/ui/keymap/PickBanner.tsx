// The banner over the keymap canvas while a status setup chooses its keys
// (ui/lighting/keyPick.ts): what is being picked and on which layer, how many
// keys are chosen, Cancel (Escape too) and Done. Done installs the setup as one
// operation, so it joins the draft and is one Undo step, then ends the pick.
// The pick is for the layer shown: it starts on the setup's layer and follows
// another one shown meanwhile, keeping the keys chosen.

import { useEffect } from "react";
import { selectedKeys } from "../../model/key-selection";
import type { KeyView } from "../../model/keyboard";
import { pickName, pickPrompt, planPick, type KeyPick, type PickedKey } from "../../model/lighting/key-pick";
import { MarqueeIcon } from "../icons";
import { Button } from "../kit";
import { layerName } from "../layer-names";
import { keyPick } from "../lighting/keyPick";
import { showToast } from "../messages/store";
import { useWorkbench } from "../state";

/** The chosen keys that can be lit, in the order they were chosen. */
function pickedKeys(board: readonly KeyView[], chosen: ReturnType<typeof selectedKeys>): PickedKey[] {
  return chosen.flatMap((place) => {
    const key = board.find((each) => each.row === place.row && each.col === place.col);
    return key?.ledId === undefined ? [] : [{ row: key.row, col: key.col, ledId: key.ledId, x: key.shape.rect.x, y: key.shape.rect.y }];
  });
}

export function PickBanner({ pick: started }: { pick: KeyPick }) {
  const { bundle, state, dispatch, io } = useWorkbench();
  const pick = { ...started, layer: state.uiLayer };
  const keys = pickedKeys(bundle.model.keys, selectedKeys(state.selection));
  const plan = planPick(pick, keys);
  const layer = layerName(state.layerMetadata, pick.layer);

  const stop = () => {
    keyPick.stop();
    dispatch({ type: "select", selection: null });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      keyPick.stop();
      dispatch({ type: "select", selection: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  const done = async () => {
    if (!plan.ok) return;
    const result = plan.name === "set_connection_key" ? await io.apply(plan.name, plan.input) : await io.apply(plan.name, plan.input);
    if (!result.ok) {
      if (!result.guarded) showToast(`Nothing was installed: ${result.message}`, { tone: "danger" });
      return;
    }
    showToast(`The ${pickName(pick)} is on ${layer}`, { tone: "ok" });
    stop();
  };

  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 rounded-full border border-accent bg-panel/90 py-1.5 pr-2 pl-4 text-small font-medium text-ink shadow-lg backdrop-blur"
    >
      <MarqueeIcon size={14} className="shrink-0 text-accent" />
      <span className="min-w-0 truncate">
        {pickPrompt(pick, layer)}
        {keys.length > 0 && <span className="text-mute"> · {keys.length} chosen</span>}
      </span>
      <Button variant="ghost" className="shrink-0 px-2 py-0.5 text-small" onClick={stop}>
        Cancel
      </Button>
      <Button
        variant="primary"
        className="shrink-0 px-2.5 py-0.5 text-small"
        disabled={!plan.ok}
        reason={plan.ok ? undefined : plan.problem}
        onClick={() => void done()}
      >
        Done
      </Button>
    </div>
  );
}
