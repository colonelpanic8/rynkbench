import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResizeHandle, usePaneSize } from "./panes";

function Pane({ edge, initial = 300 }: { edge: "right" | "top"; initial?: number }) {
  const pane = usePaneSize(`test:${edge}`, initial, 200, 400);
  return <ResizeHandle edge={edge} label="Side panel width" pane={pane} />;
}

describe("resizable panes", () => {
  it("is a separator people can reach and move with the keyboard", () => {
    const html = renderToStaticMarkup(<Pane edge="right" />);
    expect(html).toContain('role="separator"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-valuenow="300"');
    expect(html).toContain("double-click to reset");
  });

  it("keeps the size inside its bounds", () => {
    expect(renderToStaticMarkup(<Pane edge="top" initial={900} />)).toContain('aria-valuenow="400"');
    expect(renderToStaticMarkup(<Pane edge="top" initial={10} />)).toContain('aria-valuenow="200"');
    expect(renderToStaticMarkup(<Pane edge="top" />)).toContain('aria-orientation="horizontal"');
  });
});
