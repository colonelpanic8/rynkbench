// Drawing encoders and trackpads on the canvas.

import type { Encoder } from "../../model/keyboard";
import type { PointingDeviceView } from "../../model/keyboard";

import type { EncoderDecor, PointingDeviceDecor } from "./decor";
import { CAP_DROP } from "./geometry";

export function EncoderShape({
  enc,
  decor,
  interactive,
  onPointerDown,
}: {
  enc: Encoder;
  decor: EncoderDecor;
  interactive: boolean;
  onPointerDown?: (enc: Encoder) => void;
}) {
  const ticks = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);
  return (
    <g
      className={`key-group${interactive ? "" : " key-static"}`}
      onPointerDown={interactive ? () => onPointerDown?.(enc) : undefined}
    >
      <circle
        cx={enc.x}
        cy={enc.y + CAP_DROP}
        r={0.42}
        fill="var(--color-cap-side)"
      />
      <circle
        cx={enc.x}
        cy={enc.y}
        r={0.42}
        fill="var(--color-cap)"
        stroke={
          decor.error
            ? "var(--color-danger)"
            : decor.staged
              ? "var(--color-accent-deep)"
              : "var(--color-cap-edge)"
        }
        strokeWidth={decor.staged || decor.error ? 0.05 : 0.028}
        strokeDasharray={decor.staged && !decor.error ? "0.1 0.07" : undefined}
      />
      {ticks.map((t) => (
        <line
          key={t}
          x1={enc.x + 0.31 * Math.cos((t * Math.PI) / 180)}
          y1={enc.y + 0.31 * Math.sin((t * Math.PI) / 180)}
          x2={enc.x + 0.38 * Math.cos((t * Math.PI) / 180)}
          y2={enc.y + 0.38 * Math.sin((t * Math.PI) / 180)}
          stroke="var(--color-cap-edge)"
          strokeWidth={0.022}
        />
      ))}
      <text
        x={enc.x}
        y={enc.y}
        fontSize={0.2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-mute)"
        style={{ userSelect: "none", pointerEvents: "none" }}
        fontFamily="var(--font-mono)"
      >
        {decor.label ?? `E${enc.id}`}
      </text>
      {decor.selected && (
        <>
          <circle
            cx={enc.x}
            cy={enc.y}
            r={0.52}
            fill="none"
            stroke="var(--color-accent)"
            strokeOpacity={0.22}
            strokeWidth={0.13}
          />
          <circle
            cx={enc.x}
            cy={enc.y}
            r={0.49}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={0.045}
          />
        </>
      )}
      {(decor.pending || decor.error) && (
        <circle
          cx={enc.x + 0.3}
          cy={enc.y - 0.3}
          r={0.085}
          fill={decor.error ? "var(--color-danger)" : "var(--color-accent)"}
          className={decor.pending ? "animate-pulse" : undefined}
        />
      )}
    </g>
  );
}

export function PointingDeviceShape({
  device,
  decor,
  interactive,
  onActivate,
}: {
  device: PointingDeviceView;
  decor: PointingDeviceDecor;
  interactive: boolean;
  onActivate?: (device: PointingDeviceView) => void;
}) {
  const activate = () => onActivate?.(device);
  return (
    <g
      data-pointing-device-id={device.id}
      className={`key-group${interactive ? "" : " key-static"}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `Edit ${device.label}` : device.label}
      onClick={interactive ? activate : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              activate();
            }
          : undefined
      }
    >
      <circle
        cx={device.x}
        cy={device.y + CAP_DROP}
        r={device.radius}
        fill="var(--color-cap-side)"
      />
      <circle
        cx={device.x}
        cy={device.y}
        r={device.radius}
        fill="var(--color-well)"
        stroke={decor.selected || decor.staged ? "var(--color-accent)" : "var(--color-cap-edge)"}
        strokeWidth={decor.selected || decor.staged ? 0.055 : 0.035}
        strokeDasharray={decor.staged && !decor.selected ? "0.12 0.08" : undefined}
      />
      {[0.72, 0.46].map((scale) => (
        <circle
          key={scale}
          cx={device.x}
          cy={device.y}
          r={device.radius * scale}
          fill="none"
          stroke="var(--color-line-soft)"
          strokeWidth={0.025}
          pointerEvents="none"
        />
      ))}
      <text
        x={device.x}
        y={device.y - 0.14}
        fontSize={0.145}
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--color-faint)"
        fontFamily="var(--font-sans)"
        fontWeight={600}
        letterSpacing={0.025}
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {device.label.toUpperCase()}
      </text>
      {decor.mode && (
        <text
          x={device.x}
          y={device.y + 0.17}
          fontSize={0.23}
          textAnchor="middle"
          dominantBaseline="central"
          fill={decor.selected ? "var(--color-accent)" : "var(--color-mute)"}
          fontFamily="var(--font-mono)"
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {decor.mode}
        </text>
      )}
      {decor.selected && (
        <circle
          cx={device.x}
          cy={device.y}
          r={device.radius + 0.1}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={0.045}
        />
      )}
    </g>
  );
}
