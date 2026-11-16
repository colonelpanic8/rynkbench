import type {
  Combo,
  ComboDefinition,
  KeyAction,
  MatrixPosition,
  PositionCombo,
} from "../vendor/rynk-wasm/rynk_wasm";
import { same } from "./deep-equal";

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

/** A new combo made on the canvas: it matches keys by their place. */
export function newPositionCombo(): ComboDefinition {
  return { Positions: { positions: [], output: "No", layer: undefined } };
}

/** Whether the key is one of the combo's keys: by its place, or, for a combo
 *  that matches actions, by what the key does on the combo's layer. */
export function comboHasKey(definition: ComboDefinition, key: MatrixPosition, action: KeyAction): boolean {
  return comboIsActions(definition)
    ? definition.Actions.actions.some((candidate) => same(candidate, action))
    : definition.Positions.positions.some((position) => samePosition(position, key));
}

export type ComboToggle =
  | { ok: true; combo: ComboDefinition }
  | { ok: false; reason: "full" | "no-action" };

/** The combo with the key added, or taken out when it is in already. An empty
 *  combo starts as a new one that matches places. A combo that matches actions
 *  cannot take a key that does nothing. */
export function toggleComboKey(
  definition: ComboDefinition,
  key: MatrixPosition,
  action: KeyAction,
  maxKeys: number,
): ComboToggle {
  const combo = comboIsEmpty(definition) ? newPositionCombo() : definition;
  const full = comboTriggerCount(combo) >= maxKeys;
  if (comboIsActions(combo)) {
    const { actions } = combo.Actions;
    if (actions.some((candidate) => same(candidate, action))) {
      return { ok: true, combo: { Actions: { ...combo.Actions, actions: actions.filter((a) => !same(a, action)) } } };
    }
    if (action === "No" || action === "Transparent") return { ok: false, reason: "no-action" };
    if (full) return { ok: false, reason: "full" };
    return { ok: true, combo: { Actions: { ...combo.Actions, actions: [...actions, action] } } };
  }
  const { positions } = combo.Positions;
  if (positions.some((position) => samePosition(position, key))) {
    const rest = positions.filter((position) => !samePosition(position, key));
    return { ok: true, combo: { Positions: { ...combo.Positions, positions: rest } } };
  }
  if (full) return { ok: false, reason: "full" };
  const place = { row: key.row, col: key.col };
  return { ok: true, combo: { Positions: { ...combo.Positions, positions: [...positions, place] } } };
}

/** What a combo still needs before it does anything: a second key, then an action. */
export function comboNeeds(definition: ComboDefinition): "keys" | "action" | null {
  if (comboTriggerCount(definition) < 2) return "keys";
  if (comboOutput(definition) === "No") return "action";
  return null;
}

/** Combos that use the same keys as the one at `index` (same layer or every layer). */
export function comboTwins(combos: readonly ComboDefinition[], index: number): number[] {
  const own = combos[index];
  if (!own || comboTriggerCount(own) === 0) return [];
  const keyOf = (definition: ComboDefinition) =>
    comboIsActions(definition)
      ? definition.Actions.actions.map((action) => JSON.stringify(action)).sort().join("|")
      : definition.Positions.positions.map((p) => `${p.row}:${p.col}`).sort().join("|");
  const overlaps = (a: number | undefined, b: number | undefined) => a === undefined || b === undefined || a === b;
  return combos.flatMap((other, i) =>
    i !== index &&
    comboIsActions(other) === comboIsActions(own) &&
    keyOf(other) === keyOf(own) &&
    overlaps(comboLayer(other), comboLayer(own))
      ? [i]
      : [],
  );
}
