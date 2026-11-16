// Lighting: a key's light on a layer (its scene cell or its status rules),
// clearing a layer of them, and the capacity checks every lighting operation
// shares. Pure.

import type { LightingSceneCell } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardImage } from "../sync/image";
import { planLight, type KeyLight } from "../model/lighting/key-light";
import type { Rules } from "../model/lighting/rules";
import { withoutStatusLights } from "../model/lighting/status-light";
import { failed, type Operation, type OperationFacts, type OperationResult } from "./types";

/** The image with these scenes and rules, if the keyboard has room for them. */
export function withLighting(
  image: KeyboardImage,
  facts: OperationFacts,
  parts: { scenes?: LightingSceneCell[]; rules?: Rules },
): OperationResult {
  const { scenes, rules } = parts;
  if (scenes && scenes !== image.scenes) {
    if (facts.sceneCapacity === null) return failed("This keyboard cannot store lighting scenes.");
    if (scenes.length > facts.sceneCapacity) {
      return failed(`This layout needs ${scenes.length} scene cells; the keyboard holds ${facts.sceneCapacity}.`);
    }
  }
  if (rules && rules !== image.runtimeConditionalScenes) {
    if (facts.ruleCapacity === null) return failed("This keyboard has no rule table.");
    if (rules.length > facts.ruleCapacity) {
      return failed(`This layout needs ${rules.length} rules; the keyboard holds ${facts.ruleCapacity}.`);
    }
  }
  return {
    ok: true,
    image: { ...image, scenes: scenes ?? image.scenes, runtimeConditionalScenes: rules ?? image.runtimeConditionalScenes },
  };
}

export const setKeyLight: Operation<{ layer: number; leds: readonly number[]; light: KeyLight }> = {
  name: "set_key_light",
  description: "Gives keys a light on a layer: off, a colour with an effect, the layer below, or a status light.",
  inputs: [
    { name: "layer", kind: "integer", min: 0, description: "The layer the keys light on." },
    { name: "leds", kind: "integer", list: true, min: 0, description: "The keys' LEDs." },
    { name: "light", kind: "value", description: "{ kind: off | below | color | a status light, … }." },
  ],
  run(image, { layer, leds, light }, facts) {
    if (!image.layers[layer]) return failed(`Layer ${layer} does not exist`);
    const plan = planLight(light, leds, layer, image.runtimeConditionalScenes, (led) => facts.ledNodes[led] ?? 0);
    const touched = new Set([...plan.erase, ...plan.paint.map((cell) => cell.led_id)]);
    const kept = image.scenes.filter((cell) => cell.layer !== layer || !touched.has(cell.led_id));
    const painted = plan.paint.map((cell): LightingSceneCell => ({ layer, led_id: cell.led_id, effect: cell.effect }));
    const scenes = kept.length === image.scenes.length && painted.length === 0 ? image.scenes : [...kept, ...painted];
    return withLighting(image, facts, { scenes, rules: plan.rules ?? undefined });
  },
};

export const clearLayerLights: Operation<{ layer: number }> = {
  name: "clear_layer_lights",
  description: "Removes every light set per key on a layer, its colours and its status lights: the firmware's own lights and the layers below show again.",
  inputs: [{ name: "layer", kind: "integer", min: 0, description: "The layer to clear." }],
  run(image, { layer }, facts) {
    if (!image.layers[layer]) return failed(`Layer ${layer} does not exist`);
    const scenes = image.scenes.filter((cell) => cell.layer !== layer);
    return withLighting(image, facts, {
      scenes: scenes.length === image.scenes.length ? image.scenes : scenes,
      rules: withoutStatusLights(image.runtimeConditionalScenes, layer),
    });
  },
};
