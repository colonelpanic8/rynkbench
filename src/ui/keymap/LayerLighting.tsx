// The key editor's RGB Lighting tab, as GLIDE's Key Lighting (ADR 0016): one
// choice for the key on the layer shown (Off, Color, Layer below, and with the
// firmware's rule table Status light), the chosen one's fields under it, and
// Paint, which makes the choice a brush for the canvas (one undo step per
// stroke). With several keys selected (Select, or ⌘ on a Mac, Ctrl elsewhere,
// and Shift with a click) a choice gives them all that light, as one change and one undo step.
// While the tab is open the canvas shows the board under its lights. At the
// foot, the whole layer's lights can be cleared, after a question.
// Changes join the draft (sent with Review & send; in Live, once painting
// pauses). With "Try out (not saved)" on, the choice, the selection and Paint
// give try-out lights instead: a colour, or Off for none (TryOut.tsx).
// The lights as a whole are in Layout properties (RGB settings…).

import { useEffect, useState } from "react";
import { openProperties } from "../properties/store";
import type { LightingEffect } from "../../model/lighting-types";
import { useWorkbench } from "../state";
import { effectColor } from "../lighting/decor";
import { DEFAULT_TIMING } from "../../model/lighting/effect";
import { sameLight, type KeyLight } from "../../model/lighting/key-light";
import { LED_PRESETS } from "../../model/lighting/color";
import { ledsOf, selectedKeys } from "../../model/key-selection";
import { layerName } from "../layer-names";
import { Button, cx, ErrorBanner } from "../kit";
import { askConfirm, showToast } from "../messages/store";
import { BrushIcon, MarqueeIcon } from "../icons";
import { KeyLightFields } from "./KeyLightFields";
import { lightView, useLightView } from "./lightView";
import { useKeyLights } from "./useKeyLights";
import { onApple } from "./useKeySelection";
import { useTryOut } from "./useTryOut";
import { TryOutPanel, TryOutSwitch } from "./TryOut";

const [RED] = LED_PRESETS;

/** The choices; a status light is one choice whatever it shows. */
type Choice = "off" | "color" | "below" | "status";
const choiceOf = (light: KeyLight): Choice =>
  light.kind === "off" || light.kind === "color" || light.kind === "below" ? light.kind : "status";

/** Each choice, with what it starts as when picked. */
const CHOICES: Array<{ id: Choice; start: KeyLight; title: string; text: string; needsRules?: boolean; stored?: boolean }> = [
  { id: "off", start: { kind: "off" }, title: "Off", text: "The LED stays dark." },
  { id: "color", start: { kind: "color", color: RED, effect: "Solid", timing: DEFAULT_TIMING }, title: "Color", text: "One color you pick." },
  { id: "below", start: { kind: "below" }, title: "Layer below", text: "Shows what the layer below lights.", stored: true },
  {
    id: "status",
    start: { kind: "lock", lock: "caps_lock", on: RED, off: null },
    title: "Status light",
    text: "Shows a lock, the battery or the connection.",
    needsRules: true,
    stored: true,
  },
];

/** A key's light when the firmware only lets it be read. */
function ReadOnlyLight({ effect }: { effect: LightingEffect }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-body text-mute">
        <span className="size-3 rounded-sm border border-cap-edge" style={{ background: effectColor(effect) }} />
        Lit on this layer · firmware default
      </div>
      <p className="text-small text-faint">This firmware exposes layer lighting for viewing only.</p>
    </div>
  );
}

const toolClass = (on: boolean) =>
  cx(
    "flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-body font-semibold transition-colors",
    on ? "border-accent bg-accent-fill text-on-accent" : "border-line-strong text-ink hover:border-mute",
  );

