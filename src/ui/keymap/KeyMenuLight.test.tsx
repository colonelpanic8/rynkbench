// The key menu's colours: your colours apart from the presets, with the key's
// own colour pressed.

import { describe, expect, it } from "vitest";
import type { LightingEffect } from "../../model/lighting-types";
import { renderInWorkbench } from "../../test/workbench";
import { KeyMenuLight } from "./KeyMenuLight";
import { useKeyLights } from "./useKeyLights";

const OWN: LightingEffect = { Solid: { color: { r: 0x12, g: 0x34, b: 0x56 } } };
const PRESET: LightingEffect = { Solid: { color: { r: 239, g: 68, b: 68 } } };

function Menu({ led }: { led: number }) {
  return <KeyMenuLight led={led} lights={useKeyLights()} onPicked={() => {}} />;
}

const draw = (led: number) =>
  renderInWorkbench(<Menu led={led} />, {
    bundle: { sceneStatus: { capacity: 100 } },
    state: { uiLayer: 0, layerDrafts: { 0: { 0: { led_id: 0, effect: OWN, ttl_ms: undefined }, 1: { led_id: 1, effect: PRESET, ttl_ms: undefined } } } },
  });

/** The titles of the pressed swatches. */
const pressed = (html: string) => [...html.matchAll(/title="([^"]+)" aria-label="[^"]+" aria-pressed="true"/g)].map((m) => m[1]);

describe("the key menu's colours", () => {
  it("lists your colours without the presets, and presses the key's own", () => {
    const html = draw(0);
    expect(html).toContain("Your colors · 1");
    expect(pressed(html)).toEqual(["#123456 · used on 1 key"]);
  });

  it("presses a preset the key shows", () => {
    expect(pressed(draw(1))).toEqual(["#EF4444"]);
  });
});
