// Behavior operations (ADR 0020): create, set, rename, duplicate, delete,
// delete the unused, paste. Each changes the image and, where names go with
// the slot, the labels, as one change. Pure.

import { attributedEdges, behaviorUse, buildGraph, slotRef, type BehaviorUse } from "../domain";
import { BEHAVIOR_KINDS, freeName, labelAt, namesOf, withLabel, type BehaviorKind, type BehaviorLabels } from "../model/behavior-labels";
import type { KeyboardImage } from "../sync/image";
import { guardInputOf } from "./guard-input";
import { behaviorsFromText } from "./behavior-text";
import {
  freeSlot,
  KIND_WORD,
  profileName,
  slotsOf,
  valueOf,
  withSlot,
  type AnyBehavior,
  type BehaviorValue,
} from "./behavior-slots";
import { failed, type InputField, type Operation, type OperationFacts, type OperationResult } from "./types";

/** One behavior slot. */
export interface BehaviorPlace {
  kind: BehaviorKind;
  slot: number;
}

const KIND_FIELD: InputField = { name: "kind", kind: "choice", values: BEHAVIOR_KINDS, description: "Which kind: macros, morse (tap patterns), forks or profiles." };
const SLOT_FIELD: InputField = { name: "slot", kind: "integer", min: 0, description: "The behavior's slot number, which keys refer to." };

const done = (image: KeyboardImage, labels: BehaviorLabels): OperationResult => ({ ok: true, image, labels });

/** A behavior's name: a profile's is the keyboard's, the others' the label's. */
export function behaviorName(image: KeyboardImage, labels: BehaviorLabels, { kind, slot }: BehaviorPlace): string {
  return kind === "profiles" ? profileName(image, slot) : (labelAt(labels, kind, slot)?.name ?? "");
}

/** Every name a kind's behaviors have now. */
function takenNames(image: KeyboardImage, labels: BehaviorLabels, kind: BehaviorKind): string[] {
  if (kind !== "profiles") return namesOf(labels, kind);
  return (image.morseProfiles ?? []).flatMap((entry) => (entry ? [entry.name] : []));
}

/** Puts a behavior in a slot with its name and description, the name made free among its kind. */
function placed(
  image: KeyboardImage,
  labels: BehaviorLabels,
  facts: OperationFacts,
  { kind, value }: AnyBehavior,
  slot: number,
  name: string,
  description: string,
): { image: KeyboardImage; labels: BehaviorLabels } | string {
  const free = name.trim() ? freeName(name, takenNames(image, labels, kind)) : kind === "profiles" ? freeName(`Profile ${slot}`, takenNames(image, labels, kind)) : "";
  const next = withSlot(image, kind, slot, value, facts, free);
  if (typeof next === "string") return next;
  return { image: next, labels: withLabel(labels, kind, slot, { name: kind === "profiles" ? "" : free, description }) };
}

export const createBehavior: Operation<AnyBehavior & { name?: string; description?: string }> = {
  name: "create_behavior",
  description: "Adds a behavior in the first free slot of its kind, with a name and a description.",
  inputs: [
    KIND_FIELD,
    { name: "value", kind: "value", description: "What the slot holds: a macro's steps, a tap pattern, a fork or a profile's timing." },
    { name: "name", kind: "string", optional: true, description: "Its name; a taken name gets a number." },
    { name: "description", kind: "string", optional: true, description: "What it is for." },
  ],
  run(image, input, facts) {
    const slot = freeSlot(image, input.kind, facts);
    if (slot === null) return failed(`Every ${KIND_WORD[input.kind]} slot is in use`);
    const next = placed(image, facts.labels, facts, input, slot, input.name ?? "", input.description ?? "");
    return typeof next === "string" ? failed(next) : done(next.image, next.labels);
  },
};

