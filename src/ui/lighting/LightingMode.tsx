// Lighting mode: drag-paint overlay cells on the canvas, stage vs apply.

import { useEffect, useMemo, useRef, useState } from "react";
import type { LightingOverlayCell } from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";
import { keyAddressLabel } from "../key-address";
import { lightingKeyLegend } from "./keyLegend";
import { layerName } from "../layer-names";
import {
  activeLightingBase,
  activeLightingDraft,
  stagedBetween,
  useWorkbench,
} from "../state";
import { ColorPicker } from "./ColorPicker";
import { BackgroundPanel } from "./BackgroundPanel";
import { FirmwareRulesPanel } from "./FirmwareRulesPanel";
import { LightingTargets } from "./LightingTargets";
import { ConditionalRulesPanel } from "./ConditionalRulesPanel";
import { StatusPresetsPanel } from "./StatusPresetsPanel";
import { LayerPresets } from "./LayerPresets";
import type { Hsv } from "../color";
import { cssEmissiveRgb, cssRgb, hsvToRgb } from "../color";
import { ApplyBar, Button, ErrorBanner, InspectorShell, SectionLabel, Segmented, cx } from "../kit";
import { EraserIcon, MarqueeIcon, SparkleIcon } from "../icons";
import {
  BLACK_EFFECT,
  composePreviewEffects,
  conditionalPreviewCells,
  indicatorPreviewCell,
  previewActiveLayers,
  sceneTableWithLayer,
  targetPreviewEffects,
} from "./preview";
import { effectAnim, effectColor } from "./decor";
import { EffectShapeEditor, NumberField } from "./EffectEditor";
import { DEFAULT_TIMING, buildEffect } from "./effect";
import type { EffectKind, EffectTiming } from "./effect";

interface Brush {
  mode: "paint" | "erase" | "select";
  hsv: Hsv;
  kind: EffectKind;
  timing: EffectTiming;
  ttlOn: boolean;
  ttlMs: number;
}

const DEFAULT_BRUSH: Brush = {
  mode: "paint",
  hsv: { h: 195, s: 0.85, v: 1 },
  kind: "Solid",
  timing: DEFAULT_TIMING,
  ttlOn: false,
  ttlMs: 5000,
};

