import { describe, expect, it } from "vitest";
import type { Fork, KeyAction, MacroOp } from "../../../model/action-types";
import { emptyFork, emptyMorseProfile } from "../../../model/slots";
import { renderInWorkbench } from "../../../test/workbench";
import { ForkEditor } from "./ForkEditor";
import { MacroEditor } from "./MacroEditor";
import { ProfileEditor, profileNameProblem } from "./ProfileEditor";

const key = (code: string) => ({ Single: { Key: { Hid: code } } }) as KeyAction;

describe("the behavior editors", () => {
  it("a macro: its details with its space, then a row per step, as in GLIDE", () => {
    const parts = { bundle: { caps: { max_macros: 4, macro_space_size: 32 } }, state: { macroOps: [[{ Char: 104 }, { Char: 105 }, { Delay: 50 }, { Press: { LayerOn: 1 } }, "PauseForRelease"]] as MacroOp[][] } };
    const html = renderInWorkbench(<MacroEditor focus={0} onClose={() => {}} />, parts);
    for (const text of ["Macro details", "/ 32 bytes", "“hi”", "50 ms", "Hold", "On release", "+ Add", "Clear steps"]) expect(html).toContain(text);
    expect(html.match(/data-testid="macro-row-/g)).toHaveLength(4);
  });

  it("a new macro opens on Add, whose picker lists layers and your macros above the keys", () => {
    const parts = { bundle: { caps: { max_macros: 4, macro_space_size: 64 } }, state: { macroOps: [[{ Char: 104 }]] as MacroOp[][] } };
    const html = renderInWorkbench(<MacroEditor focus="new" onClose={() => {}} />, parts);
    for (const text of ["Add to this macro", "Type text", "Add a step first"]) expect(html).toContain(text);
  });

  it("a fork: the fork first, then its key and what it becomes, in the app's voice", () => {
    const fork: Fork = { ...emptyFork(), trigger: key("Dot"), positive_output: key("Semicolon") };
    const html = renderInWorkbench(<ForkEditor focus={0} onClose={() => {}} />, { state: { forks: [fork] } });
    for (const text of ["Trigger", "Negative output", "Positive output", "Match any"]) expect(html).toContain(text);
    expect(renderInWorkbench(<ForkEditor focus="new" onClose={() => {}} />, {})).toContain("Pick the key it changes");
  });

  it("a profile: its name on the keyboard and its timing", () => {
    const profiles = [{ index: 0, name: "Fast", profile: emptyMorseProfile() }, { index: 1, name: "Slow", profile: emptyMorseProfile() }];
    const html = renderInWorkbench(<ProfileEditor focus={0} onClose={() => {}} />, { state: { morseProfiles: profiles } });
    expect(html).toContain('value="Fast"');
    expect(html).toContain("Hold timeout");
    expect(profileNameProblem(" ", [])).toBe("A profile needs a name");
    expect(profileNameProblem("slow", ["Slow"])).toBe("Another profile is called slow");
    expect(profileNameProblem("x".repeat(33), [])).toMatch(/at most 32/);
  });
});
