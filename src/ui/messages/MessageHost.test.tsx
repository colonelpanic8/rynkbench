import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { askConfirm, resetMessages, showToast } from "./store";
import { MessageHost } from "./MessageHost";

describe("the message host", () => {
  afterEach(resetMessages);

  it("shows Guard's label, Show details, Reject and Approve when Guard asks", () => {
    void askConfirm({ guard: true, title: "This cuts off Nav, which has 12 keys", confirmLabel: "Approve", details: ["Nav: turned on by Layer 0"] });
    const html = renderToString(<MessageHost />);
    for (const text of ["Rynkbench Guard", "This cuts off Nav", "Show details", "Reject", "Approve"]) expect(html).toContain(text);
    expect(html).not.toContain("turned on by"); // the details wait behind the button
  });

  it("offers Show me when the question names a place to go", () => {
    void askConfirm({ guard: true, title: "Home is still used in 2 places", confirmLabel: "Delete anyway", showMe: () => {} });
    expect(renderToString(<MessageHost />)).toContain("Show me");
  });

  it("keeps an ordinary question plain", () => {
    void askConfirm({ title: "Delete the Magic layer?", confirmLabel: "Delete layer" });
    const html = renderToString(<MessageHost />);
    expect(html).not.toContain("Rynkbench Guard");
    expect(html).toContain("Cancel");
  });

  it("labels a note from Guard", () => {
    showToast("Nothing was changed: Layer 5 does not exist", { guard: true, tone: "danger" });
    expect(renderToString(<MessageHost />)).toContain("Rynkbench Guard");
  });
});
