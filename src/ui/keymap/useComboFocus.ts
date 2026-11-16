// The combo open in Focus Mode and what can be done to it: add or remove a
// key, change its action or layer, finish, or discard it. Each change is
// written at once, like a key edit. The canvas pill and the combo editor
// below the keyboard share this.

import type { KeyAction } from "../../model/action-types";
import {
  comboIsEmpty,
  comboLayer,
  comboNeeds,
  comboTriggerCount,
  comboTwins,
  comboWithLayer,
  comboWithOutput,
  newPositionCombo,
  toggleComboKey,
} from "../../model/combos";
import { emptyCombo } from "../../model/slots";
import { showToast } from "../messages/store";
import { useWorkbench } from "../state";

export function useComboFocus() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const index = state.selection?.type === "combo" ? state.selection.index : null;
  if (index === null) return null;

  const stored = state.combos[index];
  const combo = stored && !comboIsEmpty(stored) ? stored : newPositionCombo();
  const maxKeys = bundle.caps.max_combo_keys;
  const write = (next: typeof combo) => io.setSlot("combos", index, next);
  const close = () => dispatch({ type: "select", selection: null });

  return {
    index,
    combo,
    maxKeys,
    keys: comboTriggerCount(combo),
    needs: comboNeeds(combo),
    twins: comboTwins(state.combos, index),
    /** The layer the combo's keys are shown on: its own, else the one in view. */
    layer: comboLayer(combo) ?? state.uiLayer,

    toggle(key: { row: number; col: number }, action: KeyAction) {
      const result = toggleComboKey(combo, key, action, maxKeys);
      if (result.ok) return void write(result.combo);
      showToast(
        result.reason === "full"
          ? `Key not added: a combo has at most ${maxKeys} keys`
          : "Key not added: it does nothing on this layer, and this combo matches what keys do",
      );
    },
    setOutput: (output: KeyAction) => write(comboWithOutput(combo, output)),
    setLayer: (layer: number | undefined) => write(comboWithLayer(combo, layer)),

    /** Close Focus Mode. A combo left without keys is removed, so it does not hold a slot unseen. */
    done() {
      if (stored && !comboIsEmpty(stored) && comboTriggerCount(stored) === 0) {
        void io.setSlot("combos", index, emptyCombo());
        showToast("Empty combo removed");
      }
      close();
    },

    /** Remove the combo; the toast can put it back. */
    discard() {
      close();
      if (!stored || comboIsEmpty(stored)) return;
      void io.setSlot("combos", index, emptyCombo());
      showToast("Combo discarded", { action: { label: "Undo", run: () => void io.setSlot("combos", index, stored) } });
    },
  };
}

export type ComboFocus = NonNullable<ReturnType<typeof useComboFocus>>;
