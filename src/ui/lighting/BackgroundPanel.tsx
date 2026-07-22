// Device-wide lighting state: output enable/brightness and the VIA-style
// background layer (mode + HSV + speed). Staged locally, applied via
// lighting.setState; the device's returned state is the source of truth.

import { useEffect, useRef, useState } from "react";
import type {
  LightingBackgroundMode,
  LightingMutableState,
} from "../../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "../state";
import { cssRgb, hsvToRgb } from "../color";
import { Button, SectionLabel, cx } from "../kit";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const MODES: LightingBackgroundMode[] = ["Solid", "Breathe"];

export function Slider({
  label,
  value,
  onChange,
  disabled,
  track,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Optional CSS gradient for the track. */
  track?: string;
}) {
  return (
    <label
      className={cx(
        "flex items-center gap-2.5 text-[12px] text-mute",
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
          min={0}
          max={255}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cx("relative w-full accent-(--color-accent)", track && "opacity-90")}
        />
      </span>
      <span className="tnum w-8 shrink-0 text-right text-[11.5px] text-faint">{value}</span>
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

  const toMutable = (): LightingMutableState | null =>
    device
      ? {
          output_enabled: device.output_enabled,
          output_brightness: device.output_brightness,
          background: { ...device.background },
        }
      : null;

  const [draft, setDraft] = useState<LightingMutableState | null>(toMutable);

  // Follow device pushes while the draft is clean.
  const deviceRef = useRef(toMutable());
  useEffect(() => {
    const next = toMutable();
    if (same(draft, deviceRef.current)) setDraft(next);
    deviceRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  if (!device || !draft) return null;

  const clean = toMutable();
  const dirty = !same(draft, clean);
  const bg = draft.background;
  const setBg = (patch: Partial<typeof bg>) =>
    setDraft({ ...draft, background: { ...bg, ...patch } });

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionLabel>Output & background</SectionLabel>
        {dirty && <span className="text-[10.5px] text-warn">unapplied</span>}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        <label className="flex cursor-pointer items-center justify-between text-[12.5px] text-mute">
          <span>Lighting output</span>
          <input
            type="checkbox"
            checked={draft.output_enabled}
            onChange={(e) => setDraft({ ...draft, output_enabled: e.target.checked })}
            className="accent-(--color-accent)"
          />
        </label>
        <Slider
          label="Brightness"
          value={draft.output_brightness}
          disabled={!draft.output_enabled}
          onChange={(v) => setDraft({ ...draft, output_brightness: v })}
        />

        <label className="mt-1 flex cursor-pointer items-center justify-between text-[12.5px] text-mute">
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
            <div className="flex gap-0.5 rounded-lg border border-line-soft bg-well p-0.5">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBg({ mode: m })}
                  className={cx(
                    "flex-1 cursor-pointer rounded-md py-1 text-[11.5px] font-medium transition-colors duration-120",
                    bg.mode === m ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-mute",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
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
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="primary"
              className="flex-1 py-1"
              disabled={state.lightingBusy}
              onClick={() => io.setLightingState(JSON.parse(JSON.stringify(draft)))}
            >
              Apply
            </Button>
            <Button variant="ghost" className="py-1" onClick={() => setDraft(clean)}>
              Revert
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
