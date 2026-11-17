// The app's areas, organized by what the person is doing rather than by
// protocol surface (docs/ux-brief.md §4): the keymap (the main screen, as in
// GLIDE) and the screens the top bar opens over it. Files are the top bar's
// Open and Save. Each area holds sections; a section
// is one screen. Which areas and sections exist comes from what the keyboard
// and the session offer, never from a fixed list on screen.

import type { Mode } from "../model/workbench-state";
import type { TermId } from "./terms";

export type AreaId = "layout" | "behaviors" | "device";

/** A section is one screen; the workbench state names the one on show. */
export type SectionId = Mode;

/** Every section, in rail order. */
export const ALL_SECTIONS: readonly SectionId[] = [
  "keymap",
  "usage",
  "combos",
  "morse",
  "macros",
  "forks",
  "profiles",
  "transforms",
  "device",
];

/** What decides which sections exist. Plain booleans, so this stays pure. */
export interface AreaFacts {
  /** A keyboard is attached (not a file opened offline). */
  connected: boolean;
  combos: boolean;
  morse: boolean;
  macros: boolean;
  forks: boolean;
  /** Tap-hold profiles (morse profile slots). */
  tapProfiles: boolean;
}

export interface Area {
  id: AreaId;
  term: TermId;
  sections: SectionId[];
}

/** A section's name is its own term: `section.<id>`. */
export function sectionTerm(section: SectionId): TermId {
  return `section.${section}`;
}

/** The areas this keyboard and session offer, each with its sections in order.
 *  An area with no sections is left out. */
export function areasFor(facts: AreaFacts): Area[] {
  const pick = (entries: Array<[SectionId, boolean]>) =>
    entries.filter(([, on]) => on).map(([id]) => id);

  const areas: Area[] = [
    { id: "layout", term: "area.layout", sections: ["keymap"] },
    {
      id: "behaviors",
      term: "area.behaviors",
      sections: pick([
        // All your behaviors (ADR 0020), when there is a kind to list.
        ["usage", facts.morse || facts.macros || facts.forks || facts.tapProfiles],
        ["combos", facts.combos],
        ["morse", facts.morse],
        ["macros", facts.macros],
        ["forks", facts.forks],
        ["profiles", facts.tapProfiles],
        ["transforms", true],
      ]),
    },
    { id: "device", term: "area.device", sections: pick([["device", facts.connected]]) },
  ];
  return areas.filter((area) => area.sections.length > 0);
}

/** The area that holds a section, among those offered. */
export function areaOfSection(areas: Area[], section: SectionId): Area | undefined {
  return areas.find((area) => area.sections.includes(section));
}
