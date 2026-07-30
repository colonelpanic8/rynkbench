// Shared effect controls: the numeric field the lighting panels use, and a
// complete LightingEffect editor (kind + color + timing) for surfaces that edit
// a stored effect rather than a paint brush.

import type { LightingEffect } from "../../vendor/rynk-wasm/rynk_wasm";
import { TextInput, cx } from "../kit";
import { rgbToHsv, hsvToRgb } from "../color";
import { ColorPicker } from "./ColorPicker";
import type { EffectKind } from "./effect";
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
  const retime = (patch: Partial<typeof timing>) =>
    onChange(buildEffect(kind, color, { ...timing, ...patch }));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(buildEffect(k, color, timing))}
            className={cx(
              "flex-1 cursor-pointer rounded-md py-1 text-[11.5px] font-medium transition-colors duration-120",
              kind === k ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <ColorPicker
        value={rgbToHsv(color)}
        onChange={(hsv) => onChange(buildEffect(kind, hsvToRgb(hsv), timing))}
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
    </div>
  );
}
