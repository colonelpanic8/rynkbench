// The fields under a chosen light in the RGB Lighting tab: a colour and its
// effect; for a status light what it shows (a lock, the battery, a Bluetooth
// profile, USB) and that one's own fields. Every colour is the same ColorChoice.

import type { ReactNode } from "react";
import type { LightingEffect, LightingRgb8 } from "../../model/lighting-types";
import type { KeyLight } from "../../model/lighting/key-light";
import { BATTERY_LEVELS, type Lock, type StatusLight } from "../../model/lighting/status-light";
import { STATUS_COLORS } from "../../model/lighting/status-presets";
import { effectColor } from "../lighting/decor";
import type { EffectKind } from "../../model/lighting/effect";
import { ColorChoice } from "../lighting/ColorChoice";
import { LED_PRESETS } from "../../model/lighting/color";
import { cx } from "../kit";
import type { KeyLights } from "./useKeyLights";

const [RED, , , GREEN] = LED_PRESETS;

const EFFECTS: Array<{ id: EffectKind; label: string }> = [
  { id: "Solid", label: "Steady" },
  { id: "Blink", label: "Blink" },
  { id: "Breathe", label: "Breathe" },
];
const SPEEDS = [
  { id: 500, label: "Fast" },
  { id: 1000, label: "Normal" },
  { id: 2000, label: "Slow" },
];
/** Whose battery a light shows: the firmware numbers the halves 0 (left) and 1 (right). */
const HALVES = [
  { id: 0, label: "Left half" },
  { id: 1, label: "Right half" },
];
type Shows = Lock | "battery" | "bluetooth" | "usb";
const SHOWS: Array<{ id: Shows; label: string; wireless?: boolean }> = [
  { id: "caps_lock", label: "Caps Lock" },
  { id: "num_lock", label: "Num Lock" },
  { id: "scroll_lock", label: "Scroll Lock" },
  { id: "battery", label: "Battery" },
  { id: "bluetooth", label: "Bluetooth", wireless: true },
  { id: "usb", label: "USB", wireless: true },
];
const showsOf = (light: StatusLight): Shows => (light.kind === "lock" ? light.lock : light.kind);

/** The status light that shows `shows`, keeping a lock light's colours from one lock to another. */
function showing(light: StatusLight, shows: Shows): StatusLight {
  if (shows === "battery") return { kind: "battery", level: 40, below: RED, above: GREEN };
  if (shows === "bluetooth") return { kind: "bluetooth", profile: 0 };
  if (shows === "usb") return { kind: "usb" };
  return light.kind === "lock" ? { ...light, lock: shows } : { kind: "lock", lock: shows, on: RED, off: null };
}

/** What a Bluetooth profile's or USB's light shows, in the status preset's colours. */
const STATES: Record<"bluetooth" | "usb", Array<{ effect: LightingEffect; label: string }>> = {
  bluetooth: [
    { effect: STATUS_COLORS.empty, label: "Free" },
    { effect: STATUS_COLORS.bonded, label: "Paired" },
    { effect: STATUS_COLORS.advertising, label: "Pairing" },
    { effect: STATUS_COLORS.selected, label: "Chosen" },
    { effect: STATUS_COLORS.active, label: "In use" },
  ],
  usb: [
    { effect: STATUS_COLORS.bonded, label: "Unplugged" },
    { effect: STATUS_COLORS.selected, label: "Plugged in" },
    { effect: STATUS_COLORS.active, label: "In use" },
  ],
};

function States({ of }: { of: "bluetooth" | "usb" }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {STATES[of].map((state) => (
        <span key={state.label} className="flex items-center gap-1.5 text-small text-mute">
          <span className="size-2.5 rounded-sm border border-cap-edge" style={{ background: effectColor(state.effect) }} />
          {state.label}
        </span>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-20 shrink-0 pt-0.5 text-body text-mute">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Segments<T extends string | number>({ options, value, onPick }: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onPick: (id: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border border-line-strong p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onPick(option.id)}
          className={cx(
            "cursor-pointer rounded-md px-3 py-1 text-body font-semibold transition-colors",
            value === option.id ? "bg-hover text-ink" : "text-mute hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function KeyLightFields({ light, lights, onChange }: {
  light: KeyLight;
  lights: KeyLights;
  onChange: (light: KeyLight) => void;
}) {
  const color = (value: LightingRgb8 | null, pick: (next: LightingRgb8 | null) => void, darkTitle?: string) => (
    <ColorChoice
      value={value}
      onPick={pick}
      darkTitle={darkTitle}
      used={lights.yours}
      usage={lights.usage}
      onRecolor={lights.recolor}
    />
  );

  if (light.kind === "color") {
    return (
      <>
        <Field label="Color">{color(light.color, (next) => next && onChange({ ...light, color: next }))}</Field>
        <Field label="Effect">
          <div className="flex flex-wrap items-center gap-2">
            <Segments options={EFFECTS} value={light.effect} onPick={(effect) => onChange({ ...light, effect })} />
            {light.effect !== "Solid" && (
              <Segments
                options={SPEEDS}
                value={light.timing.periodMs}
                onPick={(periodMs) => onChange({ ...light, timing: { ...light.timing, periodMs } })}
              />
            )}
          </div>
        </Field>
      </>
    );
  }
  if (light.kind === "off" || light.kind === "below") return null;
  const shows = SHOWS.filter((option) => !option.wireless || lights.bleProfiles > 0);
  return (
    <>
      <Field label="Shows">
        <Segments options={shows} value={showsOf(light)} onPick={(id) => onChange(showing(light, id))} />
      </Field>
      {light.kind === "lock" && (
        <>
          <Field label="When on">{color(light.on, (next) => next && onChange({ ...light, on: next }))}</Field>
          <Field label="When off">{color(light.off, (off) => onChange({ ...light, off }), "Dark while the lock is off")}</Field>
        </>
      )}
      {light.kind === "battery" && (
        <>
          {lights.split && (
            <Field label="Battery">
              <Segments options={HALVES} value={light.node ?? 0} onPick={(node) => onChange({ ...light, node })} />
            </Field>
          )}
          <Field label="Level">
            <Segments
              options={BATTERY_LEVELS.map((level) => ({ id: level as number, label: `${level}%` }))}
              value={light.level}
              onPick={(level) => onChange({ ...light, level })}
            />
          </Field>
          <Field label="Below">{color(light.below, (next) => next && onChange({ ...light, below: next }))}</Field>
          <Field label="Above">{color(light.above, (next) => next && onChange({ ...light, above: next }))}</Field>
        </>
      )}
      {light.kind === "bluetooth" && (
        <Field label="Profile">
          <div className="flex flex-col gap-2">
            <Segments
              options={Array.from({ length: Math.max(lights.bleProfiles, light.profile + 1) }, (_, slot) => ({ id: slot, label: String(slot + 1) }))}
              value={light.profile}
              onPick={(profile) => onChange({ ...light, profile })}
            />
            <States of="bluetooth" />
          </div>
        </Field>
      )}
      {light.kind === "usb" && (
        <Field label="Colors">
          <States of="usb" />
        </Field>
      )}
    </>
  );
}
