// Shared effect controls: the numeric field the lighting panels use, the
// timing fields of a blink or a breathe, and a complete LightingEffect editor
// (kind + color + timing) for surfaces that edit a stored effect.

import { useEffect, useRef, useState } from "react";
import type { LightingEffect } from "../../model/lighting-types";
import { Segmented, TextInput } from "../kit";
import { rgbToHsv, hsvToRgb } from "../../model/lighting/color";
import { ColorPicker } from "./ColorPicker";
import type { EffectKind, EffectTiming } from "../../model/lighting/effect";
import { blinkDuty, buildEffect, effectKind, effectRgb, effectTiming, timingBounds } from "../../model/lighting/effect";
import { numberEntry, type NumberEntryOptions } from "./numberEntry";

export function NumberField({
  label,
  value,
  onChange,
  onInput,
  unit,
  min,
  max,
  clamp,
}: {
  label: string;
  value: number;
  /** With `clamp`: commits a settled number; false, or a promise of false, when it was refused. */
  onChange: (v: number) => unknown;
  /** With `clamp`: each whole number within min and max as it is typed. */
  onInput?: (v: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  /** Reports only whole numbers within min and max, and commits once the
   *  number settles (numberEntry.ts): anything else is held while it is typed,
   *  and brought within them on Enter or on leaving the field. */
  clamp?: boolean;
}) {
  // What is in the field while it is typed, or after a refused commit.
  const [typed, setTyped] = useState<string | null>(null);
  const latest = useRef<NumberEntryOptions>({ min, max, value, onInput, commit: onChange, show: setTyped });
  latest.current = { min, max, value, onInput, commit: onChange, show: setTyped };
  const [entry] = useState(() => numberEntry(() => latest.current));
  useEffect(() => () => entry.dispose(), [entry]);
  return (
    <label className="flex items-center justify-between gap-2 text-body text-mute">
      {label}
      <span className="flex items-center gap-1">
        <TextInput
          type="number"
          value={typed ?? value}
          min={min}
          max={max}
          onChange={(e) => (clamp ? entry.type(e.target.value) : onChange(Number(e.target.value)))}
          onBlur={() => clamp && void entry.settle("leave")}
          onKeyDown={(e) => {
            if (clamp && e.key === "Enter") void entry.settle("enter");
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
 *  (a blink's duty, a breathe's step) and its phase, each kept to what the
 *  firmware takes (see NumberField's `clamp`). */
export function EffectTimingFields({
  kind,
  timing,
  onTiming,
  onTyping,
}: {
  kind: EffectKind;
  timing: EffectTiming;
  /** The timing with a field's number changed, once the number settles. */
  onTiming: (timing: EffectTiming) => unknown;
  /** The timing as each number is typed. */
  onTyping?: (timing: EffectTiming) => void;
}) {
  if (kind === "Solid") return null;
  // A blink stored above 100 percent shows, and is written on a change, as the 100 it runs at.
  const shown = { ...timing, duty: blinkDuty(timing.duty) };
  const bounds = timingBounds(kind, shown);
  const field = (name: keyof EffectTiming, label: string, unit: string) => (
    <NumberField
      label={label}
      unit={unit}
      min={bounds[name].min}
      max={bounds[name].max}
      clamp
      value={shown[name]}
      onChange={(value) => onTiming({ ...shown, [name]: value })}
      onInput={onTyping && ((value) => onTyping({ ...shown, [name]: value }))}
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
