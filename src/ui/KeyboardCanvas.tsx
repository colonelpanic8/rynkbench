// The shared SVG keyboard canvas — rendered purely from a KeyboardModel.
// All geometry is in key-units; the viewBox does the scaling, so the canvas
// is resize-aware for free. Rotation follows the wire semantics (rmk-config
// layout.rs walk()): rect.x/y is the final visual center and r is clockwise
// degrees about the main rect's center, matching the model's keyCorners.
//
// Rendering is layered board-wide, not per-key: cluster backplates, then cap
// shapes, then a dedicated label pass. Keys on real boards may abut or even
// overlap slightly (Glove80 thumb clusters), so labels must never be painted
// over by a neighbouring cap drawn later.

import { useId, useMemo } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode, SVGProps } from "react";
import type { Encoder, Key, Rect } from "../vendor/rynk-wasm/rynk_wasm";
import type { KeyboardModel, KeyView } from "../model/keyboard";
import type { KeyGlyph } from "./labels";
import { cx } from "./kit";

export interface KeyDecor {
  glyph?: KeyGlyph;
  /** LED color (CSS) — renders the lit window + dot. */
  fill?: string;
  fillAnim?: { name: "led-blink" | "led-breathe"; periodMs: number; delayMs?: number };
  staged?: boolean;
  selected?: boolean;
  pending?: boolean;
  error?: boolean;
  /** Zone-hover emphasis. */
  highlight?: boolean;
  /** Member of the current bulk selection. */
  inSelection?: boolean;
  /** Not paintable / not interactive right now. */
  disabled?: boolean;
  /** Bump to replay the paint pop animation. */
  popNonce?: number;
}

export interface EncoderDecor {
  selected?: boolean;
  pending?: boolean;
  error?: boolean;
  label?: string;
}

export interface KeyboardCanvasProps {
  model: KeyboardModel;
  decorFor: (key: KeyView) => KeyDecor;
  encoderDecorFor?: (enc: Encoder) => EncoderDecor;
  onKeyPointerDown?: (key: KeyView, ev: ReactPointerEvent) => void;
  onKeyPointerEnter?: (key: KeyView, ev: ReactPointerEvent) => void;
  onEncoderPointerDown?: (enc: Encoder) => void;
  onBackgroundPointerDown?: () => void;
  interactive?: boolean;
  className?: string;
}

const CORNER = 0.09;
const CAP_DROP = 0.05; // how far the cap "side" extends below the cap
const CAP_INSET = 0.03; // gap between abutting caps: drawn cap shrinks inside its 1u cell
const VIEW_PAD = 0.42;

/** Board viewBox in key-units (keys + encoders + breathing room). */
export function boardViewBox(model: KeyboardModel): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let { minX, minY, maxX, maxY } = model.bounds;
  for (const enc of model.encoders) {
    minX = Math.min(minX, enc.x - 0.55);
    minY = Math.min(minY, enc.y - 0.55);
    maxX = Math.max(maxX, enc.x + 0.55);
    maxY = Math.max(maxY, enc.y + 0.55);
  }
  return {
    x: minX - VIEW_PAD,
    y: minY - VIEW_PAD,
    w: maxX - minX + VIEW_PAD * 2,
    h: maxY - minY + VIEW_PAD * 2 + CAP_DROP,
  };
}

/* ------------------------------------------------------------------ */
/* Fit-to-container well                                               */
/* ------------------------------------------------------------------ */

/** Largest comfortable key pitch, in CSS px per key-unit. */
const MAX_PITCH = 64;
const WELL_PAD = 20; // matches p-5

/**
 * The recessed board well, sized to hug the board: fills the available
 * space (both axes considered) but never scales keys past MAX_PITCH, so
 * large boards shrink to fit and small boards don't balloon.
 */
