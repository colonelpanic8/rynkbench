// The reducer's settings part: pointing, the combo, morse and fork slots
// written at once, whole-value settings (macros, behavior, hold-trigger
// positions) and morse profiles. Its cases are the reducer's own, moved here
// unchanged (ADR 0017).

import type { ComboDefinition, Fork, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import type { SlotKind, WorkbenchAction, WorkbenchState } from "../model/workbench-state";
import type { KeyboardImage } from "../sync";
import { FIELD_STATE_KEY } from "../model/workbench-state";
import { normalizePointingConfig } from "../model/pointing";
import { slotPendingId } from "./pending";

const SETTINGS_ACTION_TYPES = [
  "pointingDraftSet",
  "pointingDraftReset",
  "pointingWriteStart",
  "pointingWriteErr",
  "pointingReloaded",
  "slotWriteStart",
  "slotWriteOk",
  "slotWriteErr",
  "slotErrDismiss",
  "fieldWriteStart",
  "fieldWriteErr",
  "fieldWriteOk",
  "pendingErrDismiss",
] as const;

export type SettingsAction = Extract<WorkbenchAction, { type: (typeof SETTINGS_ACTION_TYPES)[number] }>;

const SETTINGS_ACTIONS = new Set<WorkbenchAction["type"]>(SETTINGS_ACTION_TYPES);

export function isSettingsAction(act: WorkbenchAction): act is SettingsAction {
  return SETTINGS_ACTIONS.has(act.type);
}

function withSlot(image: KeyboardImage, kind: SlotKind, index: number, value: ComboDefinition | Morse | Fork): KeyboardImage {
  const table = [...image[kind]] as unknown[];
  table[index] = value;
  return { ...image, [kind]: table };
}

export function reduceSettings(state: WorkbenchState, act: SettingsAction): WorkbenchState {
  switch (act.type) {
    case "pointingDraftSet":
      return {
        ...state,
        pointingDraft: normalizePointingConfig(act.config),
        pointingError: null,
      };
    case "pointingDraftReset":
      return {
        ...state,
        pointingDraft: state.pointingConfig ? structuredClone(state.pointingConfig) : null,
        pointingError: null,
      };
    case "pointingWriteStart":
      return { ...state, pointingBusy: true, pointingError: null };
    case "pointingWriteErr":
      return { ...state, pointingBusy: false, pointingError: act.message };
    case "pointingReloaded": {
      const config = normalizePointingConfig(act.config);
      return {
        ...state,
        pointingConfig: config,
        pointingDraft: structuredClone(config),
        pointingBusy: false,
        pointingError: null,
      };
    }
    case "slotWriteStart": {
      const id = slotPendingId(act.kind, act.index);
      const table = state[act.kind].slice() as Array<ComboDefinition | Morse | Fork>;
      table[act.index] = act.value;
      // Live: written at once, so the keyboard holds it (the base, ADR 0018).
      return {
        ...state,
        base: withSlot(state.base, act.kind, act.index, act.value),
        [act.kind]: table,
        pending: { ...state.pending, [id]: { status: "pending" } },
      };
    }
    case "slotWriteOk": {
      const id = slotPendingId(act.kind, act.index);
      const { [id]: _done, ...pending } = state.pending;
      return { ...state, pending };
    }
    case "slotWriteErr": {
      const id = slotPendingId(act.kind, act.index);
      const table = state[act.kind].slice() as Array<ComboDefinition | Morse | Fork>;
      table[act.index] = act.prev;
      return {
        ...state,
        base: withSlot(state.base, act.kind, act.index, act.prev),
        [act.kind]: table,
        pending: { ...state.pending, [id]: { status: "error", message: act.message } },
      };
    }
    case "slotErrDismiss": {
      const id = slotPendingId(act.kind, act.index);
      const { [id]: _gone, ...pending } = state.pending;
      return { ...state, pending };
    }
    case "fieldWriteStart":
      return {
        ...state,
        [FIELD_STATE_KEY[act.field]]: act.value,
        pending: { ...state.pending, [act.field]: { status: "pending" } },
      };
    case "fieldWriteErr":
      return {
        ...state,
        [FIELD_STATE_KEY[act.field]]: act.prev,
        pending: { ...state.pending, [act.field]: { status: "error", message: act.message } },
      };
    case "fieldWriteOk":
    case "pendingErrDismiss": {
      const id = act.type === "fieldWriteOk" ? act.field : act.id;
      const { [id]: _done, ...pending } = state.pending;
      return { ...state, pending };
    }
  }
}
