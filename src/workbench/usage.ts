import type { MacroOp } from "../vendor/rynk-wasm/rynk_wasm";
// Behavior usage analysis: where every layer, morse slot, macro, morse
// profile, fork, and combo is referenced, which are orphaned, and which
// layers cannot be reached from the default layer. Pure logic — the Usage
// tab renders the report this module produces. Who refers to what comes from
// the reference graph (src/domain); this module turns it into a report.

import type {
  ComboDefinition,
  Fork,
  KeyAction,
  Morse,
  MorseProfileEntry,
} from "../vendor/rynk-wasm/rynk_wasm";
import type { LayerMetadata } from "../session/types";
import { layerName as nameOfLayer } from "../model/layer-names";
import { activators, attributedEdges, buildGraph, keyActionIsBound, keyActionReferences, layerRef, reachableLayers, referencedBy } from "../domain";
import type { Attributed, Ref } from "../domain";
import { comboIsEmpty, comboLayerList } from "../model/combos";
import { forkIsEmpty, morseIsEmpty } from "../model/slots";
import { decodeMacros, macroPreview } from "../model/macros";

export interface UsageInput {
  layers: KeyAction[][];
  cols: number;
  defaultLayer: number;
  layerMetadata: LayerMetadata[] | null;
  combos: ComboDefinition[];
  morse: Morse[];
  forks: Fork[];
  macroOps: MacroOp[][];
  morseProfiles: MorseProfileEntry[];
}

/** One place a reference appears, e.g. "Layer 0 · r3c6" or "Combo 4". */
export type Site = string;

/** Where a site is, so a screen can take the user there. A key sits at a
 *  matrix row and column of a layer; combos and forks are numbered slots. */
export type SiteTarget =
  | { kind: "cell"; layer: number; row: number; col: number }
  | { kind: "combo" | "fork"; index: number };

/** A site with the place it points to; `label` is the same text as the plain
 *  site list. */
export interface SiteRef {
  label: Site;
  target: SiteTarget | null;
}

export interface LayerUsage {
  layer: number;
  name: string;
  boundKeys: number;
  /** Sites that can activate this layer, with the action kind. */
  activators: Site[];
  /** The same sites, each with where it is. */
  activatorSites: SiteRef[];
  reachable: boolean;
  isDefault: boolean;
}

