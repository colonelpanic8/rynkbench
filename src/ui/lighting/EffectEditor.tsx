// Shared effect controls: the numeric field the lighting panels use, the
// timing fields of a blink or a breathe, and a complete LightingEffect editor
// (kind + color + timing) for surfaces that edit a stored effect.

import { useState } from "react";
import type { LightingEffect } from "../../model/lighting-types";
import { Segmented, TextInput } from "../kit";
import { rgbToHsv, hsvToRgb } from "../../model/lighting/color";
import { ColorPicker } from "./ColorPicker";
import type { EffectKind, EffectTiming } from "../../model/lighting/effect";
import { buildEffect, effectKind, effectRgb, effectTiming, timingBounds, typedWithin } from "../../model/lighting/effect";

export function NumberField({
  label,
  value,
  onChange,
  unit,
  min,
  max,
  clamp,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  /** Reports only whole numbers within min and max: anything else is held
   *  while it is typed, and brought within them on Enter or on leaving the field. */
  clamp?: boolean;
}) {
  // What is in the field while it has the focus.
  const [typed, setTyped] = useState<string | null>(null);
  const type = (text: string) => {
    if (!clamp) return onChange(Number(text));
    setTyped(text);
    const n = Number(text);
    if (typedWithin(text, min, max) === n && n !== value) onChange(n);
  };
  /** Brings what was typed within the bounds; nothing usable leaves the value as it was. */
  const settle = (text: string | null): number => {
    const settled = text === null ? null : typedWithin(text, min, max);
    if (settled === null) return value;
    if (settled !== value) onChange(settled);
    return settled;
  };
  return (
    <label className="flex items-center justify-between gap-2 text-body text-mute">
      {label}
      <span className="flex items-center gap-1">
        <TextInput
          type="number"
          value={typed ?? value}
          min={min}
          max={max}
          onChange={(e) => type(e.target.value)}
          onBlur={() => {
            settle(typed);
            setTyped(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typed !== null) setTyped(String(settle(typed)));
          }}
          className="w-[74px] py-1 text-right"
        />
        {unit && (
          <span className="min-w-5 shrink-0 whitespace-nowrap text-small text-faint">{unit}</span>
        )}
      </span>
    </label>
  );
}

const KINDS: EffectKind[] = ["Solid", "Blink", "Breathe"];

/** The numbers behind a blink or a breathe: its period, what the kind adds
 *  (a blink's duty, a breathe's step) and its phase. */
export function EffectTimingFields({
  kind,
  timing,
  onTiming,
  clamp,
}: {
  kind: EffectKind;
  timing: EffectTiming;
  onTiming: (timing: EffectTiming) => void;
  /** Keeps every field to what the firmware takes (see NumberField). */
  clamp?: boolean;
}) {
  if (kind === "Solid") return null;
  const bounds = timingBounds(kind, timing);
  const field = (name: keyof EffectTiming, label: string, unit: string) => (
    <NumberField
      label={label}
      unit={unit}
      min={bounds[name].min}
      max={bounds[name].max}
      clamp={clamp}
      value={timing[name]}
      onChange={(value) => onTiming({ ...timing, [name]: value })}
    />
  );
  return (
    <>
      {field("periodMs", "Period", "ms")}
      {kind === "Blink" ? field("duty", "Duty", "%") : field("stepMs", "Step", "ms")}
      {field("phaseMs", "Phase", "ms")}
    </>
  );
}

/** The kind + timing half of an effect. */
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
          <EffectTimingFields kind={kind} timing={timing} onTiming={onTiming} />
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
