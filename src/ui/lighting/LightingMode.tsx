// Lighting mode: drag-paint overlay cells on the canvas, stage vs apply.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  LightingEffect,
  LightingOverlayCell,
  LightingSceneCell,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";
import { keyActionGlyph } from "../labels";
import type { LightingTarget } from "../state";
import {
  activeLightingBase,
  activeLightingDraft,
  stagedBetween,
  useWorkbench,
} from "../state";
import { ColorPicker } from "./ColorPicker";
import { BackgroundPanel } from "./BackgroundPanel";
import { EffectsPanel } from "./EffectsPanel";
import { LayerPresets } from "./LayerPresets";
import type { Hsv } from "../color";
import { cssEmissiveRgb, cssRgb, hsvToRgb } from "../color";
import { Button, InspectorShell, SectionLabel, TextInput, cx } from "../kit";
import { EraserIcon, SpinnerIcon, WarningIcon } from "../icons";
import { effectiveAction } from "../live/compositor";
import { targetPreviewEffects } from "./preview";
import { describeConditions, firmwarePreviewCells } from "./firmwareRules";

type EffectKind = "Solid" | "Blink" | "Breathe";

interface Brush {
  mode: "paint" | "erase";
  hsv: Hsv;
  kind: EffectKind;
  periodMs: number;
  duty: number;
  phaseMs: number;
  stepMs: number;
  ttlOn: boolean;
  ttlMs: number;
}

const DEFAULT_BRUSH: Brush = {
  mode: "paint",
  hsv: { h: 195, s: 0.85, v: 1 },
  kind: "Solid",
  periodMs: 1000,
  duty: 128,
  phaseMs: 0,
  stepMs: 16,
  ttlOn: false,
  ttlMs: 5000,
};

const BLACK_EFFECT: LightingEffect = { Solid: { color: { r: 0, g: 0, b: 0 } } };

function sceneLayerMap(
  scenes: LightingSceneCell[],
  layer: number,
): Record<number, LightingOverlayCell> {
  const cells: Record<number, LightingOverlayCell> = {};
  for (const cell of scenes) {
    if (cell.layer === layer)
      cells[cell.led_id] = { led_id: cell.led_id, effect: cell.effect, ttl_ms: undefined };
  }
  return cells;
}

function brushEffect(brush: Brush): LightingEffect {
  const color = hsvToRgb(brush.hsv);
  switch (brush.kind) {
    case "Solid":
      return { Solid: { color } };
    case "Blink":
      return {
        Blink: {
          color,
          period_ms: brush.periodMs,
          phase_ms: brush.phaseMs,
          duty: brush.duty,
        },
      };
    case "Breathe":
      return {
        Breathe: {
          color,
          period_ms: brush.periodMs,
          phase_ms: brush.phaseMs,
          step_ms: brush.stepMs,
        },
      };
  }
}

function brushCell(brush: Brush, ledId: number, allowTtl: boolean): LightingOverlayCell {
  return {
    led_id: ledId,
    effect: brushEffect(brush),
    ttl_ms: allowTtl && brush.ttlOn ? brush.ttlMs : undefined,
  };
}

function effectColor(effect: LightingEffect): string {
  if ("Solid" in effect) return cssEmissiveRgb(effect.Solid.color);
  if ("Blink" in effect) return cssEmissiveRgb(effect.Blink.color);
  return cssEmissiveRgb(effect.Breathe.color);
}

function effectAnim(effect: LightingEffect): KeyDecor["fillAnim"] {
  if ("Blink" in effect)
    return { name: "led-blink", periodMs: effect.Blink.period_ms, delayMs: effect.Blink.phase_ms };
  if ("Breathe" in effect)
    return {
      name: "led-breathe",
      periodMs: effect.Breathe.period_ms,
      delayMs: effect.Breathe.phase_ms,
    };
  return undefined;
}

function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 text-[12px] text-mute">
      {label}
      <span className="flex items-center gap-1">
        <TextInput
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-[74px] py-1 text-right"
        />
        {unit && (
          <span className="min-w-5 shrink-0 whitespace-nowrap text-[11px] text-faint">{unit}</span>
        )}
      </span>
    </label>
  );
}

/** Overlay + per-layer edit targets, styled like Keymap mode's layer tabs.
 *  Only rendered when the firmware supports on-device scenes. */
