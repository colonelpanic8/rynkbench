// The RGB Lighting tab's effect speed: a named speed, or Custom with the
// timing a light really has, for the key shown and for the Paint brush.

import { afterEach, describe, expect, it } from "vitest";
import type { LightingEffect } from "../../model/lighting-types";
import { keyLightOf } from "../../model/lighting/key-light";
import { renderInWorkbench } from "../../test/workbench";
import { LayerLighting } from "./LayerLighting";
import { lightView } from "./lightView";

const RED = { r: 255, g: 0, b: 0 };
/** Timing no named speed has, as the CLI or a file can set it. */
const OWN: LightingEffect = { Blink: { color: RED, period_ms: 750, phase_ms: 120, duty: 30 } };
const FAST: LightingEffect = { Blink: { color: RED, period_ms: 500, phase_ms: 0, duty: 50 } };
const STEADY: LightingEffect = { Solid: { color: RED } };

const draw = (ledId: number) =>
  renderInWorkbench(<LayerLighting ledId={ledId} />, {
    bundle: { sceneStatus: { capacity: 100 } },
    state: {
      uiLayer: 0,
      compiledScenes: [OWN, FAST, STEADY].map((effect, led_id) => ({ layer: 0, led_id, effect })),
    },
  });

/** The pressed choice among the named speeds and Custom. */
const speed = (html: string) => /aria-pressed="true"[^>]*>(Fast|Normal|Slow|Custom)</.exec(html)?.[1];
/** The numbers in the timing fields, by label. */
const numbers = (html: string) =>
  Object.fromEntries([...html.matchAll(/>(Period|Duty|Step|Phase)<span[^>]*><input [^>]*value="(\d+)"/g)].map((m) => [m[1], Number(m[2])]));

afterEach(() => lightView.setBrush(null));

describe("a light's speed in the RGB Lighting tab", () => {
  it("shows timing of the light's own as Custom, in its real numbers", () => {
    const html = draw(0);
    expect(speed(html)).toBe("Custom");
    expect(numbers(html)).toEqual({ Period: 750, Duty: 30, Phase: 120 });
  });

  it("shows a named speed by its name, without the numbers", () => {
    const html = draw(1);
    expect(speed(html)).toBe("Fast");
    expect(numbers(html)).toEqual({});
  });

  it("offers no speed for a steady light", () => {
    expect(speed(draw(2))).toBeUndefined();
  });

  it("shows the Paint brush's own timing, whatever key is shown", () => {
    lightView.setBrush(keyLightOf(OWN));
    const html = draw(2);
    expect(speed(html)).toBe("Custom");
    expect(numbers(html)).toEqual({ Period: 750, Duty: 30, Phase: 120 });
  });
});
