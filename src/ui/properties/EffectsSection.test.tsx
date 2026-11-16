// Layout properties' RGB Effects tab (ADR 0016) on simulated boards: the big
// Effects switch first, then the firmware's own effects, overlay and palettes.

import { describe, expect, it } from "vitest";
import type { ConnectedBundle, WorkbenchState } from "../../model/workbench-state";
import { mockProvider, type BoardSpec } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import { ortho60Board } from "../../session/mock/ortho60";
import { renderInWorkbench } from "../../test/workbench";
import { openBundle } from "../bundle";
import { initialWorkbenchState } from "../../workbench";
import { EffectsSection } from "./EffectsSection";

async function onBoard(spec: BoardSpec, run: (bundle: ConnectedBundle) => void): Promise<void> {
  const session = await mockProvider(spec).connect();
  try {
    run(await openBundle(session));
  } finally {
    await session.close();
  }
}

function draw(bundle: ConnectedBundle, state: Partial<WorkbenchState> = {}): string {
  return renderInWorkbench(<EffectsSection />, { bundle, state: { ...initialWorkbenchState(bundle), ...state } });
}

const pack = glove80Board.extensionEffects!;

describe("RGB Effects", () => {
  it("leads with the Effects switch, naming the effect that runs", async () => {
    await onBoard(glove80Board, (bundle) => {
      const html = draw(bundle);
      const running = pack.effects[pack.initial.effect];
      expect(html).toMatch(new RegExp(`role="switch" aria-checked="true".*?>Effects</span><span[^>]*>${running}<`));
      expect(html).not.toContain("<fieldset disabled");
    });
  });

  it("offers the firmware's effects, the effect over it and its palettes, as the keyboard has them", async () => {
    await onBoard(glove80Board, (bundle) => {
      const html = draw(bundle);
      expect(html).toContain(`<option value="${pack.initial.effect}" selected="">${pack.effects[pack.initial.effect]}</option>`);
      expect(html).toContain("Over it");
      expect(html).toContain(`<option value="${pack.overlay}" selected="">${pack.effects[pack.overlay!]}</option>`);
      expect(html).toContain(`<option value="${pack.effects.length}">None</option>`);
      expect(html).toContain("Palette");
      for (const palette of pack.palettes) expect(html).toContain(`>${palette}</option>`);
      for (const slider of ["Bright", "Speed"]) expect(html).toContain(`>${slider}</span>`);
      // Nothing staged yet: no Apply.
      expect(html).not.toContain("Revert");
    });
  });

  it("greys out the effect's settings while effects are off", async () => {
    await onBoard(glove80Board, (bundle) => {
      const extension = bundle.lightingExtension!;
      const html = draw(bundle, { lightingExtension: { ...extension, state: { ...extension.state, value: 0 } } });
      expect(html).toMatch(/role="switch" aria-checked="false".*?>Effects<\/span><span[^>]*>Off</);
      expect(html).toContain("<fieldset disabled");
    });
  });

  it("is not there on a keyboard without the firmware's effects", async () => {
    await onBoard(ortho60Board, (bundle) => {
      expect(draw(bundle)).toBe("");
    });
  });
});
