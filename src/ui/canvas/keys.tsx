// Drawing one key, as GLIDE draws it: a cap with a top-to-bottom gradient, a thin
// highlight on top, a shadow along the bottom edge and a soft drop shadow. Cap,
// ring and label are separate passes (see KeyboardCanvas.tsx), each memoized on
// the key's decoration.

import { memo } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, SVGProps } from "react";
import type { Key } from "../../model/keyboard";
import type { KeyView } from "../../model/keyboard";

import { keyHoverTitle } from "../key-address";
import { same } from "../../model/deep-equal";

import type { KeyDecor } from "./decor";
import { legendLayout } from "./legend";
import { FaceRow } from "./FaceRow";
import { CORNER, CAP_INSET, CAP_GRADIENT, CAP_RELIEF, CAP_SHADOW, LED_GLOW, rectAttrs } from "./geometry";

export function CapDefs() {
  return (
    <defs>
      <linearGradient id={CAP_GRADIENT} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: "var(--color-cap)" }} />
        <stop offset="1" style={{ stopColor: "var(--color-cap-low)" }} />
      </linearGradient>
      {/* the highlight along the top edge and the shadow along the bottom */}
      <linearGradient id={CAP_RELIEF} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: "var(--color-cap-sheen)" }} />
        <stop offset="0.035" style={{ stopColor: "var(--color-cap-sheen)" }} stopOpacity="0" />
        <stop offset="0.94" style={{ stopColor: "var(--color-cap-shadow)" }} stopOpacity="0" />
        <stop offset="1" style={{ stopColor: "var(--color-cap-shadow)" }} />
      </linearGradient>
      <filter id={CAP_SHADOW} x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="0.043" stdDeviation="0.036" style={{ floodColor: "var(--color-cap-shadow)" }} />
      </filter>
      {/* the soft edge of a lit LED's spot */}
      <filter id={LED_GLOW} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="0.07" />
      </filter>
    </defs>
  );
}

/* ------------------------------------------------------------------ */
/* Key rendering                                                       */
/* ------------------------------------------------------------------ */
export function KeyRects({
  shape,
  inset = 0,
  dy = 0,
  rx = CORNER,
  ...rest
}: {
  shape: Key;
  inset?: number;
  dy?: number;
  rx?: number;
} & SVGProps<SVGRectElement>) {
  const rects = shape.rect2 ? [shape.rect, shape.rect2] : [shape.rect];
  return (
    <>
      {rects.map((r, i) => (
        <rect key={i} {...rectAttrs(r, inset, dy)} rx={rx} {...rest} />
      ))}
    </>
  );
}

/** KeyDecor is a flat bag of values; comparing every key of both objects keeps
 *  this honest as the type grows, instead of a hand-written field list that
 *  silently stops covering it. */
export function sameDecor(a: KeyDecor, b: KeyDecor): boolean {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof KeyDecor>) {
    if (!same(a[key], b[key])) return false;
  }
  return true;
}

/** Every key is rendered three times per paint (cap, ring, label), and a paint
 *  step rebuilds each decor object. Decor is therefore compared by value and
 *  everything else — including the canvas's own, deliberately stable handlers —
 *  by identity. */
export function samePropsWithDecor<P extends { decor: KeyDecor }>(a: P, b: P): boolean {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof P>) {
    if (key !== "decor" && !Object.is(a[key], b[key])) return false;
  }
  return sameDecor(a.decor, b.decor);
}

/** A handler with a stable identity that always calls the caller's latest one.
 *  Callers pass inline closures over live state; without this the memoized key
 *  components would either re-render every paint or hold a stale closure.
 *  `undefined` is preserved, since it is how the canvas advertises that a
 *  gesture is unsupported. */
export const KeyShape = memo(KeyShapeImpl, samePropsWithDecor);
export const KeyRing = memo(KeyRingImpl, samePropsWithDecor);
export const KeyLabel = memo(KeyLabelImpl, samePropsWithDecor);