/** `ledId`: the LED of the key the editor shows; the other selected keys' are found here. */
export function LayerLighting({ ledId }: { ledId: number | undefined }) {
  const { bundle, state, dispatch } = useWorkbench();
  const view = useLightView();
  const lights = useKeyLights();
  const tryOut = useTryOut();
  const layer = state.uiLayer;

  useEffect(() => {
    lightView.setOpen(true);
    return () => lightView.setOpen(false);
  }, []);

  // Every selected key that has an LED; the tab shows the light of the editor's key.
  const keys = selectedKeys(state.selection);
  const several = keys.length > 1;
  const leds = several ? ledsOf(bundle.model.keys, keys) : ledId === undefined ? [] : [ledId];
  const lead = ledId ?? leds.at(-1);
  const current: KeyLight = lead === undefined ? { kind: "below" } : lights.lightOf(lead);
  // What each choice had last, so trying another and coming back keeps its fields.
  const [kept, setKept] = useState<Partial<Record<Choice, KeyLight>>>({});
  // Re-seed only when the key or the layer changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setKept({ [choiceOf(current)]: current }), [lead, layer]);

  if (!lights.writable) {
    const effect = ledId === undefined ? undefined : lights.preview.get(ledId);
    return effect ? <ReadOnlyLight effect={effect} /> : null;
  }

  const shown: KeyLight = view.brush ?? current;
  const differ = (light: KeyLight) => leds.some((led) => !sameLight(light, lights.lightOf(led)));
  const choose = (light: KeyLight) => {
    setKept((all) => ({ ...all, [choiceOf(light)]: light }));
    if (view.brush) return lightView.setBrush(light);
    if (differ(light)) lights.set(light, leds);
  };
  const unusable = leds.length === 0 && !view.brush;
  const unlit = keys.length - leds.length;
  const name = layerName(state.layerMetadata, layer);
  const clearLayer = async () => {
    const count = lights.layerLights;
    const yes = await askConfirm({
      title: `Clear every light on ${name}?`,
      body: `${count} key${count === 1 ? " goes" : "s go"} back to what the firmware and the layers below light. Undo brings ${count === 1 ? "it" : "them"} back.`,
      confirmLabel: "Clear lights",
      danger: true,
    });
    if (!yes) return;
    const result = await lights.clearLayer();
    if (result.ok) showToast(`${name}'s lights cleared`, { tone: "ok" });
    else if (!result.guarded) showToast(`Nothing was cleared: ${result.message}`, { tone: "danger" });
  };
  const lightsOff = state.lightingState?.output_enabled === false;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className="mr-auto text-small font-semibold tracking-widest text-mute uppercase">
          RGB Lighting · {tryOut.on ? "Try out" : name}
        </h3>
        <button
          type="button"
          aria-pressed={view.selecting}
          title={`Select several keys. Also: ${onApple() ? "⌘" : "Ctrl"} with a click or a drag, Shift with a click.`}
          onClick={() => lightView.setSelecting(!view.selecting)}
          className={toolClass(view.selecting)}
        >
          <MarqueeIcon size={13} /> Select
        </button>
        <button
          type="button"
          aria-pressed={view.brush !== null}
          onClick={() => lightView.setBrush(view.brush ? null : shown)}
          className={toolClass(view.brush !== null)}
        >
          <BrushIcon size={13} /> Paint
        </button>
      </div>
      {tryOut.offered && <TryOutSwitch tryOut={tryOut} />}
      {tryOut.on && <TryOutPanel tryOut={tryOut} layer={layer} name={name} />}
      {view.brush && <p className="text-small text-accent">Click or drag over keys to give them this lighting.</p>}
      {view.selecting && (
        <p className="text-small text-accent">Click or drag over keys to select them; start on a selected key to take keys out.</p>
      )}
      {several && (
        <div className="flex items-center gap-3 text-small text-mute">
          <span className="mr-auto">
            <span className="font-semibold text-ink">{keys.length} keys selected</span>
            {unlit > 0 && ` · ${unlit} without an LED`}
            {!view.brush && differ(current) && " · their lights differ: a choice gives them all the same"}
          </span>
          <button
            type="button"
            className="shrink-0 cursor-pointer font-semibold text-accent hover:underline"
            onClick={() => state.selection?.type === "key" && dispatch({ type: "select", selection: { type: "key", row: state.selection.row, col: state.selection.col } })}
          >
            Select only this key
          </button>
        </div>
      )}
      {leds.length === 0 && !view.brush && (
        <p className="text-small text-mute">
          {several ? "None of these keys has an LED." : "This key has no LED."} Turn on Paint to light other keys.
        </p>
      )}
      {lightsOff && (
        <div className="flex items-center gap-2 rounded-xl bg-warn/10 p-3 text-body text-warn">
          <span className="mr-auto">None of these show while the keyboard's lights are off.</span>
          <button
            type="button"
            onClick={() => openProperties("lighting")}
            className="shrink-0 cursor-pointer rounded-full border border-warn px-3 py-1 text-small font-semibold hover:bg-warn/10"
          >
            RGB settings…
          </button>
        </div>
      )}
      {state.lightingError && <ErrorBanner message={state.lightingError} />}

      {CHOICES.filter((choice) => !choice.needsRules || lights.statusLights).map((choice) => {
        const chosen = choiceOf(shown) === choice.id;
        const notTried = tryOut.on && choice.stored === true;
        const text = notTried ? "Not for a try-out: it is saved on the layer." : tryOut.on && choice.id === "off" ? "No try-out light: the saved one shows." : choice.text;
        return (
          <div
            key={choice.id}
            className={cx(
              "rounded-xl border transition-colors",
              chosen ? "border-accent bg-accent-dim" : "border-line-strong hover:border-mute",
              (unusable || notTried) && "opacity-50",
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={unusable || notTried}
              title={notTried ? "Try-out lights are a color or none" : undefined}
              onClick={() => choose(kept[choice.id] ?? choice.start)}
              className="flex w-full cursor-pointer items-start gap-3 px-4 py-2.5 text-left disabled:cursor-not-allowed"
            >
              <span
                className={cx(
                  "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                  chosen ? "border-accent" : "border-mute",
                )}
              >
                {chosen && <span className="size-2 rounded-full bg-accent" />}
              </span>
              <span>
                <span className="block text-ui font-semibold text-ink">{choice.title}</span>
                <span className="block text-small text-mute">{text}</span>
              </span>
            </button>
            {chosen && (choice.id === "color" || choice.id === "status") && (
              <div className="flex flex-col gap-3 px-4 pt-1 pb-4 pl-11">
                <KeyLightFields key={`${layer}:${leds.join()}`} light={shown} lights={lights} onChange={choose} />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="mr-auto cursor-pointer text-small text-mute underline-offset-2 hover:text-ink hover:underline"
          onClick={() => openProperties("lighting")}
        >
          RGB settings…
        </button>
        {!tryOut.on && (
          <Button
            variant="danger"
            className="px-2.5 py-1 text-small"
            disabled={lights.layerLights === 0}
            reason={`No key has a light of its own on ${name}`}
            onClick={() => void clearLayer()}
          >
            Clear {name}'s lights…
          </Button>
        )}
      </div>
    </div>
  );
}
