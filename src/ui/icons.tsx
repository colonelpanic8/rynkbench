// Inline icon set — 16px grid, stroke-based, inherits currentColor.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...rest }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...rest,
  };
}

export function KeymapIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.6" />
      <path d="M4 6.5h.01M7 6.5h.01M10 6.5h.01M12.2 6.5h.01M4 9.5h1.2M6.8 9.5h2.4M10.8 9.5h1.4" />
    </svg>
  );
}

export function LightingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4" />
      <circle cx="8" cy="8" r="2.3" />
    </svg>
  );
}

export function DeviceIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="4" width="8" height="8" rx="1.4" />
      <path d="M6.5 1.5v2.5M9.5 1.5v2.5M6.5 12v2.5M9.5 12v2.5M1.5 6.5H4M1.5 9.5H4M12 6.5h2.5M12 9.5h2.5" />
    </svg>
  );
}

/** Advanced mode: two keys chorded into one output — a combinator. */
export function CombinatorIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="1.6" y="2" width="5" height="4.4" rx="1.1" />
      <rect x="9.4" y="2" width="5" height="4.4" rx="1.1" />
      <path d="M4.1 6.4v1.4a2.6 2.6 0 0 0 2.6 2.6H8M11.9 6.4v1.4a2.6 2.6 0 0 1-2.6 2.6H8M8 10.4v3.8" />
      <path d="M6.3 12.5L8 14.2l1.7-1.7" />
    </svg>
  );
}

/** Named tap-hold profiles: a key with a small tuning slider. */
export function ProfilesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="1.7" y="2.3" width="7.2" height="6.1" rx="1.3" />
      <path d="M4.1 5.35h2.4M3.1 11.2h9.8M3.1 13.5h9.8" />
      <circle cx="11.7" cy="5.35" r="2.1" />
      <path d="M11.7 3.25v4.2" />
    </svg>
  );
}

export function FileConfigIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 1.7h5l3 3v9.6H4z" />
      <path d="M9 1.7v3h3M6.2 8h3.6M6.2 10.4h3.6" />
    </svg>
  );
}

/** Effects mode: an animated sparkle from the firmware's effect pack. */
export function SparkleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.4 1.8l1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9L2.4 5.8l2.9-1.1z" />
      <path d="M11.6 8.6l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7z" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 4.3h11M6.3 2.2h3.4M4 4.3l.7 9a1.3 1.3 0 0 0 1.3 1.2h4a1.3 1.3 0 0 0 1.3-1.2l.7-9" />
      <path d="M6.5 7v4.4M9.5 7v4.4" />
    </svg>
  );
}

export function BleIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.6 4.9l6.8 6.2L8 14.3V1.7l3.4 3.2-6.8 6.2" />
    </svg>
  );
}

export function UsbIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 1.5v10.8" />
      <path d="M8 1.5l-1.6 2.2h3.2z" fill="currentColor" stroke="none" />
      <circle cx="8" cy="13.6" r="1.1" fill="currentColor" stroke="none" />
      <path d="M4.4 5.2v2.6L8 9.6M11.6 6v2L8 9.8" />
      <circle cx="4.4" cy="4.4" r="1" fill="currentColor" stroke="none" />
      <rect x="10.7" y="4.4" width="1.8" height="1.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BluetoothIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.6 4.9L11.4 11.1 8 14V2l3.4 2.9L4.6 11.1" />
    </svg>
  );
}

export function FlaskIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.2 1.8h3.6M6.8 1.8v4l-3.6 6.2a1.4 1.4 0 0 0 1.2 2.1h7.2a1.4 1.4 0 0 0 1.2-2.1L9.2 5.8v-4" />
      <path d="M5 10.5h6" />
    </svg>
  );
}

export function BoltIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8.8 1.8L3.8 9h3.4l-.9 5.2 5-7.2H7.9z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PowerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 1.8v5.4" />
      <path d="M4.4 4.4a5.1 5.1 0 1 0 7.2 0" />
    </svg>
  );
}

