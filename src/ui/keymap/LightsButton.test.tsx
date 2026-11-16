// The Keymap's sun button (ADR 0016) on simulated boards: there wherever the
// keyboard has lights, lit while the canvas shows them, and gone on a keyboard
// without RGB.

import { describe, expect, it } from "vitest";
import type { ConnectedBundle } from "../../model/workbench-state";
import { mockProvider, type BoardSpec } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import { plain36Board } from "../../session/mock/plain36";
import { stub48Board } from "../../session/mock/stub48";
import { renderInWorkbench } from "../../test/workbench";
import { openBundle } from "../bundle";
import { initialWorkbenchState } from "../../workbench";
import { LightsButton } from "./LightsButton";

async function onBoard(spec: BoardSpec, run: (bundle: ConnectedBundle) => void): Promise<void> {
  const session = await mockProvider(spec).connect();
  try {
    run(await openBundle(session));
  } finally {
    await session.close();
  }
}

function draw(bundle: ConnectedBundle, shown: boolean | undefined): string {
  return renderInWorkbench(<LightsButton shown={shown} onShown={() => {}} />, {
    bundle,
    state: initialWorkbenchState(bundle),
  });
}

describe("the Keymap's lights button", () => {
  it.each([
    ["Glove80", glove80Board],
    ["Dev stub 48", stub48Board],
  ] as const)("is there on the %s, with its menu closed", async (_name, spec) => {
    await onBoard(spec, (bundle) => {
      const html = draw(bundle, undefined);
      expect(html).toContain('aria-label="Lights"');
      expect(html).toContain('aria-expanded="false"');
      expect(html).not.toContain("RGB settings…");
    });
  });

  it("is lit while the canvas shows the lights", async () => {
    await onBoard(glove80Board, (bundle) => {
      expect(draw(bundle, true)).toContain("border-accent text-accent");
      expect(draw(bundle, false)).not.toContain("border-accent text-accent");
    });
  });

  it("is not there on a keyboard without RGB", async () => {
    await onBoard(plain36Board, (bundle) => {
      expect(draw(bundle, undefined)).toBe("");
    });
  });
});
