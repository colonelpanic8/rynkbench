// The Behavior Library's lists, as in GLIDE (docs: behaviors.md there): one
// list per kind of named, reusable behavior the keyboard stores. On RMK those
// are macros, morse entries (tap patterns: hold-tap and tap-dance in one),
// forks (a key that becomes another while modifiers are held) and tap-hold
// timing profiles. Each row says what it is, a short detail line, and how
// often it is used, from the usage report. Pure.

import type { Fork, Morse, MorseProfileEntry } from "../../model/action-types";
import { morsePatternGlyph } from "../../model/morse";
import { forkIsEmpty, morseIsEmpty } from "../../model/slots";
import type { Term, TermId, Wording } from "../terms";
import { actionLabel, keyActionGlyph, type LayerNames } from "../labels";
import { morseProfileSummary } from "../morse-profile";
import type { SiteRef, UsageReport } from "../../workbench/usage";

export type LibraryKind = "macros" | "morse" | "forks" | "profiles";

export interface LibraryRow {
  kind: LibraryKind;
  /** The firmware's slot number, which keys refer to. */
  index: number;
  name: string;
  /** A short line under the name. */
  detail: string;
  /** How many places use it; null when the kind is not referred to by keys (forks apply everywhere). */
  uses: number | null;
  /** Where it is used, for Show details and Delete. */
  places: SiteRef[];
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
  /** The app's voice for row names (ui/terms.ts). */
  wording: Wording;
  /** Layer keys in the details read as their layers' names. */
  layerNames: LayerNames;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function morseDetail(morse: Morse, names: LayerNames): string {
  return morse.actions.map(([pattern, action]) => `${morsePatternGlyph(pattern)} ${actionLabel(action, names)}`).join(" · ");
}

function forkDetail(fork: Fork, morse: readonly Morse[], names: LayerNames): string {
  const glyph = (action: Fork["trigger"]) => keyActionGlyph(action, morse, names).text || "nothing";
  return `${glyph(fork.trigger)} → ${glyph(fork.positive_output)}, else ${glyph(fork.negative_output)}`;
}

/** The rows of one list: the stored behaviors of that kind, in slot order. */
export function libraryRows(kind: LibraryKind, input: LibraryInput): LibraryRow[] {
  const one = LIBRARY_KINDS[kind].one[input.wording];
  switch (kind) {
    case "macros":
      return input.usage.macros.filter((macro) => (input.macroOps[macro.index]?.length ?? 0) > 0).map((macro) => ({
        kind,
        index: macro.index,
        name: `${one} ${macro.index}`,
        detail: macro.preview,
        uses: macro.refs.length,
        places: macro.refSites,
      }));
    case "morse":
      return input.usage.morse
        .filter((slot) => !morseIsEmpty(input.morse[slot.index]))
        .map((slot) => ({
          kind,
          index: slot.index,
          name: `${one} ${slot.index}`,
          detail: morseDetail(input.morse[slot.index], input.layerNames),
          uses: slot.refs.length,
          places: slot.refSites,
        }));
    case "forks":
      return input.forks.flatMap((fork, index) =>
        forkIsEmpty(fork)
          ? []
          : [{ kind, index, name: `${one} ${index}`, detail: forkDetail(fork, input.morse, input.layerNames), uses: null, places: [] }],
      );
    case "profiles":
      return input.profiles.map((entry) => ({
        kind,
        index: entry.index,
        name: entry.name || `${one} ${entry.index}`,
        detail: morseProfileSummary(entry.profile),
        uses: input.usage.profiles.find((profile) => profile.index === entry.index)?.refs ?? 0,
        places: [],
      }));
  }
}

/** Rows nothing uses, across every kind: what "N not used" counts. */
export function unusedRows(input: LibraryInput): LibraryRow[] {
  return LIBRARY_ORDER.flatMap((kind) => libraryRows(kind, input)).filter((row) => row.uses === 0);
}

/** The usage badge: "3×", "not used", or nothing for a kind keys do not refer to. */
export function usageBadge(row: LibraryRow): string | null {
  if (row.uses === null) return null;
  return row.uses === 0 ? "not used" : `${row.uses}×`;
}

/** Rows whose name or detail contains the search, any case. */
export function searchRows(rows: readonly LibraryRow[], search: string): LibraryRow[] {
  const query = search.trim().toLowerCase();
  if (!query) return [...rows];
  return rows.filter((row) => `${row.name} ${row.detail}`.toLowerCase().includes(query));
}

/** The question before deleting a behavior keys still use. */
export function stillUsedText(row: LibraryRow): { title: string; body: string } {
  return {
    title: `${row.name} is still used in ${plural(row.uses ?? 0, "place")}`,
    body: "What uses it will do nothing there until you give it something else.",
  };
}