function brushCell(brush: Brush, ledId: number, allowTtl: boolean): LightingOverlayCell {
  return {
    led_id: ledId,
    effect: buildEffect(brush.kind, hsvToRgb(brush.hsv), brush.timing),
    ttl_ms: allowTtl && brush.ttlOn ? brush.ttlMs : undefined,
  };
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
  const compiledLayerLeds = useMemo(() => {
    const leds = new Set<number>();
    if (isLayerTarget) {
      for (const cell of state.compiledScenes) if (cell.layer === target) leds.add(cell.led_id);
    }
    return leds;
  }, [isLayerTarget, state.compiledScenes, target]);

  const activeLayers = useMemo(
    () => previewActiveLayers(target, state.activeLayers, state.defaultLayer),
    [target, state.activeLayers, state.defaultLayer],
  );
  const visibleEffects = useMemo(
    () => targetPreviewEffects(target, draftMap, state.compiledScenes),
    [draftMap, state.compiledScenes, target],
  );
  const conditionalPreview = useMemo(
    () =>
      conditionalPreviewCells(state.conditionalScenes, state.runtimeConditionalDraft, {
        activeLayers,
        batteries: new Map([
          [0, state.battery],
          [1, state.peripheralBattery],
        ]),
        outputMode: state.lightingOutputMode?.mode,
        connection: state.connection ?? undefined,
        effectsEnabled: state.lightingExtension
          ? state.lightingExtension.state.value !== 0
          : undefined,
      }),
    [
      activeLayers,
      state.battery,
      state.conditionalScenes,
      state.peripheralBattery,
      state.runtimeConditionalDraft,
      state.lightingOutputMode,
      state.connection,
      state.lightingExtension,
    ],
  );
  const previewEffects = useMemo(
    () =>
      composePreviewEffects(
        visibleEffects,
        conditionalPreview,
        indicatorPreviewCell(state.lightingOutputMode, activeLayers),
      ),
    [activeLayers, conditionalPreview, state.lightingOutputMode, visibleEffects],
  );

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
  const selectedKey = state.lightingSelection.length === 1
    ? bundle.model.keys.find((key) => key.ledId === state.lightingSelection[0])
    : undefined;
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
      .filter((id) => compiledLayerLeds.has(id))
      .map((led_id): LightingOverlayCell => ({ led_id, effect: BLACK_EFFECT, ttl_ms: undefined }));
    const removable = ledIds.filter((id) => !compiledLayerLeds.has(id));
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

  const legendFor = (key: KeyView): KeyDecor["glyph"] => ({
    text: lightingKeyLegend(
      key, state.layers, bundle.caps.num_cols,
      target, state.activeLayers, state.defaultLayer,
    ),
    dim: true,
  });

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
  const compiledCount = compiledLayerLeds.size;
  const sceneStatus = bundle.sceneStatus;

  const applyLayerDraft = () => {
    if (!isLayerTarget) return;
    io.applyScenes(sceneTableWithLayer(state.scenes, target, draftMap));
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
          <SectionLabel>
            {isLayerTarget ? `${layerName(state.layerMetadata, target)} scene` : "Overlay"}
          </SectionLabel>
          <span className="tnum text-[12px] text-faint">
            {visibleCount} lit
            {isLayerTarget && compiledCount > 0 ? ` · ${compiledCount} firmware defaults` : ""}
            {` · ${stagedCount} staged`}
            {selectedKey ? ` · ${keyAddressLabel(selectedKey)} selected` : ""}
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
          <div className="border-b border-line-soft pb-4">
            <BackgroundPanel />
          </div>
          {/* Brush */}
          <div>
            <SectionLabel>Brush</SectionLabel>
            <Segmented
              className="mt-2"
              items={[
                {
                  value: "paint",
                  title: "Drag to paint keys with the brush",
                  label: (
                    <>
                      <span
                        className="size-2.5 rounded-full"
                        style={{ background: cssRgb(hsvToRgb(brush.hsv)) }}
                      />
                      Paint
                    </>
                  ),
                },
                {
                  value: "erase",
                  title: "Drag to clear keys",
                  label: (
                    <>
                      <EraserIcon size={13} />
                      Erase
                    </>
                  ),
                },
                {
                  value: "select",
                  title:
                    "Drag to build a multi-key selection — start on a selected key to deselect",
                  label: (
                    <>
                      <MarqueeIcon size={13} />
                      Select
                    </>
                  ),
                },
              ]}
              value={brush.mode}
              onChange={(mode) => setBrush({ ...brush, mode })}
            />
            {brush.mode === "select" && (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
                Drag across keys to select them, then paint or erase the whole selection at once.
              </p>
            )}
          </div>

          {brush.mode !== "erase" && (
            <>
              <ColorPicker value={brush.hsv} onChange={(hsv) => setBrush({ ...brush, hsv })} />

              <div className="flex flex-col gap-2">
                <SectionLabel>Effect</SectionLabel>
                <EffectShapeEditor
                  kind={brush.kind}
                  timing={brush.timing}
                  onKind={(kind) => setBrush({ ...brush, kind })}
                  onTiming={(timing) => setBrush({ ...brush, timing })}
                />
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
            <>
              <div className="border-t border-line-soft pt-4">
                <StatusPresetsPanel />
              </div>
              <div className="border-t border-line-soft pt-4">
                <ConditionalRulesPanel />
              </div>
            </>
          )}

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
            <ErrorBanner className="mb-2" message={state.lightingError} />
          )}
          <ApplyBar
            busy={state.lightingBusy}
            apply={{
              label: `Apply${isLayerTarget ? ` to ${layerName(state.layerMetadata, target)}` : ""}${
                stagedCount > 0 ? ` · ${stagedCount} staged` : ""
              }`,
              title: isLayerTarget
                ? `Replace the stored scene of ${layerName(state.layerMetadata, target)} (physical layer ${target}) with the canvas`
                : "Apply the staged overlay to the device",
              disabled: stagedCount === 0 || state.lightingBusy,
              onClick: () =>
                isLayerTarget ? applyLayerDraft() : io.applyOverlay(Object.values(draftMap)),
            }}
            discard={{
              label: "Discard staged",
              title: isLayerTarget
                ? "Throw away staged edits and return to the stored scene"
                : "Throw away staged edits and return to what's on the device",
              disabled: stagedCount === 0 || state.lightingBusy,
              onClick: () => dispatch({ type: "draftReset" }),
            }}
            clear={{
              label: `Clear ${isLayerTarget ? "overrides" : "applied"}`,
              title: isLayerTarget
                ? `Remove Layer ${target}'s runtime overrides and reveal its compiled firmware defaults`
                : "Remove the overlay that is currently applied on the device",
              disabled: state.lightingBusy || appliedCount === 0,
              onClick: () => (isLayerTarget ? clearLayer() : io.clearOverlay()),
            }}
          />
        </div>
      </InspectorShell>
    </>
  );
}
