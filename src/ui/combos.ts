import type {
  Combo,
  ComboDefinition,
  KeyAction,
  MatrixPosition,
  PositionCombo,
} from "../vendor/rynk-wasm/rynk_wasm";

export function emptyComboDefinition(): ComboDefinition {
  return { Actions: { actions: [], output: "No", layer: undefined } };
}

export function comboIsActions(definition: ComboDefinition): definition is { Actions: Combo } {
  return "Actions" in definition;
}

export function comboIsPositions(
  definition: ComboDefinition,
): definition is { Positions: PositionCombo } {
  return "Positions" in definition;
}

export function comboOutput(definition: ComboDefinition): KeyAction {
  return comboIsActions(definition) ? definition.Actions.output : definition.Positions.output;
}

export function comboLayer(definition: ComboDefinition): number | undefined {
  return comboIsActions(definition) ? definition.Actions.layer : definition.Positions.layer;
}

export function comboTriggerCount(definition: ComboDefinition): number {
  return comboIsActions(definition)
    ? definition.Actions.actions.length
    : definition.Positions.positions.length;
}

export function comboIsEmpty(definition: ComboDefinition): boolean {
  return comboOutput(definition) === "No" && comboTriggerCount(definition) === 0;
}

export function comboWithOutput(
  definition: ComboDefinition,
  output: KeyAction,
): ComboDefinition {
  return comboIsActions(definition)
    ? { Actions: { ...definition.Actions, output } }
    : { Positions: { ...definition.Positions, output } };
}

export function comboWithLayer(
  definition: ComboDefinition,
  layer: number | undefined,
): ComboDefinition {
  return comboIsActions(definition)
    ? { Actions: { ...definition.Actions, layer } }
    : { Positions: { ...definition.Positions, layer } };
}

export function samePosition(a: MatrixPosition, b: MatrixPosition): boolean {
  return a.row === b.row && a.col === b.col;
}
