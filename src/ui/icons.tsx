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

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 4l8 8M12 4l-8 8" />
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
