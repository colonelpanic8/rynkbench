// Behavior usage analysis: where every layer, morse slot, macro, morse
// profile, fork, and combo is referenced, which are orphaned, and which
// layers cannot be reached from the default layer. Pure logic — the Usage
// tab renders the report this module produces.

import type {
  Action,
  ComboDefinition,
  Fork,
  KeyAction,
  Morse,
  MorseProfileEntry,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { LayerMetadata } from "../../session/types";
import { comboIsEmpty, forkIsEmpty, morseIsEmpty } from "./bits";
import { DEFAULT_TAP_HOLD_PROFILE } from "../morse";
import { decodeMacros, macroPreview } from "../macros";

export interface UsageInput {
  layers: KeyAction[][];
  cols: number;
  defaultLayer: number;
  layerMetadata: LayerMetadata[] | null;
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  macroBytes: Uint8Array;
  morseProfiles: MorseProfileEntry[];
}

/** One place a reference appears, e.g. "Layer 0 · r3c6" or "Combo 4". */
export type Site = string;

export interface LayerUsage {
  layer: number;
  name: string;
  boundKeys: number;
  /** Sites that can activate this layer, with the action kind. */
  activators: Site[];
  reachable: boolean;
  isDefault: boolean;
}

export interface SlotUsage {
  index: number;
  refs: Site[];
}

export interface MacroUsage extends SlotUsage {
  preview: string;
}

export interface ProfileUsage {
  index: number;
  name: string;
  refs: number;
}

export interface ForkUsage {
  index: number;
  /** Whether the trigger action appears anywhere in the keymap. */
  triggerBound: boolean;
}

export interface ComboUsage {
  index: number;
  layer: number | null;
  /** For action-triggered combos: trigger actions missing from the keymap. */
  unboundTriggers: number;
}

export interface UsageReport {
  layers: LayerUsage[];
  morse: SlotUsage[];
  macros: MacroUsage[];
  profiles: ProfileUsage[];
  forks: ForkUsage[];
  combos: ComboUsage[];
  warnings: string[];
}

interface Refs {
  /** Layer references that activate the target. */
  activates: number[];
  /** All layer references, activating or not (LayerOff). */
  layers: number[];
  morse: number[];
  macros: number[];
  profiles: number[];
}

function emptyRefs(): Refs {
  return { activates: [], layers: [], morse: [], macros: [], profiles: [] };
}

function actionRefs(action: Action, refs: Refs): void {
  if (typeof action === "string") return;
  if ("LayerOn" in action) {
    refs.activates.push(action.LayerOn);
    refs.layers.push(action.LayerOn);
  } else if ("LayerOnWithModifier" in action) {
    refs.activates.push(action.LayerOnWithModifier[0]);
    refs.layers.push(action.LayerOnWithModifier[0]);
  } else if ("LayerOff" in action) {
    refs.layers.push(action.LayerOff);
  } else if ("LayerToggle" in action) {
    refs.activates.push(action.LayerToggle);
    refs.layers.push(action.LayerToggle);
  } else if ("LayerToggleOnly" in action) {
    refs.activates.push(action.LayerToggleOnly);
    refs.layers.push(action.LayerToggleOnly);
  } else if ("DefaultLayer" in action) {
    refs.activates.push(action.DefaultLayer);
    refs.layers.push(action.DefaultLayer);
  } else if ("PersistentDefaultLayer" in action) {
    refs.activates.push(action.PersistentDefaultLayer);
    refs.layers.push(action.PersistentDefaultLayer);
  } else if ("OneShotLayer" in action) {
    refs.activates.push(action.OneShotLayer);
    refs.layers.push(action.OneShotLayer);
  } else if ("TriggerMacro" in action) {
    refs.macros.push(action.TriggerMacro);
  }
}

export function keyActionRefs(keyAction: KeyAction): Refs {
  const refs = emptyRefs();
  if (typeof keyAction === "string") return refs;
  if ("Single" in keyAction) {
    actionRefs(keyAction.Single, refs);
  } else if ("Tap" in keyAction) {
    actionRefs(keyAction.Tap, refs);
  } else if ("TapHold" in keyAction) {
    actionRefs(keyAction.TapHold[0], refs);
    actionRefs(keyAction.TapHold[1], refs);
    if (keyAction.TapHold[2] !== DEFAULT_TAP_HOLD_PROFILE) {
      refs.profiles.push(keyAction.TapHold[2]);
    }
  } else if ("Morse" in keyAction) {
    refs.morse.push(keyAction.Morse);
  } else if ("LayerModTap" in keyAction) {
    refs.activates.push(keyAction.LayerModTap[0]);
    refs.layers.push(keyAction.LayerModTap[0]);
  }
  return refs;
}

function isBound(keyAction: KeyAction): boolean {
  if (keyAction === "No" || keyAction === "Transparent") return false;
  if (typeof keyAction === "object" && "Single" in keyAction && keyAction.Single === "No") {
    return false;
  }
  return true;
}

function comboParts(combo: ComboDefinition): {
  triggers: KeyAction[];
  output: KeyAction;
  layer: number | null;
} {
  if ("Actions" in combo) {
    return {
      triggers: combo.Actions.actions,
      output: combo.Actions.output,
      layer: combo.Actions.layer ?? null,
    };
  }
  return { triggers: [], output: combo.Positions.output, layer: combo.Positions.layer ?? null };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function analyzeUsage(input: UsageInput): UsageReport {
  const warnings: string[] = [];
  const layerName = (layer: number): string =>
    input.layerMetadata?.[layer]?.name || `Layer ${layer}`;

  // Every reference-bearing site: keymap cells, morse slot actions (attributed
  // to the layers that reference the slot), combo triggers/outputs, forks.
  interface SiteRefs {
    site: Site;
    fromLayer: number | null;
    refs: Refs;
  }
  const sites: SiteRefs[] = [];

  input.layers.forEach((cells, layer) => {
    cells.forEach((keyAction, offset) => {
      const refs = keyActionRefs(keyAction);
      const row = Math.floor(offset / input.cols);
      const col = offset % input.cols;
      sites.push({ site: `${layerName(layer)} · r${row}c${col}`, fromLayer: layer, refs });
    });
  });
  input.combos.forEach((combo, index) => {
    const { triggers, output, layer } = comboParts(combo);
    if (comboIsEmpty(combo)) return;
    const refs = emptyRefs();
    for (const trigger of triggers) mergeRefs(refs, keyActionRefs(trigger));
    mergeRefs(refs, keyActionRefs(output));
    sites.push({ site: `Combo ${index}`, fromLayer: layer, refs });
  });
  input.forks.forEach((fork, index) => {
    if (forkIsEmpty(fork)) return;
    const refs = emptyRefs();
    mergeRefs(refs, keyActionRefs(fork.trigger));
    mergeRefs(refs, keyActionRefs(fork.negative_output));
    mergeRefs(refs, keyActionRefs(fork.positive_output));
    sites.push({ site: `Fork ${index}`, fromLayer: null, refs });
  });

  // Morse slot actions can themselves activate layers (e.g. hold = MO(5)).
  // Attribute them to every site that references the slot.
  const morseRefs: Refs[] = input.morse.map((slot) => {
    const refs = emptyRefs();
    for (const [, action] of slot.actions) actionRefs(action, refs);
    return refs;
  });
  const expanded: SiteRefs[] = [];
  for (const entry of sites) {
    expanded.push(entry);
    for (const slotIndex of entry.refs.morse) {
      const slot = morseRefs[slotIndex];
      if (slot) {
        expanded.push({
          site: `Morse ${slotIndex} via ${entry.site}`,
          fromLayer: entry.fromLayer,
          refs: slot,
        });
      }
    }
  }

  // Layer activators and reachability.
  const activators = new Map<number, Site[]>();
  const edges = new Map<number | null, Set<number>>();
  for (const { site, fromLayer, refs } of expanded) {
    for (const target of refs.activates) {
      if (!activators.has(target)) activators.set(target, []);
      activators.get(target)!.push(site);
      if (!edges.has(fromLayer)) edges.set(fromLayer, new Set());
      edges.get(fromLayer)!.add(target);
    }
  }
  const reachable = new Set<number>();
  const global = [...(edges.get(null) ?? [])];
  const queue = [input.defaultLayer];
  while (queue.length > 0) {
    const layer = queue.shift()!;
    if (reachable.has(layer)) continue;
    reachable.add(layer);
    for (const target of edges.get(layer) ?? []) queue.push(target);
    for (const target of global) queue.push(target);
  }

  const occupied = (layer: number): boolean =>
    input.layerMetadata
      ? (input.layerMetadata[layer]?.occupied ?? false)
      : input.layers[layer]?.some(isBound) === true;

  const layers: LayerUsage[] = input.layers.map((cells, layer) => {
    const usage: LayerUsage = {
      layer,
      name: layerName(layer),
      boundKeys: cells.filter(isBound).length,
      activators: activators.get(layer) ?? [],
      reachable: reachable.has(layer),
      isDefault: layer === input.defaultLayer,
    };
    if (!occupied(layer)) return usage;
    if (!usage.isDefault && usage.activators.length === 0) {
      warnings.push(`${usage.name} has no key, combo, or morse that activates it.`);
    } else if (!usage.reachable) {
      warnings.push(
        `${usage.name} is unreachable: its activators sit on layers that are themselves unreachable from ${layerName(input.defaultLayer)}.`,
      );
    }
    return usage;
  });
  for (const [target, siteList] of activators) {
    if (target >= input.layers.length) {
      warnings.push(`Layer ${target} does not exist but is referenced by ${siteList[0]}.`);
    }
  }

  // Morse slots.
  const morse: SlotUsage[] = input.morse.map((_, index) => ({ index, refs: [] }));
  for (const { site, refs } of sites) {
    for (const index of refs.morse) {
      if (morse[index]) morse[index].refs.push(site);
      else warnings.push(`Morse slot ${index} does not exist but is referenced by ${site}.`);
    }
  }
  morse.forEach((slot, index) => {
    if (!morseIsEmpty(input.morse[index]) && slot.refs.length === 0) {
      warnings.push(`Morse slot ${index} is configured but nothing references it.`);
    }
  });

  // Macros.
  const decodedMacros = decodeMacros(input.macroBytes);
  const macros: MacroUsage[] = decodedMacros.map((macro, index) => ({
    index,
    refs: [],
    preview: macroPreview(macro),
  }));
  for (const { site, refs } of expanded) {
    for (const index of refs.macros) {
      if (macros[index]) macros[index].refs.push(site);
      else warnings.push(`Macro ${index} does not exist but is referenced by ${site}.`);
    }
  }
  macros.forEach((macro, index) => {
    if (decodedMacros[index].steps.length > 0 && macro.refs.length === 0) {
      warnings.push(`Macro ${index} is configured but nothing references it.`);
    }
  });

  // Morse profiles.
  const profileRefs = new Map<number, number>();
  for (const { refs } of sites) {
    for (const index of refs.profiles) {
      profileRefs.set(index, (profileRefs.get(index) ?? 0) + 1);
    }
  }
  const profiles: ProfileUsage[] = input.morseProfiles.map((entry) => ({
    index: entry.index,
    name: entry.name,
    refs: profileRefs.get(entry.index) ?? 0,
  }));
  for (const profile of profiles) {
    if (profile.refs === 0) {
      warnings.push(
        `Tap-hold profile "${profile.name}" (slot ${profile.index}) is never used by a key.`,
      );
    }
  }
  for (const index of profileRefs.keys()) {
    if (!input.morseProfiles.some((entry) => entry.index === index)) {
      warnings.push(`Tap-hold profile slot ${index} is used by a key but holds no profile.`);
    }
  }

  // Forks fire when their trigger action is typed; a trigger absent from the
  // whole keymap (and every combo output) can never fire.
  const boundActions = input.layers.flat().filter(isBound);
  for (const combo of input.combos) {
    if (!comboIsEmpty(combo)) boundActions.push(comboParts(combo).output);
  }
  const forks: ForkUsage[] = input.forks.map((fork, index) => {
    const triggerBound =
      forkIsEmpty(fork) || boundActions.some((action) => same(action, fork.trigger));
    if (!triggerBound) {
      warnings.push(`Fork ${index}'s trigger is not bound anywhere, so it can never fire.`);
    }
    return { index, triggerBound };
  });

  // Action-triggered combos need every trigger action bound somewhere.
  const combos: ComboUsage[] = input.combos.map((combo, index) => {
    const { triggers, layer } = comboParts(combo);
    if (comboIsEmpty(combo)) return { index, layer, unboundTriggers: 0 };
    const unboundTriggers = triggers.filter(
      (trigger) =>
        trigger !== "Transparent" && !boundActions.some((action) => same(action, trigger)),
    ).length;
    if (unboundTriggers > 0) {
      warnings.push(
        `Combo ${index} has ${unboundTriggers} trigger action(s) not bound on any layer.`,
      );
    }
    if (layer !== null && layer < input.layers.length && !reachable.has(layer)) {
      warnings.push(`Combo ${index} is scoped to unreachable ${layerName(layer)}.`);
    }
    return { index, layer, unboundTriggers };
  });

  return { layers, morse, macros, profiles, forks, combos, warnings };
}

function mergeRefs(into: Refs, from: Refs): void {
  into.activates.push(...from.activates);
  into.layers.push(...from.layers);
  into.morse.push(...from.morse);
  into.macros.push(...from.macros);
  into.profiles.push(...from.profiles);
}
