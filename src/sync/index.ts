// The one write path (ADR 0012, docs/sync.md): read, plan the difference, write it, read back.
export type { KeyboardImage, SlotTable } from "./image";
export type { StepKind, SyncStep } from "./plan";
export { planSync, storedItems } from "./plan";
export type { ItemChange, ItemKind, SyncItem } from "./items";
export { differences, itemKey, valueAt, withValues } from "./items";
export type { Patch, PatchEntry } from "./patch";
export { applyPatch, invertPatch, joinPatches, patchBetween, rebase } from "./patch";
export { conflicts } from "./conflicts";
export type { ImageFeatures, ReadImage } from "./read";
export { mutableLighting, partsOf, profileSlots, readImage, readSettings } from "./read";
export type { SyncResult } from "./write";
export { SyncStopped, syncTo, writePlan } from "./write";
