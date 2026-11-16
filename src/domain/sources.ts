// The edge table: one row per place a reference can live. Each row says how to
// find the places of that kind and which references each one holds. Everything
// that asks "what refers to what" (the usage report, impact of deleting a
// layer, reachability) reads the graph built from these rows, so a new place a
// reference can live is one new row here and nowhere else.
//
// This is the one file in the domain layer that knows the shape of the
// protocol's actions; the rest of the layer is free of it, and a test keeps it
// that way. When the domain gets types of its own, this file is what changes.

import type { Action, ComboDefinition, Fork, KeyAction, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import { comboIsEmpty } from "../model/combos";
import { DEFAULT_TAP_HOLD_PROFILE } from "../model/morse";
import { forkIsEmpty } from "../model/slots";
import { cellRef, layerRef, slotRef } from "./refs";
import type { EdgeKind, Ref } from "./refs";

/** What the graph is built from: the keymap and every slot table. */
export interface GraphSource {
  layers: KeyAction[][];
  cols: number;
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  /** How many macros exist; their contents are not needed. */
  macroCount: number;
  /** The tap-hold profile slots that hold a profile. */
  profileSlots: number[];
}

export interface Reference {
  kind: EdgeKind;
  to: Ref;
}

/** The action variants that carry a layer, one row each. This is the single
 *  place that knows which variants do, for both reading a reference (the graph)
 *  and rewriting it (moving or deleting a layer). */
interface LayerVariant {
  /** The variant's key, as the wire format names it. */
  tag: string;
  kind: "activates" | "deactivates";
  /** Where the layer sits in the payload: the value itself, or the first
   *  element of a pair (the second is something else, such as a modifier). */
  shape: "value" | "pair";
}

const LAYER_VARIANTS: LayerVariant[] = [
  { tag: "LayerOn", kind: "activates", shape: "value" },
  { tag: "LayerOnWithModifier", kind: "activates", shape: "pair" },
  { tag: "LayerOff", kind: "deactivates", shape: "value" },
  { tag: "LayerToggle", kind: "activates", shape: "value" },
  { tag: "LayerToggleOnly", kind: "activates", shape: "value" },
  { tag: "DefaultLayer", kind: "activates", shape: "value" },
  { tag: "PersistentDefaultLayer", kind: "activates", shape: "value" },
  { tag: "OneShotLayer", kind: "activates", shape: "value" },
];

function layerOfAction(action: Action): { variant: LayerVariant; layer: number } | undefined {
  if (typeof action === "string") return undefined;
  const payload = action as Record<string, unknown>;
  for (const variant of LAYER_VARIANTS) {
    if (!(variant.tag in payload)) continue;
    const value = payload[variant.tag];
    return { variant, layer: variant.shape === "pair" ? (value as [number, unknown])[0] : (value as number) };
  }
  return undefined;
}

/** Whether a key binding does something: not empty (No) and not falling
 *  through to the layer below (Transparent). */
export function keyActionIsBound(keyAction: KeyAction): boolean {
  if (keyAction === "No" || keyAction === "Transparent") return false;
  return !(typeof keyAction === "object" && "Single" in keyAction && keyAction.Single === "No");
}

/** References held by one action, in the order they appear. */
export function actionReferences(action: Action): Reference[] {
  const carried = layerOfAction(action);
  if (carried) return [{ kind: carried.variant.kind, to: layerRef(carried.layer) }];
  if (typeof action !== "string" && "TriggerMacro" in action) {
    return [{ kind: "invokes", to: slotRef("macro", action.TriggerMacro) }];
  }
  return [];
}

/** The same action with every layer it carries passed through `change`; an
 *  action that carries none comes back as it was. */
export function mapActionLayers(action: Action, change: (layer: number) => number): Action {
  const carried = layerOfAction(action);
  if (!carried) return action;
  const { variant, layer } = carried;
  const changed = change(layer);
  const payload = action as Record<string, unknown>;
  const value = variant.shape === "pair" ? [changed, (payload[variant.tag] as unknown[])[1]] : changed;
  return { [variant.tag]: value } as Action;
}

/** Where, within a key binding, a layer was found: a tap-hold's two actions
 *  are told apart so a caller can say which one. */
export type LayerPart = "tap" | "hold";

/** References held by one key binding, in the order they appear. */
export function keyActionReferences(keyAction: KeyAction): Reference[] {
  if (typeof keyAction === "string") return [];
  if ("Single" in keyAction) return actionReferences(keyAction.Single);
  if ("Tap" in keyAction) return actionReferences(keyAction.Tap);
  if ("TapHold" in keyAction) {
    const [tap, hold, profile] = keyAction.TapHold;
    const refs = [...actionReferences(tap), ...actionReferences(hold)];
    if (profile !== DEFAULT_TAP_HOLD_PROFILE) refs.push({ kind: "profile", to: slotRef("profile", profile) });
    return refs;
  }
  if ("Morse" in keyAction) return [{ kind: "morse", to: slotRef("morse", keyAction.Morse) }];
  if ("LayerModTap" in keyAction) return [activates(keyAction.LayerModTap[0])];
  return [];
}

/** The same key binding with every layer it carries passed through `change`,
 *  in the order the layers appear (a tap-hold's tap, then its hold). */
export function mapKeyActionLayers(
  keyAction: KeyAction,
  change: (layer: number, part: LayerPart | undefined) => number,
): KeyAction {
  if (typeof keyAction === "string") return keyAction;
  if ("Single" in keyAction) return { Single: mapActionLayers(keyAction.Single, (l) => change(l, undefined)) };
  if ("Tap" in keyAction) return { Tap: mapActionLayers(keyAction.Tap, (l) => change(l, undefined)) };
  if ("TapHold" in keyAction) {
    const [tap, hold, profile] = keyAction.TapHold;
    const mappedTap = mapActionLayers(tap, (l) => change(l, "tap"));
    const mappedHold = mapActionLayers(hold, (l) => change(l, "hold"));
    return { TapHold: [mappedTap, mappedHold, profile] };
  }
  if ("LayerModTap" in keyAction) {
    const [layer, modifier, key] = keyAction.LayerModTap;
    return { LayerModTap: [change(layer, undefined), modifier, key] };
  }
  return keyAction;
}

function activates(layer: number): Reference {
  return { kind: "activates", to: layerRef(layer) };
}

/** A place that holds references: the node itself, the layer it is scoped to
 *  (null when it applies everywhere), and what it refers to. */
export interface Owner {
  ref: Ref;
  scope: number | null;
  references: Reference[];
  /** True for a slot whose references count for whoever refers to the slot
   *  (a morse slot's actions), not as places in their own right. */
  indirect?: boolean;
}

/** One row of the edge table. */
export interface EdgeSource {
  /** What kind of place this row finds. */
  holds: string;
  owners(source: GraphSource): Owner[];
}

/** A combo limited to a layer refers to that layer, so the layer cannot go away under it. */
function scopeReference(scope: number | null): Reference[] {
  return scope === null ? [] : [{ kind: "scopes", to: layerRef(scope) }];
}

function comboScope(combo: ComboDefinition): number | null {
  return ("Actions" in combo ? combo.Actions.layer : combo.Positions.layer) ?? null;
}

function comboKeyActions(combo: ComboDefinition): KeyAction[] {
  return "Actions" in combo
    ? [...combo.Actions.actions, combo.Actions.output]
    : [combo.Positions.output];
}

export const EDGE_SOURCES: EdgeSource[] = [
  {
    holds: "keymap cell",
    owners: (source) =>
      source.layers.flatMap((cells, layer) =>
        cells.map((keyAction, offset) => ({
          ref: cellRef(layer, offset),
          scope: layer,
          references: keyActionReferences(keyAction),
        })),
      ),
  },
  {
    holds: "combo",
    owners: (source) =>
      source.combos.flatMap((combo, index) =>
        comboIsEmpty(combo)
          ? []
          : [
              {
                ref: slotRef("combo", index),
                scope: comboScope(combo),
                references: [
                  ...comboKeyActions(combo).flatMap(keyActionReferences),
                  ...scopeReference(comboScope(combo)),
                ],
              },
            ],
      ),
  },
  {
    holds: "fork",
    owners: (source) =>
      source.forks.flatMap((fork, index) =>
        forkIsEmpty(fork)
          ? []
          : [
              {
                ref: slotRef("fork", index),
                scope: null,
                references: [fork.trigger, fork.negative_output, fork.positive_output].flatMap(keyActionReferences),
              },
            ],
      ),
  },
  {
    holds: "morse slot action",
    owners: (source) =>
      source.morse.map((slot, index) => ({
        ref: slotRef("morse", index),
        scope: null,
        references: slot.actions.flatMap(([, action]) => actionReferences(action)),
        indirect: true,
      })),
  },
];
