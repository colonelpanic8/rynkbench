// The Behavior Library's rows, as in GLIDE (docs/specs/ui/behaviors.md there):
// one row per stored behavior. On RMK those are macros, morse entries (tap
// patterns: hold-tap and tap-dance in one), forks (a key that becomes another
// while modifiers are held) and tap-hold timing profiles. A row has its name
// (a label, ADR 0020), description, a short detail line, how it is used and
// where, and what it uses. The library lists and All your behaviors read the
// same rows. Pure.

import type { Fork, Morse, MorseProfileEntry } from "../../model/action-types";
import { morsePatternGlyph } from "../../model/morse";
import { forkIsEmpty, morseIsEmpty } from "../../model/slots";
import { labelAt, type BehaviorKind, type BehaviorLabels } from "../../model/behavior-labels";
import { actionReferences, keyActionReferences, type BehaviorUse, type Ref } from "../../domain";
import type { Term, TermId, Wording } from "../terms";
import { actionLabel, keyActionGlyph, type LayerNames } from "../labels";
import { morseProfileSummary } from "../morse-profile";
import type { SiteRef, UsageReport } from "../../workbench/usage";

export type LibraryKind = BehaviorKind;

/** Something a behavior uses: another behavior (which can be opened) or a layer. */
export interface UsedThing {
  label: string;
  behavior: { kind: LibraryKind; slot: number } | null;
}

export interface LibraryRow {
  kind: LibraryKind;
  /** The firmware's slot number, which keys refer to. */
  index: number;
  /** Its name, or the kind and number when it has none. */
  name: string;
  /** Whether `name` is one someone gave it. */
  named: boolean;
  description: string;
  /** A short line under the name. */
  detail: string;
  /** How many places use it; null when the kind is not referred to by keys (forks apply everywhere). */
  uses: number | null;
  /** Used by a place, only by tap patterns nothing uses, or not at all. */
  use: BehaviorUse;
  /** Where it is used, for the row, Show me and Delete. */
  places: SiteRef[];
  /** What it uses, in order. */
  refersTo: UsedThing[];
}

interface KindInfo {
  /** The list's name, in both voices (ui/terms.ts). */
  term: TermId;
  /** One of them, in the row name ("Macro 3"), in both voices. */
  one: Term;
}

export const LIBRARY_KINDS: Record<LibraryKind, KindInfo> = {
  macros: { term: "section.macros", one: { technical: "Macro", friendly: "Macro" } },
  morse: { term: "section.morse", one: { technical: "Morse", friendly: "Tap pattern" } },
  forks: { term: "section.forks", one: { technical: "Fork", friendly: "Conditional key" } },
  profiles: { term: "section.profiles", one: { technical: "Profile", friendly: "Tap timing" } },
};

export const LIBRARY_ORDER: LibraryKind[] = ["macros", "morse", "forks", "profiles"];

export interface LibraryInput {
  usage: UsageReport;
  /** The macro region, one entry per macro slot; an empty entry is a free slot. */
  macroOps: readonly (readonly unknown[])[];
  morse: readonly Morse[];
  forks: readonly Fork[];
  profiles: readonly MorseProfileEntry[];
  labels: BehaviorLabels;
  /** How each filled slot is used, by `kind:slot` (operations' `behaviorUses`). */
  behaviorUse: ReadonlyMap<string, BehaviorUse>;
  /** The app's voice for row names (ui/terms.ts). */
  wording: Wording;
  /** Layer keys in the details read as their layers' names. */
  layerNames: LayerNames;
}

/** A behavior's name as rows show it: its own, or the kind and number. */
export function behaviorTitle(kind: LibraryKind, slot: number, input: Pick<LibraryInput, "labels" | "profiles" | "wording">): string {
  const own = kind === "profiles" ? input.profiles.find((entry) => entry.index === slot)?.name : labelAt(input.labels, kind, slot)?.name;
  return own || `${LIBRARY_KINDS[kind].one[input.wording]} ${slot}`;
}

function morseDetail(morse: Morse, names: LayerNames): string {
  return morse.actions.map(([pattern, action]) => `${morsePatternGlyph(pattern)} ${actionLabel(action, names)}`).join(" · ");
}

function forkDetail(fork: Fork, morse: readonly Morse[], names: LayerNames): string {
  const glyph = (action: Fork["trigger"]) => keyActionGlyph(action, morse, names).text || "nothing";
  return `${glyph(fork.trigger)} → ${glyph(fork.positive_output)}, else ${glyph(fork.negative_output)}`;
}

const REF_KIND: Partial<Record<Ref["kind"], LibraryKind>> = { macro: "macros", morse: "morse", profile: "profiles" };

