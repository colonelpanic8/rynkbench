// The catalog (ADR 0019): every operation by name, and what it takes, as plain
// data. WebMCP and Flows will list and call operations through it and
// `io.apply`; nothing is registered, and nothing outside the app reaches it.

import { setKeys, swapKeys } from "./keys";
import { deleteLayer, duplicateLayer, moveLayer } from "./layers";
import { clearLayerLights, setBatteryBar, setConnectionKey, setKeyEffects, setKeyLight } from "./lighting";
import { applyTransform } from "./transform";
import {
  createBehavior,
  deleteBehavior,
  deleteUnusedBehaviors,
  duplicateBehavior,
  pasteBehaviors,
  renameBehavior,
  setBehavior,
} from "./behaviors";
import { checkInput } from "./inputs";
import type { InputField, OperationFacts, OperationResult } from "./types";
import type { KeyboardImage } from "../sync/image";

export const OPERATIONS = {
  set_keys: setKeys,
  swap_keys: swapKeys,
  move_layer: moveLayer,
  delete_layer: deleteLayer,
  duplicate_layer: duplicateLayer,
  set_key_light: setKeyLight,
  set_key_effects: setKeyEffects,
  clear_layer_lights: clearLayerLights,
  set_connection_key: setConnectionKey,
  set_battery_bar: setBatteryBar,
  apply_transform: applyTransform,
  create_behavior: createBehavior,
  set_behavior: setBehavior,
  rename_behavior: renameBehavior,
  duplicate_behavior: duplicateBehavior,
  delete_behavior: deleteBehavior,
  delete_unused_behaviors: deleteUnusedBehaviors,
  paste_behaviors: pasteBehaviors,
} as const;

export type OperationName = keyof typeof OPERATIONS;
export type InputOf<Name extends OperationName> = Parameters<(typeof OPERATIONS)[Name]["run"]>[1];

/** One operation as the catalog lists it. */
export interface OperationInfo {
  name: OperationName;
  description: string;
  inputs: readonly InputField[];
}

export function catalog(): OperationInfo[] {
  return (Object.keys(OPERATIONS) as OperationName[]).map((name) => {
    const { description, inputs } = OPERATIONS[name];
    return { name, description, inputs };
  });
}

/** Runs an operation by name on an image; the input is checked against its fields first. */
export function runOperation<Name extends OperationName>(
  name: Name,
  image: KeyboardImage,
  input: InputOf<Name>,
  facts: OperationFacts,
): OperationResult {
  const operation = OPERATIONS[name] as { inputs: readonly InputField[]; run(image: KeyboardImage, input: unknown, facts: OperationFacts): OperationResult } | undefined;
  if (!operation) return { ok: false, message: `There is no operation called ${String(name)}` };
  const problem = checkInput(operation.inputs, input);
  if (problem) return { ok: false, message: `${name}: ${problem}` };
  return operation.run(image, input, facts);
}
