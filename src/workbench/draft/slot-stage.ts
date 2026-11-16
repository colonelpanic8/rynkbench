// Combos, morse and fork slots in the draft (ADR 0010, 0012): the slot table
// shows the drafted value at once; the edit remembers what it was based on so
// Send can tell a change made on the keyboard since. Pure reducer parts.

import { same } from "../../model/deep-equal";
import type { SlotKind, StagedSlotEdit, WorkbenchAction, WorkbenchState } from "../../model/workbench-state";

type SlotStageAction = Extract<WorkbenchAction, { type: "slotStage" | "slotStageApplied" }>;

/** The draft's id for a slot: `combos:3`. */
export const stagedSlotId = (kind: SlotKind, index: number) => `${kind}:${index}`;

function withValue(state: WorkbenchState, kind: SlotKind, index: number, value: StagedSlotEdit["value"]): WorkbenchState {
  const table = [...state[kind]] as StagedSlotEdit["value"][];
  table[index] = value;
  return { ...state, [kind]: table };
}

export function reduceStagedSlot(state: WorkbenchState, act: SlotStageAction): WorkbenchState {
  const id = stagedSlotId(act.kind, act.index);
  const { [id]: earlier, ...others } = state.stagedSlots;
  if (act.type === "slotStageApplied") return { ...state, stagedSlots: others };
  const before = earlier?.before ?? act.before ?? state[act.kind][act.index];
  const next = withValue(state, act.kind, act.index, act.value);
  // Drafted back to what the keyboard holds: nothing left to send.
  if (same(before, act.value)) return { ...next, stagedSlots: others };
  return { ...next, stagedSlots: { ...others, [id]: { kind: act.kind, index: act.index, before, value: act.value } } };
}

/** The state with every drafted slot put back as it was. */
export function discardStagedSlots(state: WorkbenchState): WorkbenchState {
  return Object.values(state.stagedSlots).reduce(
    (next, edit) => withValue(next, edit.kind, edit.index, edit.before),
    { ...state, stagedSlots: {} },
  );
}
