// Applying an operation (ADR 0019): run it on what you want, let Guard judge
// the result, make it one commit (one Undo step), and let the mode decide when
// the keyboard is written: in Draft on Send, in Live at once through Send's
// path. In Live it is all or nothing: a send that stops part-way is put back.

import type { ConnectedBundle, WorkbenchState } from "../model/workbench-state";
import { runOperation, type InputOf, type OperationFacts, type OperationName } from "../operations";
import { applyPatch, patchBetween, type KeyboardImage } from "../sync";
import { sendStaged } from "./draft/send";
import { wantOf } from "./draft/want";
import type { IoContext, IoWriteResult } from "./io";

/** Guard's say on a change from what you want now to `after`: the screen asks
 *  the person; without one, everything goes ahead. */
export type Judge = (before: KeyboardImage, after: KeyboardImage) => Promise<IoWriteResult>;

export const passEverything: Judge = async () => ({ ok: true });

/** What the keyboard is but does not store, as the operations need it. */
export function factsOf(state: WorkbenchState, context: Pick<IoContext, "cols" | "features" | "ledNodes">): OperationFacts {
  return {
    cols: context.cols,
    sceneCapacity: context.features.sceneCapacity,
    ruleCapacity: context.features.conditionalSceneCapacity,
    activeLayers: state.activeLayers.filter((layer) => layer !== state.defaultLayer),
    compiledScenes: state.compiledScenes,
    compiledRules: state.conditionalScenes,
    ledNodes: context.ledNodes,
  };
}

/** Which half of a split board each LED is on: a lock or battery light watches its own half. */
export function ledNodesOf(bundle: Pick<ConnectedBundle, "caps" | "model">): Record<number, number> {
  const nodes: Record<number, number> = {};
  if (!bundle.caps.is_split) return nodes;
  for (const key of bundle.model.keys) if (key.ledId !== undefined && key.address?.startsWith("RH")) nodes[key.ledId] = 1;
  return nodes;
}

export interface CommitOptions {
  /** A layer rewrite's order (destination → source slot): the layer on show follows. */
  layerOrder?: number[];
}

/** Makes `after` what you want, as one commit; in Live the keyboard follows. */
export async function commitImage(context: IoContext, after: KeyboardImage, options: CommitOptions = {}): Promise<IoWriteResult> {
  const { getState, dispatch } = context;
  const sending: IoWriteResult = { ok: false, message: "the draft is being sent" };
  if (getState().batchBusy) return sending;
  const before = wantOf(getState());
  const change = patchBetween(before, after);
  if (change.length === 0) return { ok: true };
  const pass = await context.judge(before, after);
  if (!pass.ok) return pass;
  if (getState().batchBusy) return sending;
  dispatch({ type: "commit", image: after, layerOrder: options.layerOrder });
  if (getState().batchMode) return { ok: true };

  const send = () => sendStaged(context);
  const sent = await send();
  if (sent.ok) return sent;
  // Live is all or nothing: what the change set goes back, joined to the same
  // step, and the keyboard with it.
  dispatch({ type: "commit", image: applyPatch(wantOf(getState()), change, "before"), join: true });
  const back = await send();
  return {
    ok: false,
    message: back.ok ? `${sent.message}; nothing was changed` : `${sent.message}; putting it back failed too: ${back.message}`,
  };
}

/** Runs an operation on what you want and commits its result. */
export function applyOperation<Name extends OperationName>(context: IoContext, name: Name, input: InputOf<Name>): Promise<IoWriteResult> {
  const state = context.getState();
  const result = runOperation(name, wantOf(state), input, factsOf(state, context));
  if (!result.ok) return Promise.resolve({ ok: false, message: result.message });
  return commitImage(context, result.image, { layerOrder: result.layerOrder });
}
