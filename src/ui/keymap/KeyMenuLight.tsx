// The key menu's colours, as in GLIDE's: your colours (lit in the layout, most
// used first, the presets left out) and the presets, then no colour (Off). A pick gives the key, or
// every selected key, that light: the RGB Lighting tab's own change, so it is
// one Undo step and reaches the keyboard as every other light change does.

import type { ReactNode } from "react";
import type { LightingRgb8 } from "../../model/lighting-types";
import { LED_PRESETS, rgbToHex } from "../../model/lighting/color";
import { shownColor, withColor } from "../../model/lighting/key-light";
import { ledsOf, selectedKeys } from "../../model/key-selection";
import { DarkSwatch, Swatch } from "../lighting/ColorChoice";
import { showToast } from "../messages/store";
import { useWorkbench } from "../state";
import type { KeyLights } from "./useKeyLights";

const hexOf = (color: LightingRgb8) => rgbToHex(color).toUpperCase();

function Swatches({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption text-mute">{title}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

/** The colours for a key with an LED (`led`), on a board that stores lights. */
export function KeyMenuLight({ led, lights, onPicked }: { led: number; lights: KeyLights; onPicked: () => void }) {
  const { bundle, state } = useWorkbench();
  const light = lights.lightOf(led);
  const current = shownColor(light);
  const onPick = async (color: LightingRgb8 | null) => {
    onPicked();
    // The menu opened on one of several selected keys keeps them selected: each with an LED gets it.
    const keys = selectedKeys(state.selection);
    const result = await lights.set(withColor(light, color), keys.length > 1 ? ledsOf(bundle.model.keys, keys) : [led]);
    if (!result.ok && !result.guarded) showToast(`The light was not changed: ${result.message}`, { tone: "danger" });
  };
  const presets = new Set(LED_PRESETS.map(hexOf));
  const own = lights.yours.filter((color) => !presets.has(hexOf(color)));
  const chosen = (color: LightingRgb8) => current !== null && hexOf(current) === hexOf(color);
  return (
    <div className="flex flex-col gap-2 px-4 pt-1 pb-2">
      {own.length > 0 && (
        <Swatches title={`Your colors · ${own.length}`}>
          {own.map((color) => {
            const keys = lights.usage(color).keys;
            return (
              <Swatch small key={hexOf(color)} color={color} chosen={chosen(color)} title={`${hexOf(color)} · used on ${keys} key${keys === 1 ? "" : "s"}`} onPick={() => void onPick(color)} />
            );
          })}
        </Swatches>
      )}
      <Swatches title="Presets">
        {LED_PRESETS.map((color) => (
          <Swatch small key={hexOf(color)} color={color} chosen={chosen(color)} title={hexOf(color)} onPick={() => void onPick(color)} />
        ))}
        <DarkSwatch small title="No color (LED off)" chosen={light.kind === "off"} onPick={() => void onPick(null)} />
      </Swatches>
    </div>
  );
}
