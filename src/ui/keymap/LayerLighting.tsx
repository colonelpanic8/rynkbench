// Per-key layer lighting, edited from the keymap inspector. The full painting
// surface (brush strokes, zones, selections, conditional rules) stays in
// Lighting mode; this is the one-key path for matching a layer's lighting to
// the bindings you are already editing.

import { useEffect, useMemo, useState } from "react";
import type {
  LightingEffect,
  LightingOverlayCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { lightingBaseFor, lightingDraftFor, stagedBetween, useWorkbench } from "../state";
import { ColorPicker } from "../lighting/ColorPicker";
import { NumberField } from "../lighting/EffectEditor";
import { buildEffect, effectKind, effectRgb, effectTiming, DEFAULT_TIMING } from "../lighting/effect";
import type { EffectKind, EffectTiming } from "../lighting/effect";
import { effectColor } from "../lighting/decor";
import type { Hsv } from "../color";
import { hsvToRgb, rgbToHsv } from "../color";
import { Button, SectionLabel, cx } from "../kit";
import { ChevronRightIcon, SpinnerIcon, WarningIcon } from "../icons";

const BLACK_EFFECT: LightingEffect = { Solid: { color: { r: 0, g: 0, b: 0 } } };

const DEFAULT_HSV: Hsv = { h: 195, s: 0.85, v: 1 };

interface Brush {
  hsv: Hsv;
  kind: EffectKind;
  timing: EffectTiming;
}

const DEFAULT_BRUSH: Brush = {
  hsv: DEFAULT_HSV,
  kind: "Solid",
  timing: DEFAULT_TIMING,
};

function brushFrom(effect: LightingEffect): Brush {
  return {
    hsv: rgbToHsv(effectRgb(effect)),
    kind: effectKind(effect),
    timing: effectTiming(effect),
  };
}

export function LayerLighting({ ledId }: { ledId: number | undefined }) {
  const { bundle, state, dispatch, io } = useWorkbench();
  const layer = state.uiLayer;
  const sceneStatus = bundle.sceneStatus;
  const [open, setOpen] = useState(false);
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);

  const draft = lightingDraftFor(state, layer);
  const base = lightingBaseFor(state, layer);
  const staged = useMemo(() => stagedBetween(draft, base), [draft, base]);
  const current = ledId === undefined ? undefined : draft[ledId];

  // A compiled cell cannot be deleted, only masked: dropping the runtime cell
  // would reveal the firmware default instead of turning the key off.
  const compiled = useMemo(
    () =>
      ledId === undefined
        ? undefined
        : state.compiledScenes.find((cell) => cell.layer === layer && cell.led_id === ledId),
    [ledId, layer, state.compiledScenes],
  );

  // Seed the brush from whatever the key already shows, so opening a lit key
  // and pressing Set is a no-op rather than a surprise recolor.
  useEffect(() => {
    setBrush(current ? brushFrom(current.effect) : DEFAULT_BRUSH);
    // Re-seed only when the target key changes, not on every draft edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledId, layer]);

  if (sceneStatus === null) return null;

  const effect = buildEffect(brush.kind, hsvToRgb(brush.hsv), brush.timing);

  const setKeyLight = () => {
    if (ledId === undefined) return;
    const cell: LightingOverlayCell = { led_id: ledId, effect, ttl_ms: undefined };
    dispatch({ type: "paint", cells: [cell], target: layer });
  };

  const clearKeyLight = () => {
    if (ledId === undefined) return;
    if (compiled) {
      dispatch({
        type: "paint",
        cells: [{ led_id: ledId, effect: BLACK_EFFECT, ttl_ms: undefined }],
        target: layer,
      });
    } else {
      dispatch({ type: "erase", ledIds: [ledId], target: layer });
    }
  };

  const applyLayer = () => {
    const passThrough = state.scenes.filter((cell) => cell.layer !== layer);
    const replaced = Object.values(draft).map(
      (cell): LightingSceneCell => ({ layer, led_id: cell.led_id, effect: cell.effect }),
    );
    io.applyScenes([...passThrough, ...replaced]);
  };

  const layerName = state.layerMetadata?.[layer]?.name ?? `Layer ${layer}`;

  return (
    <div className="border-t border-line-soft pt-4">
      {/* Collapsed by default: the binding editor is the inspector's primary
          tool, and this section is tall enough to push it out of view. */}
      <button
        type="button"
        className="flex w-full cursor-pointer items-center justify-between"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2">
          <ChevronRightIcon
            size={11}
            className={cx("text-faint transition-transform duration-120", open && "rotate-90")}
          />
          <SectionLabel>Layer lighting</SectionLabel>
          {current && (
            <span
              className="size-3 rounded-sm border border-cap-edge"
              style={{ background: effectColor(current.effect) }}
            />
          )}
          {ledId !== undefined && staged.has(ledId) && (
            <span className="text-[11px] text-accent">staged</span>
          )}
        </span>
        <span className="tnum text-[11px] text-faint">
          {state.scenes.length}/{sceneStatus.capacity} cells
        </span>
      </button>

      {!open ? null : ledId === undefined ? (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
          This key has no LED, so it cannot carry a scene cell.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
            Stored on the keyboard for {layerName} and composited natively as the layer activates.
          </p>

          <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-line bg-raised px-3 py-2">
            <span
              className="size-5 shrink-0 rounded-md border border-cap-edge"
              style={{ background: current ? effectColor(current.effect) : "var(--color-cap)" }}
            />
            <span className="min-w-0 flex-1 text-[12px] text-mute">
              {current ? `${effectKind(current.effect)} on this key` : "Unlit on this layer"}
              {compiled && " · firmware default"}
            </span>
            {ledId !== undefined && staged.has(ledId) && (
              <span className="text-[11px] text-accent">staged</span>
            )}
          </div>

          <div className="mt-3">
            <ColorPicker value={brush.hsv} onChange={(hsv) => setBrush({ ...brush, hsv })} />
          </div>

          <div className="mt-3">
            <SectionLabel>Effect</SectionLabel>
            <div className="mt-2 flex gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
              {(["Solid", "Blink", "Breathe"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setBrush({ ...brush, kind })}
                  className={cx(
                    "flex-1 cursor-pointer rounded-md py-1.5 text-[12px] font-medium transition-colors duration-120",
                    brush.kind === kind
                      ? "bg-raised text-ink shadow-sm"
                      : "text-faint hover:text-mute",
                  )}
                >
                  {kind}
                </button>
              ))}
            </div>
            {brush.kind !== "Solid" && (
              <div className="mt-2.5 flex flex-col gap-1.5">
                <NumberField
                  label="Period"
                  unit="ms"
                  min={100}
                  value={brush.timing.periodMs}
                  onChange={(periodMs) =>
                    setBrush({ ...brush, timing: { ...brush.timing, periodMs } })
                  }
                />
                {brush.kind === "Blink" && (
                  <NumberField
                    label="Duty"
                    unit="/255"
                    min={0}
                    max={255}
                    value={brush.timing.duty}
                    onChange={(duty) => setBrush({ ...brush, timing: { ...brush.timing, duty } })}
                  />
                )}
                {brush.kind === "Breathe" && (
                  <NumberField
                    label="Step"
                    unit="ms"
                    min={1}
                    value={brush.timing.stepMs}
                    onChange={(stepMs) =>
                      setBrush({ ...brush, timing: { ...brush.timing, stepMs } })
                    }
                  />
                )}
                <NumberField
                  label="Phase"
                  unit="ms"
                  min={0}
                  value={brush.timing.phaseMs}
                  onChange={(phaseMs) =>
                    setBrush({ ...brush, timing: { ...brush.timing, phaseMs } })
                  }
                />
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" className="flex-1" onClick={setKeyLight}>
              Set light
            </Button>
            <Button
              variant="ghost"
              className="flex-1"
              disabled={current === undefined}
              title={
                compiled
                  ? "Mask the firmware default so this key stays dark"
                  : "Remove this key's scene cell"
              }
              onClick={clearKeyLight}
            >
              Clear
            </Button>
          </div>
        </>
      )}

      {open && (
        <>
          {state.lightingError && (
            <div className="mt-2 flex items-center gap-2 text-[12px] text-danger">
              <WarningIcon size={13} />
              <span className="min-w-0 flex-1 truncate" title={state.lightingError}>
                {state.lightingError}
              </span>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={staged.size === 0 || state.lightingBusy}
              title={`Replace ${layerName}'s stored scene with the staged canvas`}
              onClick={applyLayer}
            >
              {state.lightingBusy && <SpinnerIcon size={13} />}
              Apply{staged.size > 0 ? ` · ${staged.size} staged` : ""}
            </Button>
            <Button
              variant="ghost"
              disabled={staged.size === 0 || state.lightingBusy}
              title="Throw away staged edits and return to the stored scene"
              onClick={() => dispatch({ type: "draftReset", target: layer })}
            >
              Discard
            </Button>
          </div>

          <button
            type="button"
            className="mt-2 w-full cursor-pointer text-[11.5px] text-faint transition-colors duration-120 hover:text-mute"
            onClick={() => {
              dispatch({ type: "lightingTarget", target: layer });
              dispatch({ type: "mode", mode: "lighting" });
            }}
          >
            Open {layerName} in Lighting for brushes, zones and rules
          </button>
        </>
      )}
    </div>
  );
}
