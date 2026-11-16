// Behavior slots in an image, one way for every kind (ADR 0020): what a slot
// holds, which slot is free, and the image with a slot set or cleared. Macros
// are one region with a slot per macro; morse and forks are fixed tables;
// profiles are slots that hold a named entry or nothing. Pure.

import type { Fork, MacroOp, Morse, MorseProfile, MorseProfileEntry } from "../vendor/rynk-wasm/rynk_wasm";
import type { BehaviorKind } from "../model/behavior-labels";
import { emptyFork, emptyMorse, forkIsEmpty, morseIsEmpty } from "../model/slots";
import { macroTableSize } from "../model/macros";
import type { KeyboardImage } from "../sync/image";
import type { OperationFacts } from "./types";

/** What one slot of each kind holds. A profile's name is the entry's, kept apart. */
export interface BehaviorValues {
  macros: MacroOp[];
  morse: Morse;
  forks: Fork;
  profiles: MorseProfile;
}

export type BehaviorValue = BehaviorValues[BehaviorKind];

/** A behavior of any kind, with its value. */
export type AnyBehavior = { [K in BehaviorKind]: { kind: K; value: BehaviorValues[K] } }[BehaviorKind];

/** The longest name a tap-hold profile can have on the keyboard. */
export const PROFILE_NAME_MAX = 32;

/** The kind's word in a message. */
export const KIND_WORD: Record<BehaviorKind, string> = { macros: "macro", morse: "tap pattern", forks: "fork", profiles: "profile" };

/** Each slot's value, null where it is empty; null when the image has no such table. */
export function slotsOf(image: KeyboardImage, kind: BehaviorKind): (BehaviorValue | null)[] | null {
  switch (kind) {
    case "macros":
      return image.macroOps ? image.macroOps.map((ops) => (ops.length > 0 ? ops : null)) : null;
    case "morse":
      return image.morse.map((morse) => (morseIsEmpty(morse) ? null : morse));
    case "forks":
      return image.forks.map((fork) => (forkIsEmpty(fork) ? null : fork));
    case "profiles":
      return image.morseProfiles ? image.morseProfiles.map((entry) => entry?.profile ?? null) : null;
  }
}

export function valueOf(image: KeyboardImage, kind: BehaviorKind, slot: number): BehaviorValue | null {
  return slotsOf(image, kind)?.[slot] ?? null;
}

/** How many slots the kind has: macros may grow up to their slots. */
export function slotCount(image: KeyboardImage, kind: BehaviorKind, facts: OperationFacts): number {
  if (kind === "macros") return image.macroOps ? Math.max(image.macroOps.length, facts.macroSpace?.slots ?? 0) : 0;
  return slotsOf(image, kind)?.length ?? 0;
}

/** The first empty slot, or null when every slot holds one. */
export function freeSlot(image: KeyboardImage, kind: BehaviorKind, facts: OperationFacts, taken: ReadonlySet<number> = new Set()): number | null {
  const slots = slotsOf(image, kind) ?? [];
  for (let slot = 0; slot < slotCount(image, kind, facts); slot += 1) if (!slots[slot] && !taken.has(slot)) return slot;
  return null;
}

/** A profile's name on the keyboard. */
export function profileName(image: KeyboardImage, slot: number): string {
  return image.morseProfiles?.[slot]?.name ?? "";
}

/** The image with one slot set (null clears it), or why it cannot be. `name` is a profile's. */
export function withSlot(
  image: KeyboardImage,
  kind: BehaviorKind,
  slot: number,
  value: BehaviorValue | null,
  facts: OperationFacts,
  name = "",
): KeyboardImage | string {
  if (!Number.isInteger(slot) || slot < 0 || slot >= slotCount(image, kind, facts)) {
    return slotCount(image, kind, facts) === 0 ? `This keyboard has no ${KIND_WORD[kind]}s` : `There is no ${KIND_WORD[kind]} ${slot}`;
  }
  switch (kind) {
    case "macros": {
      const macros = [...(image.macroOps ?? [])];
      while (macros.length <= slot) macros.push([]);
      // Cleared in place, so later macros keep their numbers and the keys that run them.
      macros[slot] = value ? [...(value as MacroOp[])] : [];
      const space = facts.macroSpace;
      if (space && macroTableSize(macros, space.slots) > space.bytes) return "Not enough macro space left";
      return { ...image, macroOps: macros };
    }
    case "morse": {
      const morse = [...image.morse];
      morse[slot] = value ? (value as Morse) : emptyMorse();
      return { ...image, morse };
    }
    case "forks": {
      const forks = [...image.forks];
      forks[slot] = value ? (value as Fork) : emptyFork();
      return { ...image, forks };
    }
    case "profiles": {
      const profiles = [...(image.morseProfiles ?? [])];
      if (value) {
        const trimmed = name.trim();
        if (!trimmed) return "A profile needs a name";
        if (trimmed.length > PROFILE_NAME_MAX) return `A profile's name has at most ${PROFILE_NAME_MAX} characters`;
        const entry: MorseProfileEntry = { index: slot, name: trimmed, profile: value as MorseProfile };
        profiles[slot] = entry;
        return { ...image, morseProfiles: profiles };
      }
      profiles[slot] = null;
      // The keyboard forgets a profile's hold-trigger positions with it.
      const positions = image.holdTriggerPositions?.filter((position) => position.profile !== slot);
      return positions ? { ...image, morseProfiles: profiles, holdTriggerPositions: positions } : { ...image, morseProfiles: profiles };
    }
  }
}
