// Shared effect controls: the numeric field the lighting panels use, and a
// complete LightingEffect editor (kind + color + timing) for surfaces that edit
// a stored effect rather than a paint brush.

import type { LightingEffect } from "../../vendor/rynk-wasm/rynk_wasm";
import { Segmented, TextInput } from "../kit";
import { rgbToHsv, hsvToRgb } from "../color";
import { ColorPicker } from "./ColorPicker";
import type { EffectKind, EffectTiming } from "./effect";
import { buildEffect, effectKind, effectRgb, effectTiming } from "./effect";

export function NumberField({
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

const KINDS: EffectKind[] = ["Solid", "Blink", "Breathe"];

/** The kind + timing half of an effect, shared by the stored-effect editor and
 *  by the paint brushes, which carry a color of their own. */
export function EffectShapeEditor({
  kind,
  timing,
  onKind,
  onTiming,
}: {
  kind: EffectKind;
  timing: EffectTiming;
  onKind: (kind: EffectKind) => void;
  onTiming: (timing: EffectTiming) => void;
}) {
  const retime = (patch: Partial<EffectTiming>) => onTiming({ ...timing, ...patch });
  return (
    <>
      <Segmented
        items={KINDS.map((k) => ({ value: k, label: k }))}
        value={kind}
        onChange={onKind}
        size="sm"
      />
      {kind !== "Solid" && (
        <div className="flex flex-col gap-1.5">
          <NumberField
            label="Period"
            unit="ms"
            min={100}
            value={timing.periodMs}
            onChange={(periodMs) => retime({ periodMs })}
          />
          {kind === "Blink" && (
            <NumberField
              label="Duty"
              unit="/255"
              min={0}
              max={255}
              value={timing.duty}
              onChange={(duty) => retime({ duty })}
            />
          )}
          {kind === "Breathe" && (
            <NumberField
              label="Step"
              unit="ms"
              min={1}
              value={timing.stepMs}
              onChange={(stepMs) => retime({ stepMs })}
            />
          )}
          <NumberField
            label="Phase"
            unit="ms"
            min={0}
            value={timing.phaseMs}
            onChange={(phaseMs) => retime({ phaseMs })}
          />
        </div>
      )}
    </>
  );
}

/** Edit one stored effect in place. Switching kinds keeps the color and the
 *  timing the previous kind carried, so the choice is reversible. */
export function EffectEditor({
  value,
  onChange,
}: {
  value: LightingEffect;
  onChange: (effect: LightingEffect) => void;
}) {
  const kind = effectKind(value);
  const color = effectRgb(value);
  const timing = effectTiming(value);

  return (
    <div className="flex flex-col gap-2.5">
      <ColorPicker
        value={rgbToHsv(color)}
        onChange={(hsv) => onChange(buildEffect(kind, hsvToRgb(hsv), timing))}
      />
      <EffectShapeEditor
        kind={kind}
        timing={timing}
        onKind={(next) => onChange(buildEffect(next, color, timing))}
        onTiming={(next) => onChange(buildEffect(kind, color, next))}
      />
    </div>
  );
}
