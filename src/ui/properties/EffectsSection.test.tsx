// Layout properties' RGB Effects tab (ADR 0016) on simulated boards: the big
// Effects switch first, then the firmware's own effects as cards (and those of
// the slot over it), and its palettes.

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

/** The cards of the gallery under `label`: each effect's name, and whether it is pressed. */
function cards(html: string, label: string): Array<{ name: string; pressed: boolean }> {
  const gallery = html.split('role="group"').find((part) => part.includes(`>${label}</span>`)) ?? "";
  return [...gallery.matchAll(/<button type="button" aria-pressed="(true|false)".*?font-semibold">([^<]*)</g)].map((card) => ({
    name: card[2],
    pressed: card[1] === "true",
  }));
}
const pressed = (html: string, label: string) => cards(html, label).filter((card) => card.pressed).map((card) => card.name);

describe("RGB Effects", () => {
  it("leads with the Effects switch, naming the effect that runs", async () => {
    await onBoard(glove80Board, (bundle) => {
      const html = draw(bundle);
      const running = pack.effects[pack.initial.effect];
      expect(html).toMatch(new RegExp(`role="switch" aria-checked="true".*?>Effects</span><span[^>]*>${running}<`));
      expect(html).not.toContain("<fieldset disabled");
    });
  });

  it("shows a card for each of the firmware's effects, the staged one pressed", async () => {
    await onBoard(glove80Board, (bundle) => {
      const html = draw(bundle);
      expect(cards(html, "Effect").map((card) => card.name)).toEqual(pack.effects);
      expect(pressed(html, "Effect")).toEqual([pack.effects[pack.initial.effect]]);
      expect(html).toContain("Palette");
      for (const palette of pack.palettes) expect(html).toContain(`>${palette}</option>`);
      for (const slider of ["Bright", "Speed"]) expect(html).toContain(`>${slider}</span>`);
      // Nothing staged yet: no Apply.
      expect(html).not.toContain("Revert");
    });
  });

  it("shows the slot over it as its own cards, with None for leaving it empty", async () => {
    await onBoard(glove80Board, (bundle) => {
      const html = draw(bundle);
      expect(cards(html, "Over it").map((card) => card.name)).toEqual(["None", ...pack.effects]);
      expect(pressed(html, "Over it")).toEqual([pack.effects[pack.overlay!]]);
    });
    await onBoard({ ...glove80Board, extensionEffects: { ...pack, overlay: null } }, (bundle) => {
      const html = draw(bundle);
      expect(pressed(html, "Over it")).toEqual(["None"]);
      expect(pressed(html, "Effect")).toEqual([pack.effects[pack.initial.effect]]);
    });
  });

  it("has only the effect's cards on firmware without a second slot", async () => {
    await onBoard({ ...glove80Board, extensionEffects: { ...pack, overlay: undefined } }, (bundle) => {
      const html = draw(bundle);
      expect(html).not.toContain("Over it");
      expect(cards(html, "Effect")).toHaveLength(pack.effects.length);
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
