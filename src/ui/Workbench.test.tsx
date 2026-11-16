// The whole workbench renders, on a connected keyboard and on a file: the
// hooks it calls itself run above its own context, and a mistake there only
// shows when the whole screen is drawn.

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { mockProvider } from "../session/mock/board";
import { glove80Board } from "../session/mock/glove80";
import type { RynkSession } from "../session/types";
import { openBundle } from "./bundle";
import { Workbench } from "./Workbench";

let session: RynkSession | null = null;
afterEach(async () => {
  await session?.close();
  session = null;
});

describe("the workbench", () => {
  it("draws a connected keyboard, starting in Draft", async () => {
    session = await mockProvider(glove80Board).connect();
    const bundle = await openBundle(session);
    const html = renderToStaticMarkup(<Workbench bundle={bundle} onClose={() => {}} onUnexpectedDisconnect={() => {}} />);
    expect(html).toContain("Draft");
    expect(html).toContain("Up to date");
  });
});