function KeyShapeImpl({
  view,
  decor,
  interactive,
  onPointerDown,
  onPointerEnter,
  onContextMenu,
  onHover,
  onKeyboardActivate,
  onFocus,
}: {
  view: KeyView;
  decor: KeyDecor;
  interactive: boolean;
  onPointerDown?: (key: KeyView, ev: ReactPointerEvent) => void;
  onPointerEnter?: (key: KeyView, ev: ReactPointerEvent) => void;
  onContextMenu?: (key: KeyView, ev: ReactMouseEvent) => void;
  onHover?: (key: KeyView | null) => void;
  onKeyboardActivate?: (key: KeyView, ev: ReactKeyboardEvent) => void;
  onFocus?: (key: KeyView) => void;
}) {
  const { shape } = view;
  const deg = shape.r;
  const clickable = interactive && !decor.disabled;
  const keyboardInteractive = clickable && onKeyboardActivate !== undefined;

  const hoverTitle = keyHoverTitle({ ...view, label: decor.glyph?.text ?? view.label });

  const special = decor.special ? `var(--color-special-${decor.special})` : undefined;
  const capFill = decor.lit ? "var(--color-pom)" : (decor.fill ?? decor.backgroundFill ?? special ?? `url(#${CAP_GRADIENT})`);

  const anim = decor.lit ? decor.lit.anim : decor.fillAnim;
  const fillStyle = anim
    ? {
        animationName: anim.name,
        animationDuration: `${Math.max(200, anim.periodMs)}ms`,
        animationDelay: `${anim.delayMs ?? 0}ms`,
        animationTimingFunction:
          anim.name === "led-breathe" ? "ease-in-out" : "steps(1)",
        animationIterationCount: "infinite" as const,
      }
    : undefined;

  const cx0 = shape.rect.x;
  const cy0 = shape.rect.y;

  return (
    <g
      className={`key-group${clickable ? "" : " key-static"}`}
      data-key-row={view.row}
      data-key-col={view.col}
      transform={`rotate(${deg} ${cx0} ${cy0})`}
      opacity={decor.lifted ? 0.35 : decor.disabled ? 0.38 : 1}
      role={keyboardInteractive ? "button" : undefined}
      tabIndex={keyboardInteractive ? 0 : undefined}
      aria-label={decor.ariaLabel ?? hoverTitle}
      aria-keyshortcuts={clickable ? decor.ariaKeyShortcuts : undefined}
      onPointerDown={clickable ? (ev) => onPointerDown?.(view, ev) : undefined}
      onPointerEnter={
        clickable
          ? (ev) => {
              onPointerEnter?.(view, ev);
              onHover?.(view);
            }
          : undefined
      }
      onPointerLeave={clickable ? () => onHover?.(null) : undefined}
      onContextMenu={
        clickable && onContextMenu
          ? (ev) => {
              ev.preventDefault();
              onContextMenu(view, ev);
            }
          : undefined
      }
      onFocus={keyboardInteractive ? () => onFocus?.(view) : undefined}
      onKeyDown={
        keyboardInteractive
          ? (ev) => {
              if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Escape")
                return;
              if (ev.key !== "Escape") ev.preventDefault();
              onKeyboardActivate?.(view, ev);
            }
          : undefined
      }
    >
      <title>{hoverTitle}</title>
      <g
        className="key-lift"
        style={{
          transform: decor.selected ? "translateY(-0.045px)" : undefined,
        }}
      >
        {/* drop shadow */}
        <KeyRects shape={shape} inset={CAP_INSET} fill="var(--color-cap-low)" filter={`url(#${CAP_SHADOW})`} />
        {/* Lighting is deliberately a flat color swatch. Effect timing, when
            present, animates the whole swatch rather than simulating a diode. */}
        <g
          key={decor.popNonce}
          className={decor.fill ? "key-paint-pop" : undefined}
          style={decor.lit ? undefined : fillStyle}
        >
          <KeyRects
            shape={shape}
            inset={CAP_INSET}
            className="key-cap"
            fill={capFill}
          />
        </g>

        {/* The real board's light, as GLIDE draws it: a soft spot at the top of
            the cap where the LED sits under the switch, deepest in the middle,
            and a thin line of light escaping into the gap above the key. */}
        {decor.lit?.led && (
          <g style={fillStyle} filter={`url(#${LED_GLOW})`} pointerEvents="none">
            <ellipse cx={cx0} cy={cy0 - shape.rect.h * 0.24} rx={shape.rect.w * 0.34} ry={shape.rect.h * 0.2} fill={decor.lit.led} opacity={0.75} />
            <ellipse cx={cx0} cy={cy0 - shape.rect.h * 0.26} rx={shape.rect.w * 0.17} ry={shape.rect.h * 0.1} fill={decor.lit.led} />
            <ellipse cx={cx0} cy={cy0 - shape.rect.h / 2 - 0.01} rx={shape.rect.w * 0.3} ry={0.025} fill={decor.lit.led} />
          </g>
        )}
        {/* relief: top highlight, bottom shadow */}
        <KeyRects shape={shape} inset={CAP_INSET} fill={`url(#${CAP_RELIEF})`} style={{ pointerEvents: "none" }} />
        {/* edge */}
        <KeyRects
          shape={shape}
          inset={CAP_INSET}
          fill="none"
          className="key-edge"
          stroke={
            decor.error
              ? "var(--color-danger)"
              : decor.staged
                ? "var(--color-accent-deep)"
                : decor.lit
                  ? "var(--color-pom-edge)"
                  : "var(--color-cap-edge)"
          }
          strokeWidth={decor.staged || decor.error ? 0.05 : 0.016}
          strokeDasharray={
            decor.staged && !decor.error ? "0.1 0.07" : undefined
          }
        />
        {/* pending / error status dot */}
        {(decor.pending || decor.error) && (
          <circle
            cx={shape.rect.x + shape.rect.w / 2 - 0.16}
            cy={shape.rect.y - shape.rect.h / 2 + 0.16}
            r={0.085}
            fill={decor.error ? "var(--color-danger)" : "var(--color-accent)"}
            className={decor.pending ? "animate-pulse" : undefined}
          />
        )}
      </g>
    </g>
  );
}

