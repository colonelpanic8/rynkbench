import { describe, expect, it } from "vitest";
import type { Fork, Morse } from "../../model/action-types";
import type { UsageReport } from "../../workbench/usage";
import { noLabels, withLabel } from "../../model/behavior-labels";
import { allRows, libraryRows, searchRows, stillUsedText, unusedRows, usageBadge, type LibraryInput } from "./library";

const key = (code: string) => ({ Key: { Hid: code } }) as never;
const morse = (actions: Morse["actions"]): Morse => ({ profile: {} as Morse["profile"], actions });
const site = (label: string) => ({ label, target: null });

function input(over: Partial<LibraryInput> = {}): LibraryInput {
  const usage: UsageReport = {
    layers: [],
    morse: [
      { index: 0, refs: ["Base · r1c2"], refSites: [site("Base · r1c2")] },
      { index: 1, refs: [], refSites: [] },
      { index: 2, refs: [], refSites: [] },
    ],
    macros: [
      { index: 0, refs: ["Cursor · r4c2", "Cursor · r4c7"], refSites: [site("Cursor · r4c2"), site("Cursor · r4c7")], preview: "Home ⇧End" },
      { index: 1, refs: [], refSites: [], preview: "" },
    ],
    profiles: [{ index: 3, name: "hrm_pinky", refs: 0 }],
    forks: [],
    combos: [],
    warnings: [],
  };
  return {
    usage,
    macroOps: [[{}], []],
    morse: [morse([[0b10, key("F4")], [0b100, key("Escape")]]), morse([[0b100, key("D")]]), morse([])],
    forks: [{ trigger: "No", negative_output: "No", positive_output: "No" } as unknown as Fork],
    profiles: [{ index: 3, name: "hrm_pinky", profile: { hold_timeout_ms: 270 } } as never],
    labels: noLabels(),
    behaviorUse: new Map([
      ["macros:0", "used"],
      ["morse:0", "used"],
      ["morse:1", "unused"],
      ["profiles:3", "unused"],
    ]),
    wording: "friendly",
    layerNames: [],
    ...over,
  };
}

describe("the Behavior Library rows", () => {
  it("list what is stored, with how often it is used", () => {
    const macros = libraryRows("macros", input());
    expect(macros.map((row) => [row.name, row.detail, usageBadge(row)?.text])).toEqual([["Macro 0", "Home ⇧End", "2×"]]);
    const morseRows = libraryRows("morse", input());
    expect(morseRows.map((row) => [row.name, usageBadge(row)?.text])).toEqual([
      ["Tap pattern 0", "1×"],
      ["Tap pattern 1", "not used"],
    ]);
    expect(libraryRows("profiles", input()).map((row) => row.name)).toEqual(["hrm_pinky"]);
  });

  it("name rows in the app's voice, as the tabs are", () => {
    expect(libraryRows("morse", input({ wording: "technical" }))[0].name).toBe("Morse 0");
  });

  it("leave out empty slots: a cleared macro, an unprogrammed fork, an empty tap pattern", () => {
    expect(libraryRows("forks", input())).toEqual([]);
    expect(libraryRows("macros", input()).some((row) => row.index === 1)).toBe(false);
    expect(libraryRows("morse", input()).some((row) => row.index === 2)).toBe(false);
  });

  it("count what nothing uses across every list", () => {
    expect(unusedRows(input()).map((row) => row.name)).toEqual(["Tap pattern 1", "hrm_pinky"]);
  });

  it("find rows by name or detail", () => {
    const rows = libraryRows("morse", input());
    expect(searchRows(rows, "pattern 1").map((row) => row.index)).toEqual([1]);
    expect(searchRows(rows, "  ")).toHaveLength(2);
  });

  it("say how many places still use a behavior before it goes", () => {
    const [used] = libraryRows("macros", input());
    expect(stillUsedText(used).title).toBe("Macro 0 is still used in 2 places");
  });

  it("show a behavior's own name and description, and the kind and number without one", () => {
    const labels = withLabel(noLabels(), "morse", 1, { name: "Dee", description: "d on tap" });
    const rows = libraryRows("morse", input({ labels }));
    expect(rows.map((row) => [row.name, row.named, row.description])).toEqual([
      ["Tap pattern 0", false, ""],
      ["Dee", true, "d on tap"],
    ]);
    expect(searchRows(rows, "on tap").map((row) => row.index)).toEqual([1]);
  });

  it("say when only unused behaviors use one, and what a tap pattern uses", () => {
    const over = input({
      morse: [morse([[0b10, { TriggerMacro: 0 } as never], [0b11, { LayerOn: 2 } as never]]), morse([]), morse([])],
      behaviorUse: new Map([["morse:0", "unused"], ["macros:0", "only-by-unused"]]),
      layerNames: [undefined, undefined, "Nav"],
    });
    const [tap] = libraryRows("morse", over);
    expect(tap.refersTo).toEqual([{ label: "Macro 0", behavior: { kind: "macros", slot: 0 } }, { label: "Nav", behavior: null }]);
    expect(usageBadge(libraryRows("macros", over)[0])).toEqual({ text: "only unused use it", unused: true });
    expect(allRows(["morse", "macros"], over).map((row) => row.kind)).toEqual(["macros", "morse"]);
  });
});
