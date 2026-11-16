import { describe, expect, it } from "vitest";
import { renderInWorkbench } from "../test/workbench";
import { profileById } from "../model/boards/profiles";
import { FileMenus } from "./FileMenus";

function menus(board?: string, kind: "webhid" | "offline" = "webhid") {
  const documentTools = board ? profileById(board)?.documents : undefined;
  return renderInWorkbench(
    <FileMenus />,
    { bundle: { session: { kind } } },
    { phase: null, report: null, documentTools, migrationTarget: documentTools?.migrationTarget?.name ?? null },
  );
}

describe("file menus", () => {
  it("are absent for a keyboard with no file formats", () => {
    expect(menus()).toBe("");
  });

  it("open a file when no keyboard is attached, and import onto one that is", () => {
    expect(menus("glove80", "offline")).toContain(">Open<");
    expect(menus("glove80")).toContain(">Import<");
  });

  it("save in the board's main format at one click", () => {
    const html = menus("glove80");
    expect(html).toContain(">Save<");
    expect(html).toMatch(/Save this layout as (TOML|MoErgo JSON)/);
    expect(html).toContain("More ways to save");
  });
});