function LightingTargets() {
  const { bundle, state, dispatch } = useWorkbench();
  const numLayers = bundle.caps.num_layers;
  const target = state.lightingTarget;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });

  const layersWithCells = useMemo(() => {
    const set = new Set<number>();
    for (const cell of state.compiledScenes) set.add(cell.layer);
    for (const cell of state.scenes) set.add(cell.layer);
    return set;
  }, [state.compiledScenes, state.scenes]);

  const key = (t: LightingTarget) => (t === "overlay" ? "overlay" : `L${t}`);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const btn = wrap.querySelector<HTMLButtonElement>(`[data-target="${key(target)}"]`);
    if (btn) setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [target, numLayers]);

  const targets: LightingTarget[] = ["overlay", ...Array.from({ length: numLayers }, (_, n) => n)];

  return (
    <div className="flex items-center gap-3 px-1">
      <div ref={wrapRef} className="relative flex items-center gap-1">
        {targets.map((t) => {
          const selected = t === target;
          const isLayer = t !== "overlay";
          const live = isLayer && t === state.currentLayer;
          const hasContent = isLayer && layersWithCells.has(t);
          const title = isLayer
            ? `Layer ${t} scene${hasContent ? " · lit" : " · unlit"}${
                live ? " · effective layer" : ""
              }`
            : "Transient overlay — cleared on reboot";
          return (
            <button
              key={key(t)}
              type="button"
              data-target={key(t)}
              onClick={() => dispatch({ type: "lightingTarget", target: t })}
              title={title}
              className={cx(
                "relative flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150",
                selected ? "text-ink" : "text-faint hover:text-mute",
              )}
            >
              <span className="tnum">{t === "overlay" ? "Overlay" : `L${t}`}</span>
              {hasContent && <span className="size-1 rounded-full bg-accent" />}
              {live && (
                <span title="Effective layer" className="size-1.5 rounded-full bg-ok" />
              )}
            </button>
          );
        })}
        <div
          className="absolute -bottom-px h-0.5 rounded-full bg-accent transition-all duration-180"
          style={{
            left: underline.left,
            width: underline.width,
            transitionTimingFunction: "cubic-bezier(0.25,0.8,0.35,1)",
          }}
        />
      </div>
    </div>
  );
}

