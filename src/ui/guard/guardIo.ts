// Rynkbench Guard at the one door every key write goes through: the io. A
// change is judged as a whole before it is made, in Live and in Draft; Send
// checks the draft again, so nothing broken reaches the keyboard (ADR 0011).
// A key the keyboard already holds is not sent at all (ADR 0012).

import { judgeChange, keyActionIsBound } from "../../domain";
import type { GuardFinding, GuardInput } from "../../domain";
import { decodeMacros } from "../../model/macros";
import { same } from "../../model/deep-equal";
import type { KeyAction } from "../../model/action-types";
import type { ConnectedBundle } from "../../workbench";
import { keyAtPosition, keyPlaceName } from "../key-address";
import { layerName } from "../layer-names";
import { askConfirm, showToast } from "../messages/store";
import type { IoWriteResult, KeyWrite, WorkbenchIo, WorkbenchState } from "../../workbench";
import { askRequest, overwriteRequest, stopText, type GuardNames } from "./words";
import { discardStagedSlots } from "../../workbench/draft/slot-stage";

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

/** The io with Guard in front of every key write. */
export function guardIo(io: WorkbenchIo, bundle: ConnectedBundle, getState: () => WorkbenchState): WorkbenchIo {
  const cols = bundle.caps.num_cols;
  const names = (state: WorkbenchState, layers: KeyAction[][]): GuardNames => ({
    cols,
    layerName: (layer) => layerName(state.layerMetadata, layer),
    keyName: (row, col) => keyPlaceName(keyAtPosition(bundle.model.keys, { row, col })),
    keysOn: (layer) => layers[layer]?.filter(keyActionIsBound).length ?? 0,
  });

  /** null when the change may go ahead; else why it does not. */
  const verdict = async (findings: GuardFinding[], named: GuardNames, ask: boolean): Promise<string | null> => {
    const stops = findings.filter((finding) => finding.tier === "stop");
    if (stops.length > 0) {
      const text = stopText(stops, named);
      showToast(text, { tone: "danger", guard: true });
      return text;
    }
    const asks = findings.filter((finding) => finding.tier === "ask");
    if (!ask || asks.length === 0) return null;
    return (await askConfirm(askRequest(asks, named))) ? null : "Rejected, so nothing was changed";
  };

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
    async setKey(layer, row, col, action, options) {
      // RMK stores every key it is sent; one it already holds costs flash for nothing (ADR 0012).
      if (same(getState().layers[layer]?.[row * cols + col], action)) return { ok: true };
      const pass = await judged([{ layer, row, col, action }]);
      return pass.ok ? io.setKey(layer, row, col, action, options) : pass;
    },
    // A morse, combo or fork slot can turn a layer on, so changing one is judged too.
    async setSlot(kind, index, value) {
      const state = getState();
      const table = [...state[kind]];
      table[index] = value as never;
      const pass = await judgedState({ ...state, [kind]: table }, state.layers);
      return pass.ok ? io.setSlot(kind, index, value) : pass;
    },
    async writeKeys(edits, options) {
      const layers = getState().layers;
      const changed = edits.filter(({ layer, row, col, action }) => !same(layers[layer]?.[row * cols + col], action));
      for (let skipped = edits.length - changed.length; skipped > 0; skipped -= 1) options?.onWritten?.(true);
      if (changed.length === 0) return { ok: true };
      const pass = await judged(changed);
      return pass.ok ? io.writeKeys(changed, options) : pass;
    },
    // Each change in the draft was judged when it was made; Send only makes
    // sure nothing broken goes, such as a draft kept from an older session,
    // and asks before overwriting changes made on the keyboard since (ADR 0012).
    async applyBatch(options) {
      const state = getState();
      const staged = Object.values(state.stagedKeys).map((edit) => ({ ...edit, action: edit.before }));
      const onKeyboard = withKeys(state.layers, cols, staged);
      const findings = judgeChange(sideOf(discardStagedSlots(state), cols, onKeyboard), sideOf(state, cols, state.layers));
      const refused = await verdict(findings, names(state, state.layers), false);
      if (refused) return { ok: false, message: refused, guarded: true };
      const named = names(state, state.layers);
      return io.applyBatch({ confirmOverwrite: (items) => askConfirm(overwriteRequest(items, named)), ...options });
    },
  };
}
