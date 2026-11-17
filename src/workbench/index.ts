// The workbench without a screen (ADR 0017): the state, the reducer that
// changes it and the io that writes it to the keyboard. Screens import these
// from here; the draft (draft/) and the reports (usage, layer-impact) by file.

export type {
  Mode,
  LightingTarget,
  Selection,
  ConnectedBundle,
  PendingInfo,
  SlotKind,
  SlotValueOf,
  WritableField,
  FieldValue,
  FieldWriteAction,
  WorkbenchState,
  ExtensionParamSet,
  ExtensionParamWrite,
  WorkbenchAction,
} from "../model/workbench-state";
export { initialWorkbenchState } from "./initial-state";
export { makeWorkbenchReducer } from "./reducer";
export { encoderPendingId, keyPendingId, slotPendingId } from "./pending";
export {
  lightingBaseFor,
  lightingDraftFor,
  paramEffects,
} from "./lighting-drafts";
export {
  canTravel,
  hasPendingConfigurationWrite,
  draftEditCount,
  pointingDraftDirty,
} from "./draft/selectors";
export { draftOf, isDrafted, type Draft } from "./draft/want";
export type { History, HistoryStep } from "./draft/history";
export {
  makeIo,
  keepingCurrent,
  ioFeaturesFor,
  NO_IO_FEATURES,
  type IoFeatures,
  type IoOptions,
  type IoWriteResult,
  type KeyWrite,
  type WorkbenchDispatch,
  type WorkbenchIo,
} from "./io";
export { factsOf, ledNodesOf, passEverything, type Judge } from "./apply";
