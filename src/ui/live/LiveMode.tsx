// Live mode: a read-only observatory. It never writes to the session — it
// renders what the device should currently be showing (composited lighting +
// effective key bindings) from the last-known state, and a layer-stack view
// that stays honest about what the wire actually reports (only the effective
// layer).

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

/** The active-layer stack, ordered by index (top = highest, floor = default). */
function LayerStack() {
  const { bundle, state } = useWorkbench();
  const numLayers = bundle.caps.num_layers;
  const effective = state.currentLayer;
  const floor = state.defaultLayer;

  const litLayers = useMemo(() => {
    const set = new Set<number>();
    for (const cell of state.scenes) set.add(cell.layer);
    return set;
  }, [state.scenes]);

  const rows = Array.from({ length: numLayers }, (_, i) => numLayers - 1 - i);

  return (
    <Panel className="p-4">
      <SectionLabel>Layer stack</SectionLabel>
      <div className="mt-2.5 flex flex-col gap-1">
        {rows.map((i) => {
          const isEffective = i === effective;
          const isFloor = i === floor;
          const between = i > floor && i < effective;
          const below = i < floor;

          let note: string;
          let title: string | undefined;
          if (isEffective && isFloor) {
            note = "effective · default floor";
            title = "Topmost active layer and the default floor — the whole stack is one layer.";
          } else if (isEffective) {
            note = "effective · top of stack";
            title = "The topmost active layer — the only layer the firmware reports.";
          } else if (isFloor) {
            note = "default · floor";
            title = "The default layer — always active, and the floor key resolution stops at.";
          } else if (between) {
            note = "not reported";
            title =
              "Between the default and effective layers — the firmware reports only the effective layer, so we can't tell if this one is active.";
          } else if (below) {
            note = "inert";
            title = "Below the default layer — never consulted by key resolution.";
          } else {
            note = "inactive";
            title = "Above the effective layer — not active.";
          }

          const tone = isEffective
            ? "border-accent bg-accent-dim/30 text-accent"
            : isFloor
              ? "border-ok/50 bg-well text-mute"
              : between
                ? "border-dashed border-line text-faint"
                : below
                  ? "border-line bg-transparent text-faint opacity-40"
                  : "border-line bg-raised text-mute";

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
                  title="Has stored scene lighting"
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
        Transparent keys fall through toward the default layer.
      </p>
    </Panel>
  );
}

export function LiveMode() {
  const { bundle, state } = useWorkbench();
  const cols = bundle.caps.num_cols;
  const effective = state.currentLayer;
  const floor = state.defaultLayer;
  const lighting = state.lightingState;
  const outputOn = lighting?.output_enabled ?? false;
  const bg = lighting?.background;
  const bgOn = outputOn && (bg?.enabled ?? false);
  const bgColor = bg && bgOn ? wireHsvCss(bg.hue, bg.saturation, bg.value) : null;

  const lit = useMemo(
    () => compositeScenes(state.scenes, state.applied, effective, floor, state.scenePolicy),
    [state.scenes, state.applied, effective, floor, state.scenePolicy],
  );

  const bindingGlyph = (key: KeyView): KeyDecor["glyph"] => {
    const action = effectiveAction(state.layers, effective, floor, key.row * cols + key.col);
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
      fill: cell ? effectColor(cell.effect) : undefined,
      fillAnim: cell ? effectAnim(cell.effect) : undefined,
      glyph: cell ? undefined : bindingGlyph(key),
    };
  };

  const stackApprox = state.scenePolicy === "ActiveStack";

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-3 max-lg:min-h-[380px]">
        <div className="flex items-center gap-3 px-1">
          <SectionLabel>Live view</SectionLabel>
          <span
            className="animate-pop"
            title="Effective layer — the topmost active layer. Reported by the firmware."
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-deep/60 bg-accent-dim/30 px-2 py-0.5 text-[10.5px] font-medium text-accent">
              <span className="size-1.5 rounded-full bg-accent" />
              Effective: L{effective}
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
              {bgOn && " A background glow underlies the whole board."}
              {stackApprox &&
                " Under Stack active layers the keyboard composites the full active-layer stack on-device; this preview shows only the default and effective layers (the firmware reports only the effective one)."}
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
                  {state.scenePolicy === "ActiveStack"
                    ? "Stack active layers"
                    : state.scenePolicy === "EffectiveOnly"
                      ? "Effective only"
                      : "—"}
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
