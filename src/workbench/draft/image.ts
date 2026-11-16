// The draft as images the sync layer understands (ADR 0012): what you want
// (the keyboard as read now, with the draft on top) and what you started from
// (the same, with each drafted item as it was when you first changed it). The
// three-way check compares them with what the keyboard holds now. Pure.

import type { KeyboardImage } from "../../sync";
import type { WorkbenchState } from "../../model/workbench-state";
import { sceneTableWithLayer } from "../../model/lighting/preview";
import { lightingDraftFor } from "../lighting-drafts";
import { changedRuleLeds, lightingLayers } from "./changes";

type Side = "before" | "action";

function withDraft(now: KeyboardImage, state: WorkbenchState, cols: number, side: Side): KeyboardImage {
  const layers = now.layers.map((cells) => [...cells]);
  for (const edit of Object.values(state.stagedKeys)) layers[edit.layer][edit.row * cols + edit.col] = edit[side];
  const encoders = now.encoders.map((row) => [...row]);
  for (const edit of Object.values(state.stagedEncoders)) {
    const value = edit[side];
    if (value) encoders[edit.layer][edit.id] = value;
  }
  const tables = { combos: [...now.combos], morse: [...now.morse], forks: [...now.forks] };
  for (const edit of Object.values(state.stagedSlots)) (tables[edit.kind] as unknown[])[edit.index] = edit[side === "action" ? "value" : "before"];
  return { ...now, layers, encoders, ...tables } as KeyboardImage;
}

/** What you want: the keyboard as read now, with every drafted change on it. */
export function draftImage(now: KeyboardImage, state: WorkbenchState, cols: number): KeyboardImage {
  const want = withDraft(now, state, cols, "action");
  const scenes = [...lightingLayers(state).keys()].reduce(
    (table, layer) => sceneTableWithLayer(table, layer, lightingDraftFor(state, layer)),
    now.scenes,
  );
  const rulesChanged = changedRuleLeds(state.runtimeConditionalDraft, state.runtimeConditionalScenes).size > 0;
  return { ...want, scenes, runtimeConditionalScenes: rulesChanged ? state.runtimeConditionalDraft : now.runtimeConditionalScenes };
}

/** What you started from: each drafted item as it was when you changed it. */
export function draftBase(now: KeyboardImage, state: WorkbenchState, cols: number): KeyboardImage {
  return { ...withDraft(now, state, cols, "before"), scenes: state.scenes, runtimeConditionalScenes: state.runtimeConditionalScenes };
}