/**
 * Selection / zone-highlight rings extend outside the cap, so — like labels —
 * they get their own pass above every cap; drawn per-key they'd be painted
 * over by neighbouring caps (thumb fans abut and even overlap).
 */
function KeyRingImpl({ view, decor }: { view: KeyView; decor: KeyDecor }) {
  const { shape } = view;
  if (!decor.selected && !decor.highlight && !decor.inSelection) return null;

  return (
    <g
      transform={`rotate(${shape.r} ${shape.rect.x} ${shape.rect.y})`}
      opacity={decor.lifted ? 0.35 : decor.disabled ? 0.38 : 1}
      style={{ pointerEvents: "none" }}
    >
      <g
        className="key-lift"
        style={{
          transform: decor.selected ? "translateY(-0.045px)" : undefined,
        }}
      >
        {/* zone hover / bulk selection emphasis */}
        {(decor.highlight || decor.inSelection) && (
          <KeyRects
            shape={shape}
            inset={CAP_INSET - 0.035}
            rx={0.13}
            fill="none"
            stroke="var(--color-select)"
            strokeOpacity={decor.inSelection ? 0.9 : 0.5}
            strokeWidth={0.04}
          />
        )}
        {/* selection ring + soft glow */}
        {decor.selected && (
          <>
            <KeyRects
              shape={shape}
              inset={CAP_INSET - 0.09}
              rx={0.16}
              fill="none"
              stroke="var(--color-select)"
              strokeOpacity={0.22}
              strokeWidth={0.13}
            />
            <KeyRects
              shape={shape}
              inset={CAP_INSET - 0.06}
              rx={0.14}
              fill="none"
              stroke="var(--color-select)"
              strokeWidth={0.045}
            />
          </>
        )}
      </g>
    </g>
  );
}

/**
 * Labels are painted in a pass above every cap. Neighbouring keys can abut
 * or overlap (thumb clusters), and a later cap must never cover an earlier
 * key's legend — "Esc" turning into "sc".
 */