export function UndoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5.5 4.2L2.2 7.1l3.3 2.9" />
      <path d="M2.5 7.1h6.2a4.3 4.3 0 0 1 4.3 4.3v1" />
    </svg>
  );
}

export function RedoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.5 4.2l3.3 2.9-3.3 2.9" />
      <path d="M13.5 7.1H7.3A4.3 4.3 0 0 0 3 11.4v1" />
    </svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2.2L14.5 13.4H1.5z" />
      <path d="M8 6.4v3.2M8 11.7v.01" />
    </svg>
  );
}

export function StarIcon({ filled, ...props }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(props)} fill={filled ? "currentColor" : "none"}>
      <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg {...base(props)} className={`animate-spin ${props.className ?? ""}`}>
      <path d="M8 1.8a6.2 6.2 0 1 1-6.2 6.2" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3.5L10.5 8L6 12.5" />
    </svg>
  );
}

/** Reorder controls: move an ordered-list entry one place up or down. */
export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 12.5v-9M4 7.5L8 3.5l4 4" />
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 3.5v9M4 8.5L8 12.5l4-4" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/** Live mode: an eye — this mode observes rather than edits. */
export function EyeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M1.5 8s2.4-4.4 6.5-4.4S14.5 8 14.5 8s-2.4 4.4-6.5 4.4S1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="1.9" />
    </svg>
  );
}

export function EraserIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.4 2.6l4 4-6.5 6.5H4.2l-2.1-2.1a1.2 1.2 0 0 1 0-1.7z" />
      <path d="M6.4 5.6l4 4M6.9 13.1h7" />
    </svg>
  );
}

/** Dashed marquee — the multi-select brush. */
export function MarqueeIcon(props: IconProps) {
  return (
    <svg {...base(props)} strokeDasharray="2.4 2">
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="1.6" />
    </svg>
  );
}

export function BatteryGlyph({
  level,
  charging,
  size = 22,
  ...rest
}: IconProps & { level: number | null; charging: boolean }) {
  const width = level == null ? 0 : Math.max(0.6, (level / 100) * 8.6);
  const color =
    level == null
      ? "var(--color-faint)"
      : level <= 15 && !charging
        ? "var(--color-danger)"
        : level <= 30 && !charging
          ? "var(--color-warn)"
          : "var(--color-ok)";
  return (
    <svg
      width={size}
      height={size * (12 / 22)}
      viewBox="0 0 22 12"
      fill="none"
      aria-hidden
      {...rest}
    >
      <rect
        x="0.7"
        y="0.7"
        width="17"
        height="10.6"
        rx="2.6"
        stroke="var(--color-line-strong)"
        strokeWidth="1.2"
      />
      <path d="M19.4 4v4a2 2 0 0 0 1.6-2 2 2 0 0 0-1.6-2z" fill="var(--color-line-strong)" />
      {level != null && (
        <rect x="2.7" y="2.7" width={width * 1.5} height="6.6" rx="1.4" fill={color} />
      )}
      {charging && (
        <path
          d="M10.3 1.5L6.8 6.5h2.6L8.7 10.5l3.5-5h-2.6z"
          fill="var(--color-ink)"
          stroke="var(--color-bg)"
          strokeWidth="0.7"
        />
      )}
    </svg>
  );
}

/** The Rynkbench mark: a keycap with a signal dot. */
export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect
        x="2"
        y="5"
        width="24"
        height="19"
        rx="5"
        fill="var(--color-raised)"
        stroke="var(--color-line-strong)"
        strokeWidth="1.2"
      />
      <rect x="6" y="9" width="16" height="11" rx="2.6" fill="var(--color-cap)" />
      <circle cx="14" cy="14.5" r="2.6" fill="var(--color-accent)" />
    </svg>
  );
}
