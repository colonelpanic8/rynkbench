// Live mode: a read-only observatory. It never writes to the session — it
// renders what the device should currently be showing (composited lighting +
// effective key bindings) from the last-known state, and a layer-stack view
// backed by the firmware's complete active-layer snapshot.

import { useMemo } from "react";
import type { LightingEffect } from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { BoardWell, KeyboardCanvas } from "../KeyboardCanvas";
import type { KeyDecor } from "../KeyboardCanvas";
import { keyActionGlyph } from "../labels";
import { useWorkbench } from "../state";
import { cssRgb, hsvToRgb } from "../color";
import { InspectorShell, Panel, Row, SectionLabel, cx } from "../kit";
import { KIND_LABEL } from "../TopBar";
import { compositeScenes, effectiveAction } from "./compositor";

function effectColor(effect: LightingEffect): string {
  if ("Solid" in effect) return cssRgb(effect.Solid.color);
  if ("Blink" in effect) return cssRgb(effect.Blink.color);
  return cssRgb(effect.Breathe.color);
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

/** Wire HSV (0–255 each) → CSS color. */
function wireHsvCss(hue: number, saturation: number, value: number): string {
  return cssRgb(hsvToRgb({ h: (hue / 255) * 360, s: saturation / 255, v: value / 255 }));
}

function IndicatorRow() {
  const { state } = useWorkbench();
  const ind = state.ledIndicator;
  if (!ind) return null;
  const items: Array<{ label: string; on: boolean }> = [
    { label: "Num", on: ind.num_lock },
    { label: "Caps", on: ind.caps_lock },
    { label: "Scroll", on: ind.scroll_lock },
  ];
  return (
    <span className="flex items-center gap-1.5" title="Host lock indicators, live from the device">
      {items.map((i) => (
        <span
          key={i.label}
          className={cx(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
            i.on ? "border-accent-deep/60 bg-accent-dim/30 text-accent" : "border-line text-faint",
          )}
        >
          <span className={cx("size-1.5 rounded-full", i.on ? "bg-accent" : "bg-line-strong")} />
          {i.label}
        </span>
      ))}
    </span>
  );
}

/** Every layer's authoritative active/default status, ordered by index. */
function LayerStack() {
  const { bundle, state } = useWorkbench();
  const numLayers = bundle.caps.num_layers;
  const activeLayers = new Set(state.activeLayers);

  const litLayers = useMemo(() => {
    const set = new Set<number>();
    for (const cell of state.compiledScenes) set.add(cell.layer);
    for (const cell of state.scenes) set.add(cell.layer);
    return set;
  }, [state.compiledScenes, state.scenes]);

  const rows = Array.from({ length: numLayers }, (_, i) => numLayers - 1 - i);

  return (
    <Panel className="p-4">
      <SectionLabel>Layer stack</SectionLabel>
      <div className="mt-2.5 flex flex-col gap-1">
        {rows.map((i) => {
          const active = activeLayers.has(i);
          const isDefault = i === state.defaultLayer;
          const known = state.layerStateComplete || active || isDefault;

          let note: string;
          let title: string | undefined;
          if (active && isDefault) {
            note = "active · default";
            title = "Active and configured as the default layer.";
          } else if (active) {
            note = "active";
            title = "Active and participating in key and lighting resolution.";
          } else if (known) {
            note = "inactive";
            title = "Reported inactive by the firmware.";
          } else {
            note = "unknown";
            title = "Legacy firmware did not report the complete active-layer bitmap.";
          }

          const tone = active
            ? "border-accent bg-accent-dim/30 text-accent"
            : known
              ? "border-line bg-raised text-mute"
              : "border-dashed border-line text-faint";

          return (
            <div
              key={i}
              title={title}
              className={cx(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 transition-colors duration-120",
                tone,
              )}
            >
              <span className="tnum font-mono text-[12px]">L{i}</span>
              {litLayers.has(i) && (
                <span
                  title="Has compiled or stored scene lighting"
                  className="size-1.5 rounded-full bg-accent/70"
                />
              )}
              <div className="flex-1" />
              <span className="text-[10.5px] uppercase tracking-wide">{note}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2.5 text-[10.5px] leading-relaxed text-faint">
        Precedence is by layer index — highest active layer wins; activation order never matters.
        Transparent keys fall through the remaining active layers.
      </p>
    </Panel>
  );
}

export function LiveMode() {
  const { bundle, state } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const lighting = state.lightingState;
  const outputOn = lighting?.output_enabled ?? false;
  const bg = lighting?.background;
  const bgOn = outputOn && (bg?.enabled ?? false);
  const bgColor = bg && bgOn ? wireHsvCss(bg.hue, bg.saturation, bg.value) : null;

  const lit = useMemo(
    () =>
      compositeScenes(
        state.compiledScenes,
        state.scenes,
        state.applied,
        state.activeLayers,
        state.defaultLayer,
        state.compiledScenePolicy,
        state.scenePolicy,
      ),
    [
      state.compiledScenes,
      state.scenes,
      state.applied,
      state.activeLayers,
      state.defaultLayer,
      state.compiledScenePolicy,
      state.scenePolicy,
    ],
  );

  const bindingGlyph = (key: KeyView): KeyDecor["glyph"] => {
    const action = effectiveAction(
      state.layers,
      state.activeLayers,
      state.defaultLayer,
      key.row * cols + key.col,
    );
    const glyph = keyActionGlyph(action);
    if (!glyph.text && key.label) return { text: key.label, dim: true };
    return glyph.text ? { ...glyph, dim: true } : undefined;
  };

  const decorFor = (key: KeyView): KeyDecor => {
    if (key.ledId === undefined) {
      return { glyph: bindingGlyph(key), disabled: true };
    }
    const cell = outputOn ? lit.get(key.ledId) : undefined;
    return {
      fill: cell ? effectColor(cell.effect) : (bgColor ?? undefined),
      fillAnim: cell ? effectAnim(cell.effect) : undefined,
      glyph: cell ? undefined : bindingGlyph(key),
    };
  };

  const activeLabel = [...new Set([state.defaultLayer, ...state.activeLayers])]
    .sort((a, b) => a - b)
    .join(" | ");

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:min-h-[380px]">
        <div className="flex items-center gap-3 px-1">
          <SectionLabel>Live view</SectionLabel>
          <span
            className="animate-pop"
            title={`Active layers: ${activeLabel}. Default layer: ${state.defaultLayer}.`}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-deep/60 bg-accent-dim/30 px-2 py-0.5 text-[10.5px] font-medium text-accent">
              <span className="size-1.5 rounded-full bg-accent" />
              {activeLabel}
            </span>
          </span>
          <div className="flex-1" />
          <span className="text-[11px] text-faint">computed from last-known state</span>
        </div>
        <BoardWell model={bundle.model}>
          {bgColor && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{ background: bgColor, opacity: 0.14 }}
            />
          )}
          <KeyboardCanvas
            model={bundle.model}
            interactive={false}
            className="relative h-full w-full"
            decorFor={decorFor}
          />
        </BoardWell>
        <div className="px-1 text-[11px] leading-relaxed text-faint">
          {outputOn ? (
            <>
              Composited preview: scene lighting and the overlay over each key's effective binding.
              {bgOn && " The firmware background fills keys without a higher-priority source."}
            </>
          ) : (
            "Lighting output is off — the device is dark. Key labels show each key's effective binding."
          )}
        </div>
      </div>

      <InspectorShell>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <LayerStack />

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Lighting output</SectionLabel>
              <span
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-medium",
                  outputOn ? "border-ok/50 text-ok" : "border-line text-faint",
                )}
              >
                <span className={cx("size-1.5 rounded-full", outputOn ? "bg-ok" : "bg-line-strong")} />
                {outputOn ? "on" : "off"}
              </span>
            </div>
            {lighting ? (
              <div className="mt-2 flex flex-col divide-y divide-line-soft">
                <Row label="Brightness">{lighting.output_brightness}</Row>
                <Row label="Background">
                  {bg?.enabled ? (
                    <span className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full border border-line"
                        style={{ background: wireHsvCss(bg.hue, bg.saturation, bg.value) }}
                      />
                      {bg.mode}
                    </span>
                  ) : (
                    "off"
                  )}
                </Row>
                <Row label="Compositing">
                  <span className="text-right">
                    {state.compiledScenePolicy && (
                      <span className="block">
                        Firmware: {state.compiledScenePolicy === "ActiveStack" ? "stack" : "effective"}
                      </span>
                    )}
                    {state.scenePolicy && (
                      <span className="block">
                        Overrides: {state.scenePolicy === "ActiveStack" ? "stack" : "effective"}
                      </span>
                    )}
                    {!state.compiledScenePolicy && !state.scenePolicy && "—"}
                  </span>
                </Row>
              </div>
            ) : (
              <div className="mt-2 text-[12.5px] text-faint">Lighting state unavailable.</div>
            )}
          </Panel>

          <Panel className="p-4">
            <div className="flex items-center justify-between">
              <SectionLabel>Device</SectionLabel>
              <IndicatorRow />
            </div>
            <div className="mt-2 flex flex-col divide-y divide-line-soft">
              <Row label="Product">{bundle.info.product_name}</Row>
              <Row label="Serial" mono>
                {bundle.info.serial_number || "—"}
              </Row>
              <Row label="Transport">{KIND_LABEL[bundle.session.kind] ?? bundle.session.kind}</Row>
              {state.connection && <Row label="Preferred">{state.connection.preferred}</Row>}
            </div>
          </Panel>
        </div>
      </InspectorShell>
    </>
  );
}
