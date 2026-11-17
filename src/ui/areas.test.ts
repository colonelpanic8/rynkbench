import { describe, expect, it } from "vitest";
import { ALL_SECTIONS, areaOfSection, areasFor, type AreaFacts } from "./areas";

const plainRmk: AreaFacts = {
  connected: true,
  combos: false,
  morse: false,
  macros: false,
  forks: false,
  tapProfiles: false,
};
const everything: AreaFacts = {
  connected: true,
  combos: true,
  morse: true,
  macros: true,
  forks: true,
  tapProfiles: true,
};

const ids = (facts: AreaFacts) => areasFor(facts).map((area) => area.id);

describe("areas", () => {
  it("shows a plain RMK board every area; lighting lives on the keys and in Layout properties (ADR 0016)", () => {
    expect(ids(plainRmk)).toEqual(["layout", "behaviors", "device"]);
    expect(areasFor(plainRmk).find((a) => a.id === "behaviors")?.sections).toEqual(["transforms"]);
  });

  it("offers the Behaviors editors the firmware has, in order", () => {
    expect(areasFor(everything).find((a) => a.id === "behaviors")?.sections).toEqual([
      "usage",
      "combos",
      "morse",
      "macros",
      "forks",
      "profiles",
      "transforms",
    ]);
  });

  it("drops Device and Insights (Live) for a file opened without a keyboard", () => {
    const offline = { ...everything, connected: false };
    expect(ids(offline)).toEqual(["layout", "behaviors"]);
  });

  it("lists All your behaviors only when the keyboard stores a kind of behavior", () => {
    expect(areasFor({ ...plainRmk, forks: true }).find((a) => a.id === "behaviors")?.sections).toEqual(["usage", "forks", "transforms"]);
  });

  it("places every section in exactly one area when all are offered", () => {
    const placed = areasFor(everything).flatMap((area) => area.sections);
    expect([...placed].sort()).toEqual([...ALL_SECTIONS].sort());
    for (const section of ALL_SECTIONS) expect(areaOfSection(areasFor(everything), section)).toBeDefined();
  });
});