/** The things references point at, each once, in order. */
function usedThings(refs: readonly Ref[], input: LibraryInput): UsedThing[] {
  const seen = new Set<string>();
  const out: UsedThing[] = [];
  for (const ref of refs) {
    if (ref.kind === "cell" || ref.kind === "combo" || ref.kind === "fork") continue;
    const key = `${ref.kind}:${ref.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = REF_KIND[ref.kind];
    if (kind) out.push({ label: behaviorTitle(kind, ref.index, input), behavior: { kind, slot: ref.index } });
    else out.push({ label: input.layerNames[ref.index] ?? `Layer ${ref.index}`, behavior: null });
  }
  return out;
}

function row(kind: LibraryKind, index: number, input: LibraryInput, rest: Pick<LibraryRow, "detail" | "uses" | "places" | "refersTo">): LibraryRow {
  const own = kind === "profiles" ? input.profiles.find((entry) => entry.index === index)?.name : labelAt(input.labels, kind, index)?.name;
  return {
    kind,
    index,
    name: behaviorTitle(kind, index, input),
    named: Boolean(own),
    description: labelAt(input.labels, kind, index)?.description ?? "",
    use: input.behaviorUse.get(`${kind}:${index}`) ?? "used",
    ...rest,
  };
}

/** The rows of one list: the stored behaviors of that kind, in slot order. */
export function libraryRows(kind: LibraryKind, input: LibraryInput): LibraryRow[] {
  switch (kind) {
    case "macros":
      return input.usage.macros
        .filter((macro) => (input.macroOps[macro.index]?.length ?? 0) > 0)
        .map((macro) => row(kind, macro.index, input, { detail: macro.preview, uses: macro.refs.length, places: macro.refSites, refersTo: [] }));
    case "morse":
      return input.usage.morse
        .filter((slot) => !morseIsEmpty(input.morse[slot.index]))
        .map((slot) => {
          const morse = input.morse[slot.index];
          const refs = morse.actions.flatMap(([, action]) => actionReferences(action).map((reference) => reference.to));
          return row(kind, slot.index, input, {
            detail: morseDetail(morse, input.layerNames),
            uses: slot.refs.length,
            places: slot.refSites,
            refersTo: usedThings(refs, input),
          });
        });
    case "forks":
      return input.forks.flatMap((fork, index) => {
        if (forkIsEmpty(fork)) return [];
        const refs = [fork.trigger, fork.positive_output, fork.negative_output].flatMap((action) => keyActionReferences(action).map((reference) => reference.to));
        return [row(kind, index, input, { detail: forkDetail(fork, input.morse, input.layerNames), uses: null, places: [], refersTo: usedThings(refs, input) })];
      });
    case "profiles":
      return input.profiles.map((entry) =>
        row(kind, entry.index, input, {
          detail: morseProfileSummary(entry.profile),
          uses: input.usage.profiles.find((profile) => profile.index === entry.index)?.refs ?? 0,
          places: [],
          refersTo: [],
        }),
      );
  }
}

/** Every row of the kinds given, in the library's order. */
export function allRows(kinds: readonly LibraryKind[], input: LibraryInput): LibraryRow[] {
  return LIBRARY_ORDER.filter((kind) => kinds.includes(kind)).flatMap((kind) => libraryRows(kind, input));
}

/** Rows nothing uses (or only unused ones do), across every kind: what "N not used" counts. */
export function unusedRows(input: LibraryInput): LibraryRow[] {
  return allRows(LIBRARY_ORDER, input).filter((one) => one.use !== "used");
}

/** The usage badge: "3×", "not used", "only unused use it", or nothing for a kind keys do not refer to. */
export function usageBadge(one: LibraryRow): { text: string; unused: boolean } | null {
  if (one.use === "unused") return { text: "not used", unused: true };
  if (one.use === "only-by-unused") return { text: "only unused use it", unused: true };
  return one.uses === null ? null : { text: `${one.uses}×`, unused: false };
}

/** Rows whose name, description or detail contains the search, any case. */
export function searchRows(rows: readonly LibraryRow[], search: string): LibraryRow[] {
  const query = search.trim().toLowerCase();
  if (!query) return [...rows];
  return rows.filter((one) => `${one.name} ${one.description} ${one.detail}`.toLowerCase().includes(query));
}

/** The question before deleting a behavior keys still use. */
export function stillUsedText(one: LibraryRow): { title: string; body: string } {
  const count = one.uses ?? 0;
  return {
    title: `${one.name} is still used in ${count} place${count === 1 ? "" : "s"}`,
    body: "What uses it will do nothing there until you give it something else.",
  };
}
