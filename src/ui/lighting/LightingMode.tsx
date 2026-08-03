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
import { ConditionalRulesPanel } from "./ConditionalRulesPanel";
import { LayerPresets } from "./LayerPresets";
import type { Hsv } from "../color";
import { cssEmissiveRgb, cssRgb, hsvToRgb } from "../color";
import { Button, InspectorShell, SectionLabel, cx } from "../kit";
import { EraserIcon, MarqueeIcon, SparkleIcon, SpinnerIcon, WarningIcon } from "../icons";
import { effectiveAction } from "../live/compositor";
import { targetPreviewEffects } from "./preview";
import { conditionalRuleMatches, describeConditions, firmwarePreviewCells } from "./firmwareRules";
import { effectRgb } from "./effect";
import { NumberField } from "./EffectEditor";

type EffectKind = "Solid" | "Blink" | "Breathe";

interface Brush {
  mode: "paint" | "erase" | "select";
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

function maskHasLayer(mask: number, layer: number): boolean {
  return Math.floor(mask / 2 ** layer) % 2 === 1;
}

function layersInMask(mask: number, count: number): number[] {
  return Array.from({ length: count }, (_, layer) => layer).filter((layer) =>
    maskHasLayer(mask, layer),
  );
}

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
  return cssEmissiveRgb(effectRgb(effect));
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

function FirmwareRulesPanel() {
  const { bundle, state } = useWorkbench();
  const total = state.compiledScenes.length + state.conditionalScenes.length;
  const activeLayers = useMemo(
    () =>
      state.lightingTarget === "overlay"
        ? new Set(state.activeLayers)
        : new Set([state.defaultLayer, state.lightingTarget]),
    [state.activeLayers, state.defaultLayer, state.lightingTarget],
  );
  const batteries = useMemo(
    () => new Map([[0, state.battery], [1, state.peripheralBattery]]),
    [state.battery, state.peripheralBattery],
  );
  const labels = useMemo(() => {
    const result = new Map<number, string>();
    for (const key of bundle.model.keys) {
      if (key.ledId !== undefined) result.set(key.ledId, key.label || `LED ${key.ledId}`);
    }
    return result;
  }, [bundle.model]);
  const groups = useMemo(() => {
    const result = new Map<
      string,
      { description: string; color: string; leds: number[]; active: boolean }
    >();
    for (const cell of state.compiledScenes) {
      const key = JSON.stringify({ layer: cell.layer, effect: cell.effect });
      const group = result.get(key) ?? {
        description: `L${cell.layer} active`,
        color: effectColor(cell.effect),
        leds: [],
        active: activeLayers.has(cell.layer),
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
        active: conditionalRuleMatches(cell, {
          activeLayers,
          batteries,
          outputMode: state.lightingOutputMode?.mode,
        }),
      };
      group.leds.push(cell.led_id);
      result.set(key, group);
    }
    return [...result.entries()].map(([id, group]) => ({ id, ...group }));
  }, [
    activeLayers,
    batteries,
    state.compiledScenes,
    state.conditionalScenes,
    state.lightingOutputMode,
  ]);

  const activeCount = groups.reduce(
    (count, group) => count + (group.active ? group.leds.length : 0),
    0,
  );

  const outputMode = state.lightingOutputMode;
  if (total === 0 && outputMode === null) return null;
  const { output_toggle_user_action: toggleAction, wake_layers: wakeLayers } =
    state.lightingControls;
  const wakeLayerList = layersInMask(wakeLayers, bundle.caps.num_layers);
  return (
    <div>
      <SectionLabel>Configured firmware rules</SectionLabel>
      <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
        Read-only from keyboard.toml · {total} cells · {activeCount} active in this preview
      </p>
      {(toggleAction !== undefined || wakeLayerList.length > 0) && (
        <p className="mt-1 text-[11.5px] leading-relaxed text-mute">
          {toggleAction !== undefined && `User${toggleAction} toggles all lighting`}
          {toggleAction !== undefined && wakeLayerList.length > 0 && " · "}
          {wakeLayerList.length > 0 &&
            `${wakeLayerList.map((layer) => `L${layer}`).join(", ")} ${
              wakeLayerList.length === 1 ? "wakes" : "wake"
            } lighting and presents status`}
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
      {groups.length > 0 && (
        <details className="mt-2 rounded-lg border border-line-soft bg-well px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-mute">
            Show {groups.length} rule groups
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {groups.map((group) => {
              const names = group.leds.map((id) => labels.get(id) ?? `LED ${id}`).join(", ");
              return (
                <div key={group.id} className="flex items-start gap-2 text-[11.5px]">
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full"
                    style={{ background: group.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-mute">{group.description}</span>
                      <span className={group.active ? "text-ok" : "text-faint"}>
                        {group.active ? "active" : "inactive"}
                      </span>
                    </div>
                    <div className="truncate text-faint" title={names}>
                      {names}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

export function LightingMode() {
  const { bundle, state, dispatch, io } = useWorkbench();
  const [brush, setBrush] = useState<Brush>(DEFAULT_BRUSH);
  const painting = useRef(false);
  const strokeMode = useRef<"add" | "remove">("add");

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
  // Compiled rules first, then the staged runtime table: composition follows
  // table order and later cells win, which is exactly how the firmware lets
  // runtime cells override the compiled ones on slots they share. Previewing
  // the *draft* makes the rules editor WYSIWYG before Apply.
  const conditionalPreview = useMemo(() => {
    const activeLayers =
      target === "overlay"
        ? new Set(state.activeLayers)
        : new Set([state.defaultLayer, target]);
    return firmwarePreviewCells(
      [],
      [...state.conditionalScenes, ...state.runtimeConditionalDraft],
      {
        activeLayers,
        batteries: new Map([
          [0, state.battery],
          [1, state.peripheralBattery],
        ]),
        outputMode: state.lightingOutputMode?.mode,
      },
    );
  }, [
    state.activeLayers,
    state.battery,
    state.conditionalScenes,
    state.defaultLayer,
    state.peripheralBattery,
    state.runtimeConditionalDraft,
    state.lightingOutputMode,
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
      [...activeLayers].some((layer) => maskHasLayer(outputMode.wake_layers, layer))
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
    if (brush.mode === "select") {
      // A stroke keeps whichever polarity its first key implied, so dragging
      // back over already-visited keys can't flip them off again.
      dispatch({ type: "lightingSelect", leds: [key.ledId], mode: strokeMode.current });
    } else if (brush.mode === "erase") {
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
              if (brush.mode === "select")
                strokeMode.current =
                  key.ledId !== undefined && selectionSet.has(key.ledId) ? "remove" : "add";
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
              {(
                [
                  { mode: "paint", label: "Paint", title: "Drag to paint keys with the brush" },
                  { mode: "erase", label: "Erase", title: "Drag to clear keys" },
                  {
                    mode: "select",
                    label: "Select",
                    title:
                      "Drag to build a multi-key selection — start on a selected key to deselect",
                  },
                ] as const
              ).map(({ mode, label, title }) => (
                <button
                  key={mode}
                  type="button"
                  title={title}
                  onClick={() => setBrush({ ...brush, mode })}
                  className={cx(
                    "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-colors duration-120",
                    brush.mode === mode ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
                  )}
                >
                  {mode === "paint" && (
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: cssRgb(hsvToRgb(brush.hsv)) }}
                    />
                  )}
                  {mode === "erase" && <EraserIcon size={13} />}
                  {mode === "select" && <MarqueeIcon size={13} />}
                  {label}
                </button>
              ))}
            </div>
            {brush.mode === "select" && (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
                Drag across keys to select them, then paint or erase the whole selection at once.
              </p>
            )}
          </div>

          {brush.mode !== "erase" && (
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
                        brush.mode === "select"
                          ? `${selected ? "Remove" : "Add"} ${zone.name} ${
                              selected ? "from" : "to"
                            } the selection`
                          : brush.mode === "erase"
                            ? `Stage erasing every key in ${zone.name}`
                            : `Fill ${zone.name} with the current brush (staged)`
                      }
                      onPointerEnter={() => dispatch({ type: "hoverLeds", leds: members })}
                      onPointerLeave={() => dispatch({ type: "hoverLeds", leds: null })}
                      onClick={() => {
                        if (members.length === 0) return;
                        // The select brush accumulates zones instead of
                        // painting, so several can be combined before a stamp.
                        if (brush.mode === "select") {
                          dispatch({
                            type: "lightingSelect",
                            leds: members,
                            mode: selected ? "remove" : "add",
                          });
                          return;
                        }
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
            </div>
          )}

          {state.lightingSelection.length > 0 && (
            <div>
              <SectionLabel>Selection</SectionLabel>
              <p className="mt-1 text-[11.5px] text-faint">
                {state.lightingSelection.length} key
                {state.lightingSelection.length === 1 ? "" : "s"} selected
              </p>
              <div className="mt-2 flex items-center gap-2">
                {brush.mode === "select" ? (
                  <>
                    <Button variant="outline" className="flex-1" onClick={() => paintSelection()}>
                      Paint
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => eraseLeds(state.lightingSelection)}
                    >
                      Erase
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" className="flex-1" onClick={() => paintSelection()}>
                    {brush.mode === "erase" ? "Erase" : "Paint"} {state.lightingSelection.length}{" "}
                    selected
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => dispatch({ type: "lightingSelect", leds: [] })}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          <div className="border-t border-line-soft pt-4">
            <FirmwareRulesPanel />
          </div>

          {bundle.runtimeConditionalStatus && (
            <div className="border-t border-line-soft pt-4">
              <ConditionalRulesPanel />
            </div>
          )}

          <div className="border-t border-line-soft pt-4">
            <BackgroundPanel />
          </div>

          {/* The effect pack is configured in its own mode; this is only a
              signpost so the lighting inspector still says where it went. */}
          {state.lightingExtension && (
            <div className="border-t border-line-soft pt-4">
              <SectionLabel>Firmware effect extension</SectionLabel>
              <p className="mt-1 text-[11.5px] leading-relaxed text-faint">
                {bundle.extensionEffectNames[state.lightingExtension.state.effect] ??
                  `Effect ${state.lightingExtension.state.effect}`}{" "}
                is running.
              </p>
              <Button
                variant="outline"
                className="mt-2 w-full"
                onClick={() => dispatch({ type: "mode", mode: "effects" })}
              >
                <SparkleIcon size={13} />
                Open Effects
              </Button>
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
