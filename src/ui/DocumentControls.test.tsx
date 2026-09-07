import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { profileById } from "../model/boards/profiles";
import { DocumentControls } from "./DocumentControls";
import type { DocumentTransfer } from "./transfer-actions";

function controls(board?: string) {
  const documentTools = board ? profileById(board)?.documents : undefined;
  return renderToStaticMarkup(<DocumentControls offline={false} busy={false} transfer={{
    phase: null, documentTools,
    migrationTarget: documentTools?.migrationTarget?.name ?? null,
  } as DocumentTransfer} />);
}

describe("board document controls", () => {
  it("renders no file or migration controls on a generic keyboard", () => {
    expect(controls()).toBe("");
  });
  it.each([["glove80", "Go60"], ["go60", "Glove80"]])("offers %s its supported formats and peer", (board, peer) => {
    const html = controls(board);
    expect(html).toContain("Import layout");
    expect(html).toContain("Export TOML");
    expect(html).toContain("Export MoErgo JSON");
    expect(html).toContain(`Migrate to ${peer}`);
  });
});
