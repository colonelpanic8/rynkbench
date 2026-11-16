// Layout properties' RGB Lighting tab (ADR 0016) on simulated boards: the
// Lights switch, brightness and background, Advanced only where the keyboard
// has something keyboard-wide to set, and Advanced's "how layers light up".

import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import type { ConnectedBundle, WorkbenchState } from "../../model/workbench-state";
import { mockProvider, type BoardSpec } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import { ortho60Board } from "../../session/mock/ortho60";
import { stub48Board } from "../../session/mock/stub48";
import { renderInWorkbench } from "../../test/workbench";
import { openBundle } from "../bundle";
import { initialWorkbenchState } from "../../workbench";
import { LayerLightingSettings } from "./LayerLightingSettings";
import { LightingSection } from "./LightingSection";

async function onBoard(spec: BoardSpec, run: (bundle: ConnectedBundle) => void): Promise<void> {
  const session = await mockProvider(spec).connect();
  try {
    run(await openBundle(session));
  } finally {
    await session.close();
  }
}

function draw(node: ReactElement, bundle: ConnectedBundle, state: Partial<WorkbenchState> = {}): string {
  return renderInWorkbench(node, { bundle, state: { ...initialWorkbenchState(bundle), ...state } });
}

/** The big switch's name, whether it is on, and its one line. */
function bigSwitch(html: string): { name: string; on: boolean; line: string } | null {
  const match = /role="switch" aria-checked="(true|false)"[^>]*><span[^>]*><span[^>]*>([^<]*)<\/span><span[^>]*>([^<]*)</.exec(html);
  return match && { name: match[2], on: match[1] === "true", line: match[3] };
}

describe("RGB Lighting", () => {
  it("leads with the Lights switch, then brightness, with Advanced closed", async () => {
    await onBoard(glove80Board, (bundle) => {
      const html = draw(<LightingSection />, bundle);
      expect(bigSwitch(html)).toEqual({ name: "Lights", on: true, line: "On" });
      expect(html).toContain("Brightness");
      expect(html).toContain(`value="${glove80Board.brightness}"`);
      expect(html).toMatch(/aria-expanded="false"[^>]*>.*Advanced/);
      expect(html).not.toContain("lit keys stored");
    });
  });

  it("says the keyboard stays dark while the lights are off, and that a wake layer still lights it", async () => {
    await onBoard(glove80Board, (bundle) => {
      const html = draw(<LightingSection />, bundle, {
        lightingState: { ...bundle.lightingState!, output_enabled: false },
      });
      expect(bigSwitch(html)).toEqual({ name: "Lights", on: false, line: "Off: the keyboard stays dark" });
      expect(html).toContain("A wake layer still turns the lights on while it is active.");
      expect(html).toMatch(/<label class="[^"]*opacity-40[^"]*"><span[^>]*>Brightness/);
    });
  });

  it("shows the background's colour, mode and speed while it is on", async () => {
    await onBoard(ortho60Board, (bundle) => {
      const html = draw(<LightingSection />, bundle);
      expect(html).toMatch(/type="checkbox"[^>]*checked=""/);
      for (const slider of ["Hue", "Saturation", "Value", "Speed"]) expect(html).toContain(`>${slider}</span>`);
      expect(html).toContain("Breathe");
    });
  });

  it("leaves Advanced out on a keyboard with no layer lights, rules or firmware lights", async () => {
    await onBoard(stub48Board, (bundle) => {
      const html = draw(<LightingSection />, bundle);
      expect(bigSwitch(html)?.name).toBe("Lights");
      expect(html).not.toContain("Advanced");
    });
  });
});

describe("RGB Lighting → Advanced → Layers", () => {
  it("counts the stored lights and offers how layers light up and which wake the lights", async () => {
    await onBoard(glove80Board, (bundle) => {
      const html = draw(<LayerLightingSettings />, bundle);
      expect(html).toContain(`${bundle.scenes.length}/${glove80Board.sceneCapacity} lit keys stored`);
      expect(html).toContain("Top layer only");
      expect(html).toContain("Every active layer");
      expect(html).toContain("Wake the lights while they are off");
      // The Glove80's Magic layer (layer 2) wakes them.
      expect(html).toMatch(/aria-pressed="true"[^>]*>Magic</);
      expect(html).toMatch(/aria-pressed="false"[^>]*>Base</);
      expect(html).not.toContain("kept in this browser");
    });
  });

  it("is not there on a keyboard without layer lights", async () => {
    await onBoard(stub48Board, (bundle) => {
      expect(draw(<LayerLightingSettings />, bundle)).toBe("");
    });
  });
});
