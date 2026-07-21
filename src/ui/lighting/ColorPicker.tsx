// Hand-rolled HSV color picker: SV plane + hue rail + hex field. No deps.

import { useCallback, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Hsv } from "../color";
import { hsvToRgb, rgbToHex, rgbToHsv, hexToRgb, cssRgb } from "../color";
import { TextInput } from "../kit";

function useDragSurface(onPoint: (fx: number, fy: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const handle = useCallback(
    (ev: PointerEvent | ReactPointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fx = Math.min(1, Math.max(0, (ev.clientX - rect.left) / rect.width));
      const fy = Math.min(1, Math.max(0, (ev.clientY - rect.top) / rect.height));
      onPoint(fx, fy);
    },
    [onPoint],
  );
  const onPointerDown = useCallback(
    (ev: ReactPointerEvent<HTMLDivElement>) => {
      ev.currentTarget.setPointerCapture(ev.pointerId);
      handle(ev);
    },
    [handle],
  );
  const onPointerMove = useCallback(
    (ev: ReactPointerEvent<HTMLDivElement>) => {
      if (ev.buttons & 1) handle(ev);
    },
    [handle],
  );
  return { ref, onPointerDown, onPointerMove };
}

const SWATCHES: Hsv[] = [
  { h: 195, s: 0.85, v: 1 },
  { h: 155, s: 0.8, v: 0.95 },
  { h: 85, s: 0.85, v: 0.95 },
  { h: 45, s: 0.9, v: 1 },
  { h: 18, s: 0.9, v: 1 },
  { h: 345, s: 0.8, v: 1 },
  { h: 275, s: 0.7, v: 1 },
  { h: 0, s: 0, v: 1 },
];

export function ColorPicker({ value, onChange }: { value: Hsv; onChange: (v: Hsv) => void }) {
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const rgb = hsvToRgb(value);
  const hueRgb = hsvToRgb({ h: value.h, s: 1, v: 1 });

  const sv = useDragSurface((fx, fy) => {
    setHexDraft(null);
    onChange({ h: value.h, s: fx, v: 1 - fy });
  });
  const hue = useDragSurface((fx) => {
    setHexDraft(null);
    onChange({ ...value, h: fx * 360 });
  });

  return (
    <div className="flex flex-col gap-2.5">
      <div
        {...sv}
        className="relative h-32 w-full cursor-crosshair touch-none rounded-lg border border-line"
        style={{
          background: `linear-gradient(to top, black, transparent), linear-gradient(to right, white, ${cssRgb(hueRgb)})`,
        }}
      >
        <div
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
          style={{
            left: `${value.s * 100}%`,
            top: `${(1 - value.v) * 100}%`,
            background: cssRgb(rgb),
          }}
        />
      </div>
      <div
        {...hue}
        className="relative h-3.5 w-full cursor-ew-resize touch-none rounded-full border border-line"
        style={{
          background:
            "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)",
        }}
      >
        <div
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
          style={{ left: `${(value.h / 360) * 100}%`, background: cssRgb(hueRgb) }}
        />
      </div>
      <div className="flex items-center gap-2">
        <div
          className="size-8 shrink-0 rounded-lg border border-line"
          style={{ background: cssRgb(rgb) }}
        />
        <TextInput
          value={hexDraft ?? rgbToHex(rgb)}
          spellCheck={false}
          className="font-mono uppercase"
          onChange={(e) => {
            setHexDraft(e.target.value);
            const parsed = hexToRgb(e.target.value);
            if (parsed) onChange(rgbToHsv(parsed));
          }}
          onBlur={() => setHexDraft(null)}
        />
      </div>
      <div className="flex gap-1.5">
        {SWATCHES.map((s, i) => (
          <button
            key={i}
            type="button"
            className="size-6 cursor-pointer rounded-md border border-line transition-transform duration-120 hover:scale-110"
            style={{ background: cssRgb(hsvToRgb(s)) }}
            onClick={() => {
              setHexDraft(null);
              onChange(s);
            }}
          />
        ))}
      </div>
    </div>
  );
}
