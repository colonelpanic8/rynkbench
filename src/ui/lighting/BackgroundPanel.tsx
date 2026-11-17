// The keyboard's lights as a whole: on or off, brightness, and the VIA-style
// background under every key's own light (mode, HSV, speed). Staged here and
// applied with io.setLightingState: Apply writes to the keyboard at once, or
// to the draft, as Settings' "RGB Apply" says (ADR 0019). Nothing is written
// while you drag. In Layout properties' RGB Lighting tab.

import { useMemo } from "react";
import type { LightingBackgroundMode } from "../../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "../state";
import { useDeviceDraft } from "../device-draft";
import { cssRgb, hsvToRgb } from "../../model/lighting/color";
import { ApplyBar, Segmented, cx } from "../kit";
import { BigSwitch } from "../properties/BigSwitch";

const MODES: LightingBackgroundMode[] = ["Solid", "Breathe"];

export function Slider({
  label,
  value,
  onChange,
  disabled,
  track,
  min = 0,
  max = 255,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Optional CSS gradient for the track. */
  track?: string;
  /** Range bounds; wire values are 0–255 unless the device says otherwise. */
  min?: number;
  max?: number;
}) {
  return (
    <label
      className={cx(
        "flex items-center gap-2.5 text-body text-mute",
        disabled && "opacity-40",
      )}
    >
      <span className="w-14 shrink-0">{label}</span>
      <span className="relative flex min-w-0 flex-1 items-center">
        {track && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full border border-line"
            style={{ background: track }}
          />
        )}
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cx("relative w-full accent-(--color-accent)", track && "opacity-90")}
        />
      </span>
      <span className="tnum w-8 shrink-0 text-right text-small text-faint">{value}</span>
    </label>
  );
}

/** Wire HSV (0–255 each) → CSS color for previews. */
function wireHsvCss(hue: number, saturation: number, value: number): string {
  return cssRgb(hsvToRgb({ h: (hue / 255) * 360, s: saturation / 255, v: value / 255 }));
}

export function BackgroundPanel() {
  const { state, io } = useWorkbench();
  const device = state.lightingState;

  const mutable = useMemo(
    () =>
      device === null
        ? null
        : {
            output_enabled: device.output_enabled,
            output_brightness: device.output_brightness,
            background: { ...device.background },
          },
    [device],
  );
  const { draft, setDraft, dirty, reset } = useDeviceDraft(mutable);

  if (!device || !draft) return null;

  const bg = draft.background;
  const setBg = (patch: Partial<typeof bg>) =>
    setDraft({ ...draft, background: { ...bg, ...patch } });

  return (
    <div className="flex flex-col gap-2">
      <BigSwitch
        name="Lights"
        state={draft.output_enabled ? "On" : "Off: the keyboard stays dark"}
        on={draft.output_enabled}
        onChange={(output_enabled) => setDraft({ ...draft, output_enabled })}
      />
      {!draft.output_enabled && state.lightingOutputMode?.wake_layers ? (
        <p className="text-small leading-relaxed text-warn">A wake layer still turns the lights on while it is active.</p>
      ) : null}
      <div className="mt-1 flex flex-col gap-2">
        <Slider
          label="Brightness"
          value={draft.output_brightness}
          disabled={!draft.output_enabled}
          onChange={(v) => setDraft({ ...draft, output_brightness: v })}
        />

        <label className="mt-1 flex cursor-pointer items-center justify-between text-body text-mute">
          <span className="flex items-center gap-2">
            Background
            <span
              className="size-3 rounded-full border border-line"
              style={{
                background: bg.enabled
                  ? wireHsvCss(bg.hue, bg.saturation, bg.value)
                  : "transparent",
              }}
            />
          </span>
          <input
            type="checkbox"
            checked={bg.enabled}
            onChange={(e) => setBg({ enabled: e.target.checked })}
            className="accent-(--color-accent)"
          />
        </label>

        {bg.enabled && (
          <>
            <Segmented
              size="sm"
              items={MODES.map((mode) => ({ value: mode, label: mode }))}
              value={bg.mode}
              onChange={(mode) => setBg({ mode })}
            />
            <Slider
              label="Hue"
              value={bg.hue}
              onChange={(hue) => setBg({ hue })}
              track="linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)"
            />
            <Slider
              label="Saturation"
              value={bg.saturation}
              onChange={(saturation) => setBg({ saturation })}
              track={`linear-gradient(to right, white, ${wireHsvCss(bg.hue, 255, 255)})`}
            />
            <Slider
              label="Value"
              value={bg.value}
              onChange={(value) => setBg({ value })}
              track={`linear-gradient(to right, black, ${wireHsvCss(bg.hue, bg.saturation, 255)})`}
            />
            {bg.mode !== "Solid" && (
              <Slider label="Speed" value={bg.speed} onChange={(speed) => setBg({ speed })} />
            )}
          </>
        )}

        {dirty && (
          <ApplyBar
            className="pt-1"
            compact
            apply={{
              label: "Apply",
              disabled: state.lightingBusy,
              onClick: () => io.setLightingState(JSON.parse(JSON.stringify(draft))),
            }}
            discard={{ label: "Revert", onClick: reset }}
          />
        )}
      </div>
    </div>
  );
}