/** The labels (and a profile's name) after giving a filled slot a name and, optionally, a description. */
function relabeled(
  image: KeyboardImage,
  labels: BehaviorLabels,
  facts: OperationFacts,
  { kind, slot }: BehaviorPlace,
  name: string,
  description?: string,
): { image: KeyboardImage; labels: BehaviorLabels } | string {
  const value = valueOf(image, kind, slot);
  if (!value) return `There is no ${KIND_WORD[kind]} ${slot}`;
  const wanted = name.trim();
  const own = behaviorName(image, labels, { kind, slot }).toLowerCase();
  const others = takenNames(image, labels, kind).filter((taken) => taken.toLowerCase() !== own);
  if (wanted && others.some((taken) => taken.toLowerCase() === wanted.toLowerCase())) return `Another ${KIND_WORD[kind]} is called ${wanted}`;
  const kept = description ?? labelAt(labels, kind, slot)?.description ?? "";
  const next = kind === "profiles" ? withSlot(image, kind, slot, value, facts, wanted) : image;
  if (typeof next === "string") return next;
  return { image: next, labels: withLabel(labels, kind, slot, { name: kind === "profiles" ? "" : wanted, description: kept }) };
}

const NAME_FIELD: InputField = { name: "name", kind: "string", description: "Its name, unique within its kind; empty shows the kind and number (a profile needs one)." };
const DESCRIPTION_FIELD: InputField = { name: "description", kind: "string", optional: true, description: "What it is for; left out keeps the one it has." };

export const setBehavior: Operation<AnyBehavior & { slot: number; name?: string; description?: string }> = {
  name: "set_behavior",
  description: "Sets what one behavior slot holds, and its name and description when given (an editor's Apply).",
  inputs: [
    KIND_FIELD,
    SLOT_FIELD,
    { name: "value", kind: "value", description: "What the slot holds." },
    { ...NAME_FIELD, optional: true, description: "Its name; left out keeps the one it has." },
    DESCRIPTION_FIELD,
  ],
  run(image, { kind, slot, value, name, description }, facts) {
    const current = kind === "profiles" ? profileName(image, slot) || freeName(`Profile ${slot}`, takenNames(image, facts.labels, kind)) : "";
    const set = withSlot(image, kind, slot, value, facts, kind === "profiles" && name?.trim() ? name : current);
    if (typeof set === "string") return failed(set);
    if (name === undefined && description === undefined) return { ok: true, image: set };
    const next = relabeled(set, facts.labels, facts, { kind, slot }, name ?? behaviorName(set, facts.labels, { kind, slot }), description);
    return typeof next === "string" ? failed(next) : done(next.image, next.labels);
  },
};

export const renameBehavior: Operation<BehaviorPlace & { name: string; description?: string }> = {
  name: "rename_behavior",
  description: "Gives a behavior a name (unique within its kind) and, optionally, a description.",
  inputs: [KIND_FIELD, SLOT_FIELD, NAME_FIELD, DESCRIPTION_FIELD],
  run(image, { kind, slot, name, description }, facts) {
    const next = relabeled(image, facts.labels, facts, { kind, slot }, name, description);
    return typeof next === "string" ? failed(next) : done(next.image, next.labels);
  },
};

export const duplicateBehavior: Operation<BehaviorPlace> = {
  name: "duplicate_behavior",
  description: "Copies a behavior into the first free slot of its kind, with its name made free.",
  inputs: [KIND_FIELD, SLOT_FIELD],
  run(image, { kind, slot }, facts) {
    const value = valueOf(image, kind, slot);
    if (!value) return failed(`There is no ${KIND_WORD[kind]} ${slot}`);
    const to = freeSlot(image, kind, facts);
    if (to === null) return failed(`Every ${KIND_WORD[kind]} slot is in use`);
    const name = behaviorName(image, facts.labels, { kind, slot });
    const description = labelAt(facts.labels, kind, slot)?.description ?? "";
    const next = placed(image, facts.labels, facts, { kind, value } as AnyBehavior, to, name, description);
    return typeof next === "string" ? failed(next) : done(next.image, next.labels);
  },
};

