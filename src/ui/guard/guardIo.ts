// Rynkbench Guard at the one door every key write goes through: the io. A
// change is judged as a whole before it is made, in Live and in Draft; Send
// checks the draft again, so nothing broken reaches the keyboard (ADR 0011).
// A key the keyboard already holds is not sent at all (ADR 0012). An
// operation's result (ADR 0019) is judged by `guardJudge`, which the io calls.

import { judgeChange, keyActionIsBound } from "../../domain";
import type { GuardFinding, GuardInput } from "../../domain";
import { decodeMacros } from "../../model/macros";
import { same } from "../../model/deep-equal";
import type { KeyAction } from "../../model/action-types";
import type { ConnectedBundle } from "../../workbench";
import { keyAtPosition, keyPlaceName } from "../key-address";
import { layerName } from "../layer-names";
import { askConfirm, showToast } from "../messages/store";
import type { IoWriteResult, Judge, KeyWrite, WorkbenchIo, WorkbenchState } from "../../workbench";
import { guardInputOf } from "../../operations";
import { askRequest, overwriteRequest, stopText, type GuardNames } from "./words";
import { atBase, travelled } from "../../workbench/draft/want";

function sideOf(state: WorkbenchState, cols: number, layers: KeyAction[][]): GuardInput {
  return {
    defaultLayer: state.defaultLayer,
    source: {
      layers,
      cols,
      combos: state.combos,
      morse: state.morse,
      forks: state.forks,
      macroCount: decodeMacros(state.macroOps).length,
      profileSlots: state.morseProfiles.map((entry) => entry.index),
    },
  };
}

function withKeys(layers: KeyAction[][], cols: number, edits: readonly KeyWrite[]): KeyAction[][] {
  const next = layers.map((cells) => [...cells]);
  for (const { layer, row, col, action } of edits) if (next[layer]) next[layer][row * cols + col] = action;
  return next;
}

/** How Guard names layers and keys on this board. */
function namesFor(bundle: ConnectedBundle) {
  const cols = bundle.caps.num_cols;
  return (metadata: WorkbenchState["layerMetadata"], layers: KeyAction[][]): GuardNames => ({
    cols,
    layerName: (layer) => layerName(metadata, layer),
    keyName: (row, col) => keyPlaceName(keyAtPosition(bundle.model.keys, { row, col })),
    keysOn: (layer) => layers[layer]?.filter(keyActionIsBound).length ?? 0,
  });
}

/** null when the change may go ahead; else why it does not. */
async function verdict(findings: GuardFinding[], named: GuardNames, ask: boolean): Promise<string | null> {
  const stops = findings.filter((finding) => finding.tier === "stop");
  if (stops.length > 0) {
    const text = stopText(stops, named);
    showToast(text, { tone: "danger", guard: true });
    return text;
  }
  const asks = findings.filter((finding) => finding.tier === "ask");
  if (!ask || asks.length === 0) return null;
  return (await askConfirm(askRequest(asks, named))) ? null : "Rejected, so nothing was changed";
}

/** Guard's say on an operation's result: stop, ask, or go ahead (ADR 0019). */
export function guardJudge(bundle: ConnectedBundle): Judge {
  const cols = bundle.caps.num_cols;
  const names = namesFor(bundle);
  return async (before, after) => {
    const findings = judgeChange(guardInputOf(before, cols), guardInputOf(after, cols));
    const refused = await verdict(findings, names(after.metadata.length > 0 ? after.metadata : null, after.layers), true);
    return refused ? { ok: false, message: refused, guarded: true } : { ok: true };
  };
}

/** The io with Guard in front of every key write. */
export function guardIo(io: WorkbenchIo, bundle: ConnectedBundle, getState: () => WorkbenchState): WorkbenchIo {
  const cols = bundle.caps.num_cols;
  const named = namesFor(bundle);
  const names = (state: WorkbenchState, layers: KeyAction[][]) => named(state.layerMetadata, layers);

  /** Judges the state after a change against the state now; asks or stops as the rules say. */
  const judgedState = async (afterState: WorkbenchState, after: KeyAction[][]): Promise<IoWriteResult> => {
    const state = getState();
    const findings = judgeChange(sideOf(state, cols, state.layers), sideOf(afterState, cols, after));
    const refused = await verdict(findings, names(afterState, after), true);
    return refused ? { ok: false, message: refused, guarded: true } : { ok: true };
  };
  const judged = (edits: readonly KeyWrite[]) => judgedState(getState(), withKeys(getState().layers, cols, edits));

  return {
    ...io,
    async setKey(layer, row, col, action) {
      // RMK stores the row segment of every key it is sent, unchanged or not (ADR 0012, 0021).
      if (same(getState().layers[layer]?.[row * cols + col], action)) return { ok: true };
      const pass = await judged([{ layer, row, col, action }]);
      return pass.ok ? io.setKey(layer, row, col, action) : pass;
    },
    // Undo and Redo are edits like any other: what they would make is judged.
    async travel(direction) {
      const after = travelled(getState(), direction);
      if (!after) return io.travel(direction);
      const pass = await judgedState(after, after.layers);
      return pass.ok ? io.travel(direction) : pass;
    },
    // A morse, combo or fork slot can turn a layer on, so changing one is judged too.
    async setSlot(kind, index, value) {
      const state = getState();
      const table = [...state[kind]];
      table[index] = value as never;
      const pass = await judgedState({ ...state, [kind]: table }, state.layers);
      return pass.ok ? io.setSlot(kind, index, value) : pass;
    },
    // Each change in the draft was judged when it was made; Send only makes
    // sure nothing broken goes, such as a draft kept from an older session,
    // and asks before overwriting changes made on the keyboard since (ADR 0012).
    async applyBatch(options) {
      const state = getState();
      const onKeyboard = atBase(state);
      const findings = judgeChange(sideOf(onKeyboard, cols, onKeyboard.layers), sideOf(state, cols, state.layers));
      const refused = await verdict(findings, names(state, state.layers), false);
      if (refused) return { ok: false, message: refused, guarded: true };
      const named = names(state, state.layers);
      return io.applyBatch({ confirmOverwrite: (items) => askConfirm(overwriteRequest(items, named)), ...options });
    },
  };
}