/** GLIDE's empty key (&none): a faint slash across the middle of the cap. */
function NoneMark({ view, decor }: { view: KeyView; decor: KeyDecor }) {
  const { x, y, w, r } = { ...view.shape.rect, r: view.shape.r };
  const half = (w - CAP_INSET * 2) * 0.18;
  const ink = decor.special ? `var(--color-special-${decor.special}-ink)` : "var(--color-cap-ink)";
  return (
    <line
      x1={x - half}
      y1={y + half}
      x2={x + half}
      y2={y - half}
      transform={`rotate(${r} ${x} ${y})`}
      stroke={ink}
      strokeWidth={0.021}
      opacity={decor.lifted ? 0.05 : 0.14}
      style={{ pointerEvents: "none" }}
    />
  );
}

function KeyLabelImpl({ view, decor }: { view: KeyView; decor: KeyDecor }) {
  const { shape } = view;
  const glyph = decor.glyph;
  if (glyph?.none) return <NoneMark view={view} decor={decor} />;
  if (!glyph?.text && !glyph?.face) return null;

  const legend = legendLayout(glyph.text, shape.rect.w, { sub: glyph.sub, top: glyph.top });
  const cx = shape.rect.x;
  const cy = shape.rect.y;
  const block = glyph.face ? 0 : (legend.lines.length - 1) * legend.size * 1.1;
  const above = glyph.top ?? glyph.chord;
  // As in GLIDE: a shifted character sits in the upper part of the cap with the
  // legend below it; a hold sits under the legend; otherwise the legend is centred.
  const mainY = above
    ? cy + shape.rect.h * 0.14
    : cy - block / 2 - (glyph.sub ? legend.subSize * 0.7 : 0);
  const specialInk = decor.special && !decor.fill ? `var(--color-special-${decor.special}-ink)` : undefined;
  const plainInk = glyph.layer ? "var(--color-accent)" : glyph.dim ? "var(--color-cap-ink-dim)" : "var(--color-cap-ink)";
  const ink = decor.lit ? "var(--color-pom-ink)" : (specialInk ?? plainInk);
  const quiet = decor.lit ? "var(--color-pom-ink)" : (specialInk ?? "var(--color-mute)");
  const halo = decor.fill && !decor.lit
    ? { stroke: "var(--color-legend-halo)", strokeWidth: 0.04, paintOrder: "stroke fill" as const, strokeLinejoin: "round" as const }
    : {};
  const text = (props: SVGProps<SVGTextElement>) => (
    <text textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-sans)" {...halo} {...props} />
  );

  return (
    <g
      transform={`rotate(${shape.r} ${cx} ${cy})`}
      opacity={decor.lifted ? 0.35 : decor.disabled ? 0.38 : 1}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <g className="key-lift" style={{ transform: decor.selected ? "translateY(-0.045px)" : undefined }}>
        {glyph.top &&
          text({
            x: cx,
            y: cy - shape.rect.h * 0.2,
            fontSize: legend.topSize,
            fontWeight: 600,
            fill: quiet,
            children: glyph.top,
          })}
        {glyph.chord && (
          <FaceRow parts={glyph.chord} x={cx} y={cy - shape.rect.h * 0.2} capWidth={shape.rect.w} tier="small" fill={decor.lit || specialInk ? ink : "var(--color-accent)"} />
        )}
        {glyph.face ? (
          <FaceRow parts={glyph.face} x={cx} y={mainY} capWidth={shape.rect.w} tier="main" fill={ink} />
        ) : (
          text({
            x: cx,
            y: mainY,
            fontSize: legend.size,
            fontWeight: 700,
            fill: ink,
            children: legend.lines.map((line, i) => (
              <tspan key={i} x={cx} dy={i === 0 ? 0 : legend.size * 1.1}>
                {line}
              </tspan>
            )),
          })
        )}
        {glyph.subFace ? (
          <FaceRow
            parts={glyph.subFace}
            x={cx}
            y={mainY + block + legend.size * 0.5 + legend.subSize * 0.75}
            capWidth={shape.rect.w}
            tier="small"
            fill={quiet}
          />
        ) : glyph.sub &&
          text({
            x: cx,
            y: mainY + block + legend.size * 0.5 + legend.subSize * 0.75,
            fontSize: legend.subSize,
            fontWeight: 600,
            fill: quiet,
            children: glyph.sub,
          })}
      </g>
    </g>
  );
}