export function BoardWell({
  model,
  className,
  children,
}: {
  model: KeyboardModel;
  className?: string;
  children: ReactNode;
}) {
  const vb = boardViewBox(model);
  const ratio = vb.w / vb.h;
  const capPx = Math.round(vb.w * MAX_PITCH) + WELL_PAD * 2;
  return (
    <div
      className={cx("relative min-h-0 w-full flex-1", className)}
      style={{ containerType: "size" }}
    >
      <div
        className="canvas-well absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line-soft p-5"
        style={{
          width: `min(100cqw, ${capPx}px, 100cqh * ${ratio.toFixed(4)})`,
          aspectRatio: `${vb.w.toFixed(3)} / ${vb.h.toFixed(3)}`,
          maxWidth: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cluster backplates                                                  */
/* ------------------------------------------------------------------ */

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function rotatedCorners(
  rect: Rect,
  deg: number,
  inflate: number,
  pivotX = rect.x,
  pivotY = rect.y,
): Array<[number, number]> {
  const rad = deg * (Math.PI / 180);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const out: Array<[number, number]> = [];
  for (const [sx, sy] of [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ] as const) {
    const dx = rect.x + sx * (rect.w + inflate * 2) - pivotX;
    const dy = rect.y + sy * (rect.h + inflate * 2) - pivotY;
    out.push([pivotX + dx * cos - dy * sin, pivotY + dx * sin + dy * cos]);
  }
  return out;
}

function shapeCorners(shape: Key, inflate: number): Array<[number, number]> {
  const rects = shape.rect2 ? [shape.rect, shape.rect2] : [shape.rect];
  return rects.flatMap((r) => rotatedCorners(r, shape.r, inflate, shape.rect.x, shape.rect.y));
}

function boxOf(corners: Array<[number, number]>): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function boxesTouch(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
}

/** Andrew's monotone-chain convex hull. */
function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length <= 2) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Group keys (and encoders) into spatially connected clusters and return a
 * convex-hull outline per cluster. This is deliberately board-agnostic: split
 * halves — including their thumb clusters — read as one plate because they
 * are physically contiguous, while the gap between halves keeps them apart.
 */
function computePlates(model: KeyboardModel): string[] {
  // Connect anything whose inflated bounding boxes touch (gaps < ~0.9u).
  const CONNECT_INFLATE = 0.45;
  const HULL_INFLATE = 0.18;

  interface Item {
    box: Box;
    hullCorners: Array<[number, number]>;
  }
  const items: Item[] = [];
  for (const key of model.keys) {
    items.push({
      box: boxOf(shapeCorners(key.shape, CONNECT_INFLATE)),
      hullCorners: shapeCorners(key.shape, HULL_INFLATE),
    });
  }
  for (const enc of model.encoders) {
    const rect: Rect = { x: enc.x, y: enc.y, w: 0.95, h: 0.95 };
    items.push({
      box: boxOf(rotatedCorners(rect, 0, CONNECT_INFLATE)),
      hullCorners: rotatedCorners(rect, 0, HULL_INFLATE),
    });
  }
  if (items.length === 0) return [];

  // Union-find over touching boxes.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (boxesTouch(items[i].box, items[j].box)) {
        parent[find(i)] = find(j);
      }
    }
  }

  const clusters = new Map<number, Array<[number, number]>>();
  items.forEach((item, i) => {
    const root = find(i);
    const arr = clusters.get(root) ?? [];
    arr.push(...item.hullCorners);
    clusters.set(root, arr);
  });

  return [...clusters.values()].map((corners) =>
    convexHull(corners)
      .map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`)
      .join(" "),
  );
}

/* ------------------------------------------------------------------ */
/* Key rendering                                                       */
/* ------------------------------------------------------------------ */

function rectAttrs(rect: Rect, inset = 0, dy = 0) {
  return {
    x: rect.x - rect.w / 2 + inset,
    y: rect.y - rect.h / 2 + inset + dy,
    width: rect.w - inset * 2,
    height: rect.h - inset * 2,
  };
}

function KeyRects({
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

/** Fit label size to the available cap width — labels must never clip. */
function fitText(text: string, capWidth: number, max: number): number {
  const len = Math.max(1, [...text].length);
  return Math.min(max, ((capWidth - 0.16) / len) * 1.5);
}

function KeyShape({
  view,
  decor,
  interactive,
  breatheBadgeId,
  onPointerDown,
  onPointerEnter,
}: {
  view: KeyView;
  decor: KeyDecor;
  interactive: boolean;
  breatheBadgeId: string;
  onPointerDown?: (key: KeyView, ev: ReactPointerEvent) => void;
  onPointerEnter?: (key: KeyView, ev: ReactPointerEvent) => void;
}) {
  const { shape } = view;
  const deg = shape.r;
  const clickable = interactive && !decor.disabled;

  const capFill = decor.fill
    ? "color-mix(in oklab, var(--color-cap) 88%, black)"
    : "var(--color-cap)";

  const anim = decor.fillAnim;
  const windowStyle = anim
    ? {
        animationName: anim.name,
        animationDuration: `${Math.max(200, anim.periodMs)}ms`,
        animationDelay: `${anim.delayMs ?? 0}ms`,
        animationTimingFunction: anim.name === "led-breathe" ? "ease-in-out" : "steps(1)",
        animationIterationCount: "infinite" as const,
      }
    : undefined;

  const cx0 = shape.rect.x;
  const cy0 = shape.rect.y;
  const badgeX = shape.rect.x + shape.rect.w / 2 - 0.16;
  const badgeY = shape.rect.y - shape.rect.h / 2 + 0.16;

  return (
    <g
      className={`key-group${clickable ? "" : " key-static"}`}
      transform={`rotate(${deg} ${cx0} ${cy0})`}
      opacity={decor.disabled ? 0.38 : 1}
      onPointerDown={clickable ? (ev) => onPointerDown?.(view, ev) : undefined}
      onPointerEnter={clickable ? (ev) => onPointerEnter?.(view, ev) : undefined}
    >
      <g
        className="key-lift"
        style={{ transform: decor.selected ? "translateY(-0.045px)" : undefined }}
      >
        {/* cap side (depth) */}
        <KeyRects shape={shape} inset={CAP_INSET} dy={CAP_DROP} fill="var(--color-cap-side)" />
        {/* outline pass (drawn under the fill pass so unions stay clean) */}
        <KeyRects
          shape={shape}
          inset={CAP_INSET}
          fill="none"
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
        {/* cap fill */}
        <KeyRects shape={shape} inset={CAP_INSET} className="key-cap" fill={capFill} />

        {/* LED window */}
        {decor.fill && (
          <g key={decor.popNonce} className="key-paint-pop">
            <g style={windowStyle}>
              <KeyRects shape={shape} inset={0.1} rx={0.07} fill={decor.fill} opacity={0.28} />
              <circle cx={cx0} cy={cy0} r={0.2} fill={decor.fill} opacity={0.35} />
              <circle cx={cx0} cy={cy0} r={0.1} fill={decor.fill} />
            </g>
          </g>
        )}

        {/* static effect badge — the animation may be at its "off" phase, so
            non-solid effects also get a persistent corner cue */}
        {decor.fill && anim && (
          <g style={{ pointerEvents: "none" }}>
            {anim.name === "led-blink" ? (
              <circle
                cx={badgeX}
                cy={badgeY}
                r={0.07}
                fill={decor.fill}
                stroke="rgb(0 0 0 / 0.55)"
                strokeWidth={0.022}
              />
            ) : (
              <circle
                cx={badgeX}
                cy={badgeY}
                r={0.12}
                fill={`url(#${breatheBadgeId})`}
                style={{ color: decor.fill }}
              />
            )}
          </g>
        )}

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
function KeyRing({ view, decor }: { view: KeyView; decor: KeyDecor }) {
  const { shape } = view;
  if (!decor.selected && !decor.highlight && !decor.inSelection) return null;

  return (
    <g
      transform={`rotate(${shape.r} ${shape.rect.x} ${shape.rect.y})`}
      opacity={decor.disabled ? 0.38 : 1}
      style={{ pointerEvents: "none" }}
    >
      <g
        className="key-lift"
        style={{ transform: decor.selected ? "translateY(-0.045px)" : undefined }}
      >
        {/* zone hover / bulk selection emphasis */}
        {(decor.highlight || decor.inSelection) && (
          <KeyRects
            shape={shape}
            inset={CAP_INSET - 0.035}
            rx={0.13}
            fill="none"
            stroke="var(--color-accent)"
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
              stroke="var(--color-accent)"
              strokeOpacity={0.22}
              strokeWidth={0.13}
            />
            <KeyRects
              shape={shape}
              inset={CAP_INSET - 0.06}
              rx={0.14}
              fill="none"
              stroke="var(--color-accent)"
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
function KeyLabel({ view, decor }: { view: KeyView; decor: KeyDecor }) {
  const { shape } = view;
  const glyph = decor.glyph;
  if (!glyph?.text || decor.fill) return null;

  const deg = shape.r;
  const primarySize = fitText(glyph.text, shape.rect.w, glyph.sub ? 0.26 : 0.3);
  const subSize = glyph.sub ? fitText(glyph.sub, shape.rect.w, 0.185) : 0;
  const cxc = shape.rect.x;
  const cyc = shape.rect.y;

  return (
    <g
      transform={`rotate(${deg} ${cxc} ${cyc})`}
      opacity={decor.disabled ? 0.38 : 1}
      style={{ pointerEvents: "none", userSelect: "none" }}
    >
      <g
        className="key-lift"
        style={{ transform: decor.selected ? "translateY(-0.045px)" : undefined }}
      >
        <text
          x={cxc}
          y={glyph.sub ? cyc - 0.07 : cyc}
          fontSize={primarySize}
          textAnchor="middle"
          dominantBaseline="central"
          fill={glyph.dim ? "var(--color-cap-ink-dim)" : "var(--color-cap-ink)"}
          fontFamily="var(--font-sans)"
          fontWeight={500}
        >
          {glyph.text}
        </text>
        {glyph.sub && (
          <text
            x={cxc}
            y={cyc + 0.22}
            fontSize={subSize}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--color-mute)"
            fontFamily="var(--font-sans)"
          >
            {glyph.sub}
          </text>
        )}
      </g>
    </g>
  );
}

function EncoderShape({
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
      <circle cx={enc.x} cy={enc.y + CAP_DROP} r={0.42} fill="var(--color-cap-side)" />
      <circle
        cx={enc.x}
        cy={enc.y}
        r={0.42}
        fill="var(--color-cap)"
        stroke="var(--color-cap-edge)"
        strokeWidth={0.028}
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

export function KeyboardCanvas({
  model,
  decorFor,
  encoderDecorFor,
  onKeyPointerDown,
  onKeyPointerEnter,
  onEncoderPointerDown,
  onBackgroundPointerDown,
  interactive = true,
  className,
}: KeyboardCanvasProps) {
  const vb = boardViewBox(model);
  const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
  const plates = useMemo(() => computePlates(model), [model]);
  const badgeId = useId();
  const breatheBadgeId = `breathe-badge-${badgeId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const decorated = model.keys.map((key) => ({ key, decor: decorFor(key) }));

  return (
    <svg
      viewBox={viewBox}
      className={className}
      style={{ touchAction: "none", display: "block" }}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={(ev) => {
        if (ev.target === ev.currentTarget) onBackgroundPointerDown?.();
      }}
    >
      <defs>
        <radialGradient id={breatheBadgeId}>
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.95} />
          <stop offset="55%" stopColor="currentColor" stopOpacity={0.55} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </radialGradient>
      </defs>

      {/* faint backplates: each physically connected cluster (a split half
          together with its thumbs) reads as one piece, statically */}
      <g aria-hidden style={{ pointerEvents: "none" }}>
        {plates.map((points, i) => (
          <polygon
            key={i}
            points={points}
            fill="var(--color-plate)"
            stroke="var(--color-plate)"
            strokeWidth={0.5}
            strokeLinejoin="round"
          />
        ))}
      </g>

      {decorated.map(({ key, decor }) => (
        <KeyShape
          key={`${key.row},${key.col}`}
          view={key}
          decor={decor}
          interactive={interactive}
          breatheBadgeId={breatheBadgeId}
          onPointerDown={onKeyPointerDown}
          onPointerEnter={onKeyPointerEnter}
        />
      ))}

      {/* ring pass — selection/highlight rings above every cap, under labels */}
      {decorated.map(({ key, decor }) => (
        <KeyRing key={`ring:${key.row},${key.col}`} view={key} decor={decor} />
      ))}

      {/* label pass — always above every cap */}
      {decorated.map(({ key, decor }) => (
        <KeyLabel key={`l${key.row},${key.col}`} view={key} decor={decor} />
      ))}

      {model.encoders.map((enc) => (
        <EncoderShape
          key={enc.id}
          enc={enc}
          decor={encoderDecorFor?.(enc) ?? {}}
          interactive={interactive}
          onPointerDown={onEncoderPointerDown}
        />
      ))}
    </svg>
  );
}
