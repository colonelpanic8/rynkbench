// Reading and writing keys' lights on the layer shown, for the RGB Lighting
// tab and for Paint on the canvas. A light lives in the layer's scene (Off, a
// colour, Layer below) or in the rule table (a status light); setting one is
// the set_key_light operation (ADR 0019), one Undo step; clearing the layer of
// them all is clear_layer_lights. While trying out, the tab and Paint give
// keys try-out lights instead (useTryOut.ts), shown over the stored ones. Your
// colours and changing one colour everywhere work over every layer's scene
// and the rules you coloured.

import { useMemo } from "react";
import type { LightingRgb8 } from "../../model/lighting-types";
import { rgbToHex } from "../../model/lighting/color";
import { effectRgb } from "../../model/lighting/effect";
import {
  colorsInUse,
  keyLightOf,
  pickedColor,
  planLight,
  recolorCells,
  recolorRules,
  type KeyLight,
} from "../../model/lighting/key-light";
import { statusLightLeds, statusLightOf } from "../../model/lighting/status-light";
import { targetPreviewEffects } from "../../model/lighting/preview";
import { tryOutLightOf, tryOutPlan, withTryOut } from "../../model/lighting/try-out";
import { ledNodesOf, lightingDraftFor, type IoWriteResult } from "../../workbench";
import { useWorkbench } from "../state";
import { useCapability } from "../use-capabilities";
import { useTryOut } from "./useTryOut";

export function useKeyLights() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const scenes = useCapability("lighting.scenes");
  const rulesTable = useCapability("lighting.rules");
  const layer = state.uiLayer;
  const layers = Array.from({ length: bundle.caps.num_layers }, (_, index) => index);
  const draft = lightingDraftFor(state, layer);
  const rules = state.runtimeConditionalDraft;
  const coloured = rules.filter(pickedColor);
  const preview = useMemo(() => targetPreviewEffects(layer, draft, state.compiledScenes), [layer, draft, state.compiledScenes]);
  const tryOut = useTryOut();
  const trying = tryOut.on;
  const shown = useMemo(() => (trying ? withTryOut(preview, state.tryOut) : preview), [trying, preview, state.tryOut]);
  const storedOf = (led: number): KeyLight => keyLightOf(preview.get(led), statusLightOf(rules, layer, led));

  const nodes = useMemo(() => ledNodesOf(bundle), [bundle]);
  const everyCell = () => layers.flatMap((index) => Object.values(lightingDraftFor(state, index)));

  return {
    /** The firmware can store a layer's lighting; without it lights can only be read. */
    writable: scenes !== undefined,
    /** Status lights need the firmware's rule table. */
    statusLights: rulesTable !== undefined,
    /** How many Bluetooth profiles a profile's status light can show; none without Bluetooth. */
    bleProfiles: bundle.caps.ble_enabled ? bundle.caps.num_ble_profiles : 0,
    /** A split board has a battery on each half. */
    split: bundle.caps.is_split,
    /** The layer's stored lights, firmware defaults included. */
    preview,
    /** What the canvas lights: the stored lights, with the try-out lights over them while trying out. */
    shown,
    /** The light the tab edits for a key: its try-out light while trying out, else its stored one. */
    lightOf: (led: number): KeyLight => (trying ? tryOutLightOf(state.tryOut[led]) : storedOf(led)),
    /** The light a key shows on the canvas. */
    shownOf: (led: number): KeyLight => (trying && state.tryOut[led] ? tryOutLightOf(state.tryOut[led]) : storedOf(led)),

    /** Gives keys a light: a try-out light while trying out, else a stored one on the
     *  layer shown, one change judged and undone as one. */
    async set(light: KeyLight, leds: readonly number[]): Promise<IoWriteResult> {
      if (!trying) return io.apply("set_key_light", { layer, leds, light });
      const plan = tryOutPlan(light, leds, tryOut.lifetimeMs);
      if (plan) io.tryOut(plan.cells, plan.erase);
      return { ok: true };
    },
    /** How many keys have a light of their own on the layer shown: a stored colour or a status light. */
    layerLights: new Set([...Object.keys(draft).map(Number), ...statusLightLeds(rules, layer)]).size,
    /** Removes them all, so the firmware's lights and the layers below show: one change, one Undo step. */
    clearLayer() {
      return io.apply("clear_layer_lights", { layer });
    },
    /** Paint: a key under the brush gets its light. A stroke is one step, and in
     *  Live it is written once the painting pauses (a scene is written whole);
     *  a try-out stroke is one write of the overlay. */
    paint(light: KeyLight, led: number) {
      if (trying) {
        const tried = tryOutPlan(light, [led], tryOut.lifetimeMs);
        if (tried) io.tryOut(tried.cells, tried.erase);
        return;
      }
      const plan = planLight(light, [led], layer, rules, (each) => nodes[each] ?? 0);
      if (plan.paint.length) dispatch({ type: "paint", cells: plan.paint, layer });
      if (plan.erase.length) dispatch({ type: "erase", ledIds: plan.erase, layer });
      if (plan.rules) dispatch({ type: "conditionalDraft", cells: plan.rules });
    },
    /** Your colours: those lit in the layout's scenes and rules, most used first. */
    yours: colorsInUse([...everyCell().map((cell) => cell.effect), ...coloured.map((rule) => rule.cell.effect)]),
    usage(color: LightingRgb8) {
      const hex = rgbToHex(color);
      const lit = layers.filter((index) =>
        Object.values(lightingDraftFor(state, index)).some((cell) => rgbToHex(effectRgb(cell.effect)) === hex),
      );
      const keys = everyCell().filter((cell) => rgbToHex(effectRgb(cell.effect)) === hex).length;
      const ruleKeys = coloured.filter((rule) => rgbToHex(effectRgb(rule.cell.effect)) === hex).length;
      return { keys: keys + ruleKeys, layers: lit.length };
    },
    /** Changes one colour on every key of every layer, effects kept; returns how many changed. */
    recolor(from: LightingRgb8, to: LightingRgb8): number {
      let count = 0;
      for (const index of layers) {
        const cells = recolorCells(Object.values(lightingDraftFor(state, index)), from, to);
        count += cells.length;
        if (cells.length) dispatch({ type: "paint", cells, layer: index });
      }
      const recolored = recolorRules(rules, from, to);
      const ruleCount = recolored.filter((rule, i) => rule !== rules[i]).length;
      if (ruleCount) dispatch({ type: "conditionalDraft", cells: recolored });
      return count + ruleCount;
    },
  };
}

export type KeyLights = ReturnType<typeof useKeyLights>;