/** Clears slots and their labels; nothing when a slot is empty already. */
function cleared(image: KeyboardImage, labels: BehaviorLabels, facts: OperationFacts, places: readonly BehaviorPlace[]): OperationResult {
  let next = image;
  let nextLabels = labels;
  for (const { kind, slot } of places) {
    const after = withSlot(next, kind, slot, null, facts);
    if (typeof after === "string") return failed(after);
    next = after;
    nextLabels = withLabel(nextLabels, kind, slot, null);
  }
  return done(next, nextLabels);
}

export const deleteBehavior: Operation<BehaviorPlace> = {
  name: "delete_behavior",
  description: "Empties a behavior's slot and forgets its name; what used it then does nothing.",
  inputs: [KIND_FIELD, SLOT_FIELD],
  run(image, place, facts) {
    if (!valueOf(image, place.kind, place.slot)) return failed(`There is no ${KIND_WORD[place.kind]} ${place.slot}`);
    return cleared(image, facts.labels, facts, [place]);
  },
};

const REF_KIND = { macros: "macro", morse: "morse", profiles: "profile" } as const;

/** How every filled slot is used, by `kind:slot`. Forks apply everywhere, so they count as used. */
export function behaviorUses(image: KeyboardImage, cols: number): Map<string, BehaviorUse> {
  const graph = buildGraph(guardInputOf(image, cols).source);
  const attributed = attributedEdges(graph);
  const uses = new Map<string, BehaviorUse>();
  for (const kind of BEHAVIOR_KINDS) {
    (slotsOf(image, kind) ?? []).forEach((value, slot) => {
      if (!value) return;
      const use = kind === "forks" ? "used" : behaviorUse(graph, attributed, slotRef(REF_KIND[kind], slot), image.morse.length);
      uses.set(`${kind}:${slot}`, use);
    });
  }
  return uses;
}

export const deleteUnusedBehaviors: Operation<{ items?: readonly BehaviorPlace[] }> = {
  name: "delete_unused_behaviors",
  description: "Deletes every behavior nothing uses (or only those of `items`), including those only unused ones use.",
  inputs: [{ name: "items", kind: "value", list: true, optional: true, description: "Only these ({ kind, slot }); the used ones among them stay." }],
  run(image, { items }, facts) {
    const uses = behaviorUses(image, facts.cols);
    const wanted = items ? new Set(items.map(({ kind, slot }) => `${kind}:${slot}`)) : null;
    const places = [...uses.entries()]
      .filter(([key, use]) => use !== "used" && (!wanted || wanted.has(key)))
      .map(([key]) => {
        const [kind, slot] = key.split(":");
        return { kind: kind as BehaviorKind, slot: Number(slot) };
      });
    return places.length === 0 ? { ok: true, image } : cleared(image, facts.labels, facts, places);
  },
};

export const pasteBehaviors: Operation<{ text: string }> = {
  name: "paste_behaviors",
  description: "Adds copied behaviors, each in a free slot of its kind under a free name; nothing when they do not all fit.",
  inputs: [{ name: "text", kind: "string", description: "Behaviors as Copy writes them." }],
  run(image, { text }, facts) {
    const items = behaviorsFromText(text);
    if (typeof items === "string") return failed(items);
    let next = image;
    let labels = facts.labels;
    for (const item of items) {
      const slot = freeSlot(next, item.kind, facts);
      if (slot === null) return failed(`No free ${KIND_WORD[item.kind]} slot for ${item.name || `a ${KIND_WORD[item.kind]}`}`);
      const after = placed(next, labels, facts, item, slot, item.name, item.description);
      if (typeof after === "string") return failed(after);
      ({ image: next, labels } = after);
    }
    return done(next, labels);
  },
};

export type { AnyBehavior, BehaviorValue };
