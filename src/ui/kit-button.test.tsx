import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./kit";

describe("Button", () => {
  it("is plainly disabled without a reason", () => {
    const html = renderToStaticMarkup(<Button disabled>Save</Button>);
    expect(html).toContain('disabled=""');
    expect(html).not.toContain("aria-disabled=\"");
  });

  it("stays focusable and says why when it has a reason", () => {
    const html = renderToStaticMarkup(
      <Button disabled reason="Nothing staged yet" title="Write every staged edit">
        Apply
      </Button>,
    );
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Nothing staged yet"');
  });

  it("keeps its own title while it can be used", () => {
    const html = renderToStaticMarkup(
      <Button reason="Nothing staged yet" title="Write every staged edit">
        Apply
      </Button>,
    );
    expect(html).toContain('title="Write every staged edit"');
    expect(html).not.toContain("aria-disabled=\"");
  });
});
