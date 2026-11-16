// Operations (ADR 0019): named, pure changes from one keyboard image to another.
export type { InputField, InputKind, Operation, OperationFacts, OperationResult } from "./types";
export type { InputOf, OperationInfo, OperationName } from "./catalog";
export { catalog, OPERATIONS, runOperation } from "./catalog";
export { checkInput } from "./inputs";
export { guardInputOf } from "./guard-input";
export type { KeyPlace, KeySet } from "./keys";
export type { TransformChoice } from "./transform";
export { planTransform } from "./transform";
export type { AnyBehavior, BehaviorPlace, BehaviorValue } from "./behaviors";
export { behaviorName, behaviorUses } from "./behaviors";
export type { BehaviorValues } from "./behavior-slots";
export { freeSlot, KIND_WORD, PROFILE_NAME_MAX, slotsOf, valueOf } from "./behavior-slots";
export type { CopiedBehavior } from "./behavior-text";
export { behaviorsAsText, behaviorsFromText } from "./behavior-text";
