import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SessionProvider } from "../session/types";
import { ConnectScreen } from "./ConnectScreen";

const provider = (kind: string, title: string, available: boolean) =>
  ({ kind, title, description: `${title} description`, available: () => available }) as unknown as SessionProvider;

function screen(providers: SessionProvider[] | null) {
  return renderToStaticMarkup(
    <ConnectScreen
      providers={providers}
      attempt={null}
      notice={null}
      offlineBusy={false}
      onConnect={() => {}}
      onOpenFile={() => {}}
      onNewFile={() => {}}
    />,
  );
}

describe("connect screen", () => {
  it("shows the ways that work here as cards, before working on a file", () => {
    const html = screen([provider("native", "USB (native)", false), provider("webhid", "USB (WebHID)", true)]);
    expect(html).toContain("USB (WebHID) description");
    expect(html.indexOf("USB (WebHID)")).toBeLessThan(html.indexOf("Or work on a file"));
  });

  it("lists the ways that cannot work here with what they need, not as cards", () => {
    const html = screen([provider("native", "USB (native)", false), provider("webhid", "USB (WebHID)", true)]);
    expect(html).toContain("USB (native) needs the Rynkbench desktop app");
    expect(html).not.toContain("USB (native) description");
  });

  it("says what to do when nothing can reach a keyboard", () => {
    const html = screen([provider("webhid", "USB (WebHID)", false)]);
    expect(html).toContain("This browser cannot reach a keyboard");
    expect(html).toContain("New Glove80 layout");
  });
});
