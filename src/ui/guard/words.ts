// What Rynkbench Guard says about its findings: consequence first, with
// counts; names and places go behind Show details (ADR 0011).

import type { GuardFinding, Ref } from "../../domain";
import type { SyncItem } from "../../sync";
import type { ConfirmRequest } from "../messages/store";

/** How the layout names its parts, for the words. */
export interface GuardNames {
  cols: number;
  layerName(layer: number): string;
  keyName(row: number, col: number): string;
  /** Keys on a layer that do something, after the change. */
  keysOn(layer: number): number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function placeName(ref: Ref, names: GuardNames): string {
  switch (ref.kind) {
    case "cell":
      return `${names.layerName(ref.layer)} · ${names.keyName(Math.floor(ref.offset / names.cols), ref.offset % names.cols)}`;
    case "layer":
      return names.layerName(ref.index);
    case "morse":
      return `Morse slot ${ref.index}`;
    default:
      return `${ref.kind[0].toUpperCase()}${ref.kind.slice(1)} ${ref.index}`;
  }
}

/** The note for a change Guard stopped. */
export function stopText(stops: readonly GuardFinding[], names: GuardNames): string {
  const missing = [...new Set(stops.map((finding) => placeName(finding.subject, names)))];
  if (missing.length === 1) return `Nothing was changed: ${missing[0]} does not exist`;
  if (missing.length === 2) return `Nothing was changed: ${missing[0]} and ${missing[1]} do not exist`;
  return `Nothing was changed: ${missing.length} layers and slots it points at do not exist`;
}

/** The question for a change that cuts layers off. */
export function askRequest(asks: readonly GuardFinding[], names: GuardNames): ConfirmRequest {
  const layers = asks.flatMap(({ subject }) => (subject.kind === "layer" ? [subject.index] : []));
  const keys = layers.reduce((sum, layer) => sum + names.keysOn(layer), 0);
  const one = layers.length === 1;
  return {
    guard: true,
    title: one
      ? `This cuts off ${names.layerName(layers[0])}, which has ${plural(keys, "key")}`
      : `This cuts off ${layers.length} layers with ${plural(keys, "key")}`,
    body: `No key is left that turns ${one ? "it" : "them"} on, so ${one ? "its" : "their"} keys can't be used. You can undo this afterwards.`,
    details: asks.map((finding) => {
      const layer = `${placeName(finding.subject, names)} (${plural(finding.subject.kind === "layer" ? names.keysOn(finding.subject.index) : 0, "key")})`;
      return finding.places.length > 0
        ? `${layer}: turned on by ${finding.places.map((place) => placeName(place, names)).join(", ")}`
        : `${layer}: reached through a layer this cuts off`;
    }),
    confirmLabel: "Approve",
  };
}

/** A drafted item in words, as the overwrite question lists it. */
export function itemName(item: SyncItem, names: GuardNames): string {
  switch (item.kind) {
    case "key":
      return placeName({ kind: "cell", layer: item.layer, offset: item.offset }, names);
    case "encoder":
      return `${names.layerName(item.layer)} · encoder ${item.id}`;
    case "slot":
      return placeName({ kind: item.table === "combos" ? "combo" : item.table === "forks" ? "fork" : "morse", index: item.index }, names);
    case "layerMetadata":
      return `${names.layerName(item.layer)}: name`;
    case "lighting":
      return `${names.layerName(item.layer)}: RGB Lighting`;
    case "rules":
      return "Lock and battery lights";
    case "morseProfile":
      return `Tap-hold profile ${item.index + 1}`;
    case "effectParam":
      return `RGB effect ${item.effect}: setting ${item.index + 1}`;
    default:
      return item.kind.replace(/([A-Z])/g, " $1").toLowerCase();
  }
}

/** The question before Send overwrites changes made on the keyboard since the draft began. */
export function overwriteRequest(items: readonly SyncItem[], names: GuardNames): ConfirmRequest {
  return {
    guard: true,
    title: `Send overwrites ${plural(items.length, "change")} made on the keyboard`,
    body: "They were made after you started this draft: on another computer, by another tool or by the keyboard itself. Send replaces them with yours.",
    details: items.map((item) => itemName(item, names)),
    confirmLabel: "Send anyway",
    cancelLabel: "Don't send",
  };
}