export interface SlotUsage {
  index: number;
  refs: Site[];
  /** The same sites, each with where it is. */
  refSites: SiteRef[];
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
  /** The layers the combo is limited to; null when it works on every layer. */
  layers: number[] | null;
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

/** What a key binding refers to, grouped by kind, each in order. Kept for
 *  callers that want the lists; the graph (src/domain) is the source of truth. */
interface Refs {
  /** Layer references that activate the target. */
  activates: number[];
  /** All layer references, activating or not (LayerOff). */
  layers: number[];
  morse: number[];
  macros: number[];
  profiles: number[];
}

export function keyActionRefs(keyAction: KeyAction): Refs {
  const refs: Refs = { activates: [], layers: [], morse: [], macros: [], profiles: [] };
  for (const { kind, to } of keyActionReferences(keyAction)) {
    const index = to.kind === "cell" ? -1 : to.index;
    if (kind === "activates") {
      refs.activates.push(index);
      refs.layers.push(index);
    } else if (kind === "deactivates") refs.layers.push(index);
    else if (kind === "morse") refs.morse.push(index);
    else if (kind === "invokes") refs.macros.push(index);
    else refs.profiles.push(index);
  }
  return refs;
}

function comboParts(combo: ComboDefinition): {
  triggers: KeyAction[];
  output: KeyAction;
  layers: number[] | null;
} {
  const layers = comboLayerList(combo) ?? null;
  if ("Actions" in combo) {
    return { triggers: combo.Actions.actions, output: combo.Actions.output, layers };
  }
  return { triggers: [], output: combo.Positions.output, layers };
}

/** Names places in the report's words and says where they are. A place is a key
 *  ("Layer 0 · r3c6"), a combo ("Combo 4") or a fork ("Fork 1"); a reference a
 *  morse slot passes on is named after the slot and the key that uses it. */
function siteLabeller(input: Pick<UsageInput, "cols" | "layerMetadata">) {
  const layerName = (layer: number): string => nameOfLayer(input.layerMetadata, layer);
  const siteOf = (ref: Ref): Site => {
    if (ref.kind === "cell") {
      return `${layerName(ref.layer)} · r${Math.floor(ref.offset / input.cols)}c${ref.offset % input.cols}`;
    }
    return `${ref.kind === "combo" ? "Combo" : "Fork"} ${ref.index}`;
  };
  const siteOfEntry = (entry: Attributed): Site =>
    entry.via && entry.via.kind === "morse"
      ? `Morse ${entry.via.index} via ${siteOf(entry.owner)}`
      : siteOf(entry.owner);
  /** Where a site is. A reference passed on by a morse slot points at the key that uses the slot. */
  const targetOf = (ref: Ref): SiteTarget | null => {
    if (ref.kind === "cell") {
      return { kind: "cell", layer: ref.layer, row: Math.floor(ref.offset / input.cols), col: ref.offset % input.cols };
    }
    return ref.kind === "combo" || ref.kind === "fork" ? { kind: ref.kind, index: ref.index } : null;
  };
  const siteRefOfEntry = (entry: Attributed): SiteRef => ({ label: siteOfEntry(entry), target: targetOf(entry.owner) });
  return { siteOf, siteOfEntry, targetOf, siteRefOfEntry };
}

/** Every place that refers to a layer: a key or combo that turns it on or off,
 *  or a combo limited to it, directly or through a morse slot. */
export function layerReferences(
  input: Pick<UsageInput, "layers" | "cols" | "layerMetadata" | "combos" | "morse" | "forks">,
  layer: number,
): SiteRef[] {
  const graph = buildGraph({
    layers: input.layers,
    cols: input.cols,
    combos: input.combos,
    morse: input.morse,
    forks: input.forks,
    macroCount: 0,
    profileSlots: [],
  });
  const { siteRefOfEntry } = siteLabeller(input);
  return referencedBy(attributedEdges(graph), layerRef(layer)).map(siteRefOfEntry);
}

/** `decode` is how macro ops become macros; it is a parameter so the analysis
 *  can run without the wasm decoder. */
export function analyzeUsage(input: UsageInput, decode: typeof decodeMacros = decodeMacros): UsageReport {
  const warnings: string[] = [];
  const layerName = (layer: number): string => nameOfLayer(input.layerMetadata, layer);

  const decodedMacros = decode(input.macroOps);
  const graph = buildGraph({
    layers: input.layers,
    cols: input.cols,
    combos: input.combos,
    morse: input.morse,
    forks: input.forks,
    macroCount: decodedMacros.length,
    profileSlots: input.morseProfiles.map((entry) => entry.index),
  });
  const attributed = attributedEdges(graph);

  const { siteOf, siteOfEntry, targetOf, siteRefOfEntry } = siteLabeller(input);

  // Layer activators and reachability.
  const activatorsByLayer = activators(attributed);
  const reachable = reachableLayers(attributed, input.defaultLayer);

  const occupied = (layer: number): boolean =>
    input.layerMetadata
      ? (input.layerMetadata[layer]?.occupied ?? false)
      : input.layers[layer]?.some(keyActionIsBound) === true;

  const layers: LayerUsage[] = input.layers.map((cells, layer) => {
    const usage: LayerUsage = {
      layer,
      name: layerName(layer),
      boundKeys: cells.filter(keyActionIsBound).length,
      activators: (activatorsByLayer.get(layer) ?? []).map(siteOfEntry),
      activatorSites: (activatorsByLayer.get(layer) ?? []).map(siteRefOfEntry),
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
  for (const [target, entries] of activatorsByLayer) {
    if (target >= input.layers.length) {
      warnings.push(`Layer ${target} does not exist but is referenced by ${siteOfEntry(entries[0])}.`);
    }
  }

  // Morse slots: referenced by the places themselves, not through another slot.
  const morse: SlotUsage[] = input.morse.map((_, index) => ({ index, refs: [], refSites: [] }));
  for (const owner of graph.owners) {
    for (const edge of owner.edges) {
      if (edge.kind !== "morse" || edge.to.kind !== "morse") continue;
      const index = edge.to.index;
      if (morse[index]) {
        morse[index].refs.push(siteOf(owner.ref));
        morse[index].refSites.push({ label: siteOf(owner.ref), target: targetOf(owner.ref) });
      } else {
        warnings.push(`Morse slot ${index} does not exist but is referenced by ${siteOf(owner.ref)}.`);
      }
    }
  }
  morse.forEach((slot, index) => {
    if (!morseIsEmpty(input.morse[index]) && slot.refs.length === 0) {
      warnings.push(`Morse slot ${index} is configured but nothing references it.`);
    }
  });

  // Macros: referenced by a place or by a morse slot a place refers to.
  const macros: MacroUsage[] = decodedMacros.map((macro, index) => ({
    index,
    refs: [],
    refSites: [],
    preview: macroPreview(macro),
  }));
  for (const entry of attributed) {
    if (entry.edge.kind !== "invokes" || entry.edge.to.kind !== "macro") continue;
    const index = entry.edge.to.index;
    if (macros[index]) {
      macros[index].refs.push(siteOfEntry(entry));
      macros[index].refSites.push(siteRefOfEntry(entry));
    }
    else warnings.push(`Macro ${index} does not exist but is referenced by ${siteOfEntry(entry)}.`);
  }
  macros.forEach((macro, index) => {
    if (decodedMacros[index].steps.length > 0 && macro.refs.length === 0) {
      warnings.push(`Macro ${index} is configured but nothing references it.`);
    }
  });

  // Morse profiles.
  const profileRefs = new Map<number, number>();
  for (const owner of graph.owners) {
    for (const edge of owner.edges) {
      if (edge.kind !== "profile" || edge.to.kind !== "profile") continue;
      profileRefs.set(edge.to.index, (profileRefs.get(edge.to.index) ?? 0) + 1);
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
  const boundActions = input.layers.flat().filter(keyActionIsBound);
  for (const combo of input.combos) {
    if (!comboIsEmpty(combo)) boundActions.push(comboParts(combo).output);
  }
  // Membership, not pairwise comparison: the naive `some(same(...))` re-encoded
  // every bound action once per fork and once per combo trigger.
  const boundKeys = new Set(boundActions.map((action) => JSON.stringify(action)));
  const forks: ForkUsage[] = input.forks.map((fork, index) => {
    const triggerBound = forkIsEmpty(fork) || boundKeys.has(JSON.stringify(fork.trigger));
    if (!triggerBound) {
      warnings.push(`Fork ${index}'s trigger is not bound anywhere, so it can never fire.`);
    }
    return { index, triggerBound };
  });

  // Action-triggered combos need every trigger action bound somewhere.
  const combos: ComboUsage[] = input.combos.map((combo, index) => {
    const { triggers, layers } = comboParts(combo);
    if (comboIsEmpty(combo)) return { index, layers, unboundTriggers: 0 };
    const unboundTriggers = triggers.filter(
      (trigger) => trigger !== "Transparent" && !boundKeys.has(JSON.stringify(trigger)),
    ).length;
    if (unboundTriggers > 0) {
      warnings.push(
        `Combo ${index} has ${unboundTriggers} trigger action(s) not bound on any layer.`,
      );
    }
    const present = layers?.filter((layer) => layer < input.layers.length) ?? [];
    if (present.length > 0 && !present.some((layer) => reachable.has(layer))) {
      warnings.push(`Combo ${index} is scoped to unreachable ${present.map(layerName).join(", ")}.`);
    }
    return { index, layers, unboundTriggers };
  });

  return { layers, morse, macros, profiles, forks, combos, warnings };
}