function FirmwareRulesPanel({ activeCount }: { activeCount: number }) {
  const { bundle, state } = useWorkbench();
  const total = state.compiledScenes.length + state.conditionalScenes.length;
  const labels = useMemo(() => {
    const result = new Map<number, string>();
    for (const key of bundle.model.keys) {
      if (key.ledId !== undefined) result.set(key.ledId, key.label || `LED ${key.ledId}`);
    }
    return result;
  }, [bundle.model]);
  const groups = useMemo(() => {
    const result = new Map<string, { description: string; color: string; leds: number[] }>();
    for (const cell of state.compiledScenes) {
      const key = JSON.stringify({ layer: cell.layer, effect: cell.effect });
      const group = result.get(key) ?? {
        description: `L${cell.layer} active`,
        color: effectColor(cell.effect),
        leds: [],
      };
      group.leds.push(cell.led_id);
      result.set(key, group);
    }
    for (const cell of state.conditionalScenes) {
      const key = JSON.stringify({ conditions: cell.conditions, effect: cell.effect });
      const group = result.get(key) ?? {
        description: describeConditions(cell),
        color: effectColor(cell.effect),
        leds: [],
      };
      group.leds.push(cell.led_id);
      result.set(key, group);
    }
    return [...result.values()];
  }, [state.compiledScenes, state.conditionalScenes]);

  const outputMode = state.lightingOutputMode;
  if (total === 0 && outputMode === null) return null;
  const { output_toggle_user_action: toggleAction, wake_layer: wakeLayer } =
    state.lightingControls;
  return (
    <div>
      <SectionLabel>Configured firmware rules</SectionLabel>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
        Read-only from keyboard.toml · {total} cells · {activeCount} active in this preview
      </p>
      {(toggleAction !== undefined || wakeLayer !== undefined) && (
        <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
          {toggleAction !== undefined && `User${toggleAction} toggles all lighting`}
          {toggleAction !== undefined && wakeLayer !== undefined && " · "}
          {wakeLayer !== undefined && `L${wakeLayer} wakes lighting and presents status`}
        </p>
      )}
      {outputMode !== null && (
        <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
          {outputMode.cycle_user_action !== undefined &&
            `User${outputMode.cycle_user_action} cycles always on → always off → plugged-in only · `}
          Current: {outputMode.mode === "AlwaysOn"
            ? "always on"
            : outputMode.mode === "AlwaysOff"
              ? "always off"
              : "plugged-in only"}
          {` · ${outputMode.effective_enabled ? "lights on" : "lights off"}`}
          {` · ${outputMode.powered ? "USB powered" : "on battery"}`}
          {outputMode.powered_only_scope === "Local" && " · power evaluated per half"}
        </p>
      )}
      <details className="mt-2 rounded-lg border border-line-soft bg-well px-3 py-2">
        <summary className="cursor-pointer text-[12px] font-medium text-mute">
          Show {groups.length} conditions
        </summary>
        <div className="mt-2 flex flex-col gap-2">
          {groups.map((group, index) => {
            const names = group.leds.map((id) => labels.get(id) ?? `LED ${id}`).join(", ");
            return (
              <div key={index} className="flex items-start gap-2 text-[11.5px]">
                <span
                  className="mt-1 size-2 shrink-0 rounded-full"
                  style={{ background: group.color }}
                />
                <div className="min-w-0">
                  <div className="text-mute">{group.description}</div>
                  <div className="truncate text-faint" title={names}>
                    {names}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

export function LightingMode() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);
  const painting = useRef(false);

  useEffect(() => {
    const up = () => {
      painting.current = false;
    };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const target = state.lightingTarget;
  const isLayerTarget = target !== "overlay";
  const draftMap = activeLightingDraft(state);
  const baseMap = activeLightingBase(state);
  const staged = useMemo(
    () => stagedBetween(draftMap, baseMap),
    [draftMap, baseMap],
  );
  const compiledLayerMap = useMemo(
    () => (isLayerTarget ? sceneLayerMap(state.compiledScenes, target) : {}),
    [isLayerTarget, state.compiledScenes, target],
  );

  const visibleEffects = useMemo(
    () => targetPreviewEffects(target, draftMap, state.compiledScenes),
    [draftMap, state.compiledScenes, target],
  );
  const conditionalPreview = useMemo(() => {
    const activeLayers =
      target === "overlay"
        ? new Set(state.activeLayers)
        : new Set([state.defaultLayer, target]);
    return firmwarePreviewCells([], state.conditionalScenes, {
      activeLayers,
      batteries: new Map([
        [0, state.battery],
        [1, state.peripheralBattery],
      ]),
    });
  }, [
    state.activeLayers,
    state.battery,
    state.conditionalScenes,
    state.defaultLayer,
    state.peripheralBattery,
    target,
  ]);
  const previewEffects = useMemo(() => {
    const result = new Map(visibleEffects);
    for (const cell of conditionalPreview.values()) result.set(cell.led_id, cell.effect);
    const outputMode = state.lightingOutputMode;
    const activeLayers =
      target === "overlay"
        ? new Set(state.activeLayers)
        : new Set([state.defaultLayer, target]);
    if (
      outputMode?.indicator !== undefined &&
      outputMode.wake_layer !== undefined &&
      activeLayers.has(outputMode.wake_layer)
    ) {
      const effect =
        outputMode.mode === "AlwaysOn"
          ? outputMode.indicator.always_on
          : outputMode.mode === "AlwaysOff"
            ? outputMode.indicator.always_off
            : outputMode.indicator.powered_only;
      result.set(outputMode.indicator.led_id, effect);
    }
    return result;
  }, [conditionalPreview, state.activeLayers, state.defaultLayer, state.lightingOutputMode, target, visibleEffects]);

  const lighting = state.lightingState;
  const backgroundColor =
    lighting?.output_enabled && lighting.background.enabled
      ? cssEmissiveRgb(
          hsvToRgb({
            h: (lighting.background.hue / 255) * 360,
            s: lighting.background.saturation / 255,
            v: lighting.background.value / 255,
          }),
        )
      : undefined;

  const zoneMembers = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const key of bundle.model.keys) {
      if (key.ledId === undefined) continue;
      for (const z of key.zoneIds) {
        const arr = map.get(z) ?? [];
        arr.push(key.ledId);
        map.set(z, arr);
      }
    }
    return map;
  }, [bundle.model]);

  const selectionSet = useMemo(() => new Set(state.lightingSelection), [state.lightingSelection]);
  const hoverSet = useMemo(
    () => (state.hoverLeds ? new Set(state.hoverLeds) : null),
    [state.hoverLeds],
  );

  const eraseLeds = (ledIds: number[]) => {
    if (!isLayerTarget) {
      dispatch({ type: "erase", ledIds });
      return;
    }
    const masks = ledIds
      .filter((id) => compiledLayerMap[id] !== undefined)
      .map((led_id): LightingOverlayCell => ({ led_id, effect: BLACK_EFFECT, ttl_ms: undefined }));
    const removable = ledIds.filter((id) => compiledLayerMap[id] === undefined);
    if (removable.length > 0) dispatch({ type: "erase", ledIds: removable });
    if (masks.length > 0) dispatch({ type: "paint", cells: masks });
  };

  const stampKey = (key: KeyView) => {
    if (key.ledId === undefined) return;
    if (brush.mode === "erase") {
      eraseLeds([key.ledId]);
    } else {
      dispatch({ type: "paint", cells: [brushCell(brush, key.ledId, !isLayerTarget)] });
    }
  };

  // Legend fallback mirrors keymap mode (enrichment label, else the resolved
  // live binding) so every cap remains identifiable while lighting is previewed.
  // It stays dimmed so the paint color remains the loudest thing.
  const cols = bundle.caps.num_cols;
  const legendFor = (key: KeyView): KeyDecor["glyph"] => {
    const action = effectiveAction(
      state.layers,
      state.activeLayers,
      state.defaultLayer,
      key.row * cols + key.col,
    );
    const text = keyActionGlyph(action).text;
    if (text) return { text, dim: true };
    return key.label ? { text: key.label, dim: true } : undefined;
  };

  const decorFor = (key: KeyView): KeyDecor => {
    if (key.ledId === undefined) {
      return { glyph: legendFor(key), disabled: true };
    }
    const effect = previewEffects.get(key.ledId);
    return {
      fill: effect ? effectColor(effect) : undefined,
      backgroundFill: isLayerTarget ? backgroundColor : undefined,
      fillAnim: effect ? effectAnim(effect) : undefined,
      glyph: legendFor(key),
      staged: staged.has(key.ledId),
      highlight: hoverSet?.has(key.ledId) ?? false,
      inSelection: selectionSet.has(key.ledId),
      popNonce: state.paintTick[key.ledId],
    };
  };

  const paintSelection = () => {
    if (state.lightingSelection.length === 0) return;
    if (brush.mode === "erase") {
      eraseLeds(state.lightingSelection);
    } else {
      dispatch({
        type: "paint",
        cells: state.lightingSelection.map((id) => brushCell(brush, id, !isLayerTarget)),
      });
    }
  };

  const stagedCount = staged.size;
  const visibleCount = previewEffects.size;
  const compiledCount = Object.keys(compiledLayerMap).length;
  const sceneStatus = bundle.sceneStatus;

  const applyLayerDraft = () => {
    if (!isLayerTarget) return;
    const passThrough = state.scenes.filter((cell) => cell.layer !== target);
    const replaced = Object.values(draftMap).map(
      (cell): LightingSceneCell => ({ layer: target, led_id: cell.led_id, effect: cell.effect }),
    );
    io.applyScenes([...passThrough, ...replaced]);
  };

  const clearLayer = () => {
    if (!isLayerTarget) return;
    io.applyScenes(state.scenes.filter((cell) => cell.layer !== target));
  };

  const appliedCount = isLayerTarget
    ? Object.keys(baseMap).length
    : Object.keys(state.applied).length;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:min-h-[380px]">
        {sceneStatus && <LightingTargets />}
        <div className="flex items-center gap-3 px-1">
          <SectionLabel>{isLayerTarget ? `Layer ${target} scene` : "Overlay"}</SectionLabel>
          <span className="tnum text-[12px] text-faint">
            {visibleCount} lit
            {isLayerTarget && compiledCount > 0 ? ` · ${compiledCount} firmware defaults` : ""}
            {` · ${stagedCount} staged`}
          </span>
          {isLayerTarget && sceneStatus && (
            <span className="tnum text-[11.5px] text-faint">
              · {state.scenes.length}/{sceneStatus.capacity} cells used
            </span>
          )}
          {!isLayerTarget && !bundle.overlayReadSupported && (
            <span className="text-[11.5px] text-warn">overlay readback unsupported — started empty</span>
          )}
          <div className="flex-1" />
          {state.lightingState && (
            <span className="tnum text-[11.5px] text-faint">
              output {state.lightingState.output_enabled ? "on" : "off"} · brightness{" "}
              {state.lightingState.output_brightness}
            </span>
          )}
        </div>
        <BoardWell model={bundle.model}>
          <KeyboardCanvas
            model={bundle.model}
            className="h-full w-full"
            decorFor={decorFor}
            onKeyPointerDown={(key, ev) => {
              ev.preventDefault();
              painting.current = true;
              stampKey(key);
            }}
            onKeyPointerEnter={(key) => {
              if (painting.current) stampKey(key);
            }}
          />
        </BoardWell>
      </div>

      <InspectorShell>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          {/* Brush */}
          <div>
            <SectionLabel>Brush</SectionLabel>
            <div className="mt-2 flex gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
              <button
                type="button"
                onClick={() => setBrush({ ...brush, mode: "paint" })}
                className={cx(
                  "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors duration-120",
                  brush.mode === "paint" ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
                )}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: cssRgb(hsvToRgb(brush.hsv)) }}
                />
                Paint
              </button>
              <button
                type="button"
                onClick={() => setBrush({ ...brush, mode: "erase" })}
                className={cx(
                  "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors duration-120",
                  brush.mode === "erase" ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
                )}
              >
                <EraserIcon size={13} />
                Erase
              </button>
            </div>
          </div>

          {brush.mode === "paint" && (
            <>
              <ColorPicker value={brush.hsv} onChange={(hsv) => setBrush({ ...brush, hsv })} />

              <div>
                <SectionLabel>Effect</SectionLabel>
                <div className="mt-2 flex gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
                  {(["Solid", "Blink", "Breathe"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setBrush({ ...brush, kind: k })}
                      className={cx(
                        "flex-1 cursor-pointer rounded-md py-1.5 text-[12px] font-medium transition-colors duration-120",
                        brush.kind === k ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
                      )}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                {brush.kind !== "Solid" && (
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    <NumberField
                      label="Period"
                      unit="ms"
                      min={100}
                      value={brush.periodMs}
                      onChange={(v) => setBrush({ ...brush, periodMs: v })}
                    />
                    {brush.kind === "Blink" && (
                      <NumberField
                        label="Duty"
                        unit="/255"
                        min={0}
                        max={255}
                        value={brush.duty}
                        onChange={(v) => setBrush({ ...brush, duty: v })}
                      />
                    )}
                    {brush.kind === "Breathe" && (
                      <NumberField
                        label="Step"
                        unit="ms"
                        min={1}
                        value={brush.stepMs}
                        onChange={(v) => setBrush({ ...brush, stepMs: v })}
                      />
                    )}
                    <NumberField
                      label="Phase"
                      unit="ms"
                      min={0}
                      value={brush.phaseMs}
                      onChange={(v) => setBrush({ ...brush, phaseMs: v })}
                    />
                  </div>
                )}
              </div>

              {/* Scene cells have no TTL — only the transient overlay expires. */}
              {!isLayerTarget && (
                <div>
                  <label className="flex cursor-pointer items-center justify-between text-[12.5px] text-mute">
                    <span>Auto-expire (TTL)</span>
                    <input
                      type="checkbox"
                      checked={brush.ttlOn}
                      onChange={(e) => setBrush({ ...brush, ttlOn: e.target.checked })}
                      className="accent-(--color-accent)"
                    />
                  </label>
                  {brush.ttlOn && (
                    <div className="mt-1.5">
                      <NumberField
                        label="Lifetime"
                        unit="ms"
                        min={100}
                        value={brush.ttlMs}
                        onChange={(v) => setBrush({ ...brush, ttlMs: v })}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Zones */}
          {bundle.model.zones.length > 0 && (
            <div>
              <SectionLabel>Zones</SectionLabel>
              <div className="mt-2 flex flex-col gap-1">
                {bundle.model.zones.map((zone) => {
                  const members = zoneMembers.get(zone.id) ?? [];
                  const selected =
                    members.length > 0 && members.every((m) => selectionSet.has(m));
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      title={
                        brush.mode === "erase"
                          ? `Stage erasing every key in ${zone.name}`
                          : `Fill ${zone.name} with the current brush (staged)`
                      }
                      onPointerEnter={() => dispatch({ type: "hoverLeds", leds: members })}
                      onPointerLeave={() => dispatch({ type: "hoverLeds", leds: null })}
                      onClick={() => {
                        if (members.length === 0) return;
                        if (brush.mode === "erase") {
                          eraseLeds(members);
                        } else {
                          dispatch({
                            type: "paint",
                            cells: members.map((id) => brushCell(brush, id, !isLayerTarget)),
                          });
                        }
                        dispatch({ type: "lightingSelect", leds: members });
                      }}
                      className={cx(
                        "flex cursor-pointer items-center justify-between rounded-lg border px-3 py-1.5 text-left transition-colors duration-120",
                        selected
                          ? "border-accent-deep bg-accent-dim/30 text-ink"
                          : "border-line bg-raised text-mute hover:border-line-strong hover:text-ink",
                      )}
                    >
                      <span className="text-[12.5px]">{zone.name}</span>
                      <span className="tnum text-[11px] text-faint">{members.length} keys</span>
                    </button>
                  );
                })}
              </div>
              {state.lightingSelection.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="outline" className="flex-1" onClick={paintSelection}>
                    {brush.mode === "erase" ? "Erase" : "Paint"} {state.lightingSelection.length}{" "}
                    selected
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => dispatch({ type: "lightingSelect", leds: [] })}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-line-soft pt-4">
            <FirmwareRulesPanel activeCount={conditionalPreview.size + compiledCount} />
          </div>

          <div className="border-t border-line-soft pt-4">
            <BackgroundPanel />
          </div>

          {state.lightingExtension && (
            <div className="border-t border-line-soft pt-4">
              <EffectsPanel />
            </div>
          )}

          <div className="border-t border-line-soft pt-4">
            <LayerPresets />
          </div>
        </div>

        {/* Apply bar */}
        <div className="mt-4 border-t border-line-soft pt-3">
          {state.lightingError && (
            <div className="mb-2 flex items-center gap-2 text-[12px] text-danger">
              <WarningIcon size={13} />
              <span className="min-w-0 flex-1 truncate" title={state.lightingError}>
                {state.lightingError}
              </span>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Button
              variant="primary"
              disabled={stagedCount === 0 || state.lightingBusy}
              title={
                isLayerTarget
                  ? `Replace Layer ${target}'s stored scene with the canvas`
                  : "Apply the staged overlay to the device"
              }
              onClick={() => (isLayerTarget ? applyLayerDraft() : io.applyOverlay(Object.values(draftMap)))}
            >
              {state.lightingBusy && <SpinnerIcon size={13} />}
              Apply{isLayerTarget ? ` to L${target}` : ""}
              {stagedCount > 0 ? ` · ${stagedCount} staged` : ""}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="flex-1 whitespace-nowrap"
                title={
                  isLayerTarget
                    ? "Throw away staged edits and return to the stored scene"
                    : "Throw away staged edits and return to what's on the device"
                }
                disabled={stagedCount === 0 || state.lightingBusy}
                onClick={() => dispatch({ type: "draftReset" })}
              >
                Discard staged
              </Button>
              <Button
                variant="danger"
                className="flex-1 whitespace-nowrap"
                title={
                  isLayerTarget
                    ? `Remove Layer ${target}'s runtime overrides and reveal its compiled firmware defaults`
                    : "Remove the overlay that is currently applied on the device"
                }
                disabled={state.lightingBusy || appliedCount === 0}
                onClick={() => (isLayerTarget ? clearLayer() : io.clearOverlay())}
              >
                Clear {isLayerTarget ? "overrides" : "applied"}
              </Button>
            </div>
          </div>
        </div>
      </InspectorShell>
    </>
  );
}
