import { describe, expect, it } from "vitest";
import { renderInWorkbench } from "../../test/workbench";
import { PickKey, PickKeycode } from "./PickKey";

const chips = (html: string) => (html.match(/aria-pressed=/g) ?? []).length;

describe("Pick Key", () => {
  it("offers modifier chips and counts the keys under All keys", () => {
    const html = renderInWorkbench(<PickKey onPick={() => {}} />);
    expect(chips(html)).toBe(4);
    expect(html).toMatch(/All keys: \d+ more/);
    expect(html).toContain("Same as layer below");
  });

  it("is the same picker, smaller, for a behavior's slot: no Transparent", () => {
    const html = renderInWorkbench(<PickKey compact scope="slot" onPick={() => {}} />);
    expect(chips(html)).toBe(4);
    expect(html).not.toContain("Same as layer below");
    expect(html).toContain("max-h-80");
  });

  it("offers a plain key with no modifiers and no characters that need them", () => {
    const html = renderInWorkbench(<PickKeycode onPick={() => {}} />);
    expect(chips(html)).toBe(0);
    expect(html).not.toContain(">$<");
    expect(html).toContain(">A<");
  });
});
