import { describe, expect, it } from "vitest";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { renderInWorkbench } from "../../test/workbench";
import { ConnectionChip } from "./ConnectionChip";
import { setLink } from "./link";

const A = { Single: { Key: { Hid: "A" } } } as unknown as KeyAction;
const keyboard = { session: { kind: "webhid" as const }, info: { product_name: "Glove80" } };
/** One key drafted: the keyboard holds nothing there, you want A. */
const drafted = { layers: [[A]], base: { layers: [["No" as KeyAction]] } };

describe("the connection chip", () => {
  it("says a file is a file", () => {
    expect(renderInWorkbench(<ConnectionChip />)).toContain("File");
  });

  it("names the keyboard and starts in Draft, up to date", () => {
    const html = renderInWorkbench(<ConnectionChip />, { bundle: keyboard, state: { batchMode: true } });
    expect(html).toContain("Glove80");
    expect(html).toContain("Draft");
    expect(html).toContain("Up to date");
  });

  it("counts the changes not on the keyboard and offers Review & send", () => {
    const html = renderInWorkbench(<ConnectionChip />, { bundle: keyboard, state: { batchMode: true, ...drafted } });
    expect(html).toContain("Review &amp; send");
    expect(html).toMatch(/Review &amp; send<span[^>]*>1<\/span>/);
    expect(html).toContain("Discard the changes not on the keyboard");
  });

  it("shows Live without a count", () => {
    const html = renderInWorkbench(<ConnectionChip />, { bundle: keyboard, state: { batchMode: false } });
    expect(html).toContain("Live");
    expect(html).not.toContain("Review");
  });

  it("in Live, offers Review & send for changes a send left behind", () => {
    const html = renderInWorkbench(<ConnectionChip />, { bundle: keyboard, state: { batchMode: false, batchError: "1 change waits", ...drafted } });
    expect(html).toMatch(/Review &amp; send<span[^>]*>1<\/span>/);
    expect(html).toContain("Discard the changes not on the keyboard");
  });

  it("says when the keyboard cannot be reached, keeps the changes and offers Reconnect", () => {
    setLink({ lost: true, reconnect: () => {} });
    try {
      const html = renderInWorkbench(<ConnectionChip />, { bundle: keyboard, state: { batchMode: true, ...drafted } });
      expect(html).toContain("not connected");
      expect(html).toContain("1 change kept for when it is back");
      expect(html).toContain("Reconnect");
      expect(html).not.toContain("Review &amp; send");
    } finally {
      setLink({ lost: false });
    }
  });
});

