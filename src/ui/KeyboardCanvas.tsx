// The shared SVG keyboard canvas — rendered purely from a KeyboardModel.
// All geometry is in key-units; the viewBox does the scaling, so the canvas
// is resize-aware for free. Rotation follows the wire semantics (rmk-config
// layout.rs walk()): rect.x/y is the final visual center and r is clockwise
// degrees about the main rect's center, matching the model's keyCorners.
//
// Keys are drawn as GLIDE draws them: a cap with a top-to-bottom gradient, a
// thin highlight on top, a shadow along the bottom edge and a soft drop shadow,
// on a dot-grid canvas. Rendering is layered board-wide, not per-key: cap
// shapes, then rings, then a dedicated label pass. Keys on real boards may abut or even
// overlap slightly (Glove80 thumb clusters), so labels must never be painted
// over by a neighbouring cap drawn later.

import { useCallback, useEffect, useMemo, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { Encoder } from "../model/keyboard";
import type { KeyboardModel, KeyView, PointingDeviceView } from "../model/keyboard";

import type { KeyDecor, EncoderDecor, PointingDeviceDecor } from "./canvas/decor";
import { boardViewBox } from "./canvas/geometry";
import { CapDefs, KeyShape, KeyRing, KeyLabel } from "./canvas/keys";
import { EncoderShape, PointingDeviceShape } from "./canvas/devices";

// The canvas's parts live in ./canvas; screens import them from here.
export { BoardWell } from "./canvas/BoardWell";
export { boardViewBox } from "./canvas/geometry";
export type { KeyDecor, EncoderDecor, PointingDeviceDecor } from "./canvas/decor";

export interface KeyboardCanvasProps {
  model: KeyboardModel;
  decorFor: (key: KeyView) => KeyDecor;
  encoderDecorFor?: (enc: Encoder) => EncoderDecor;
  pointingDeviceDecorFor?: (device: PointingDeviceView) => PointingDeviceDecor;
  onKeyPointerDown?: (key: KeyView, ev: ReactPointerEvent) => void;
  onKeyPointerEnter?: (key: KeyView, ev: ReactPointerEvent) => void;
  /** Right-click (or long press) on a key: its quick menu. */
  onKeyContextMenu?: (key: KeyView, ev: ReactMouseEvent) => void;
  /** The key under the pointer, or null when it leaves the keys. */
  onKeyHover?: (key: KeyView | null) => void;
  onKeyKeyboardActivate?: (key: KeyView, ev: ReactKeyboardEvent) => void;
  onKeyFocus?: (key: KeyView) => void;
  /** Pointer drag gesture. Callers define the operation (the keymap swaps). */
  onKeyDrop?: (source: KeyView, destination: KeyView) => void;
  onKeyDragChange?: (
    source: KeyView | null,
    destination: KeyView | null,
  ) => void;
  keyDraggable?: (key: KeyView) => boolean;
  onEncoderPointerDown?: (enc: Encoder) => void;
  onPointingDeviceActivate?: (device: PointingDeviceView) => void;
  onBackgroundPointerDown?: () => void;
  interactive?: boolean;
  className?: string;
}

export function useLatestHandler<A extends unknown[], R>(
  handler: ((...args: A) => R) | undefined,
): ((...args: A) => R | undefined) | undefined {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  const stable = useCallback((...args: A) => latest.current?.(...args), []);
  return handler === undefined ? undefined : stable;
}

export function KeyboardCanvas({
  model,
  decorFor,
  encoderDecorFor,
  pointingDeviceDecorFor,
  onKeyPointerDown,
  onKeyPointerEnter,
  onKeyContextMenu,
  onKeyHover,
  onKeyKeyboardActivate,
  onKeyFocus,
  onKeyDrop,
  onKeyDragChange,
  keyDraggable,
  onEncoderPointerDown,
  onPointingDeviceActivate,
  onBackgroundPointerDown,
  interactive = true,
  className,
}: KeyboardCanvasProps) {
  const vb = boardViewBox(model);
  const viewBox = `${vb.x} ${vb.y} ${vb.w} ${vb.h}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    source: KeyView;
    destination: KeyView | null;
    started: boolean;
  } | null>(null);

  const keyAtPoint = (clientX: number, clientY: number): KeyView | null => {
    const element = document
      .elementFromPoint(clientX, clientY)
      ?.closest<SVGGElement>("[data-key-row][data-key-col]");
    if (!element || !svgRef.current?.contains(element)) return null;
    const row = Number(element.dataset.keyRow);
    const col = Number(element.dataset.keyCol);
    return model.keys.find((key) => key.row === row && key.col === col) ?? null;
  };

  const finishDrag = (pointerId: number, cancelled: boolean) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== pointerId) return;
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(pointerId)) {
      svgRef.current.releasePointerCapture(pointerId);
    }
    if (!cancelled && drag.started && drag.destination) {
      onKeyDrop?.(drag.source, drag.destination);
    }
    onKeyDragChange?.(null, null);
  };

  const keyPointerDown = useLatestHandler(onKeyPointerDown);
  const keyPointerEnter = useLatestHandler(onKeyPointerEnter);
  const keyContextMenu = useLatestHandler(onKeyContextMenu);
  const keyHover = useLatestHandler(onKeyHover);
  const keyKeyboardActivate = useLatestHandler(onKeyKeyboardActivate);
  const keyFocus = useLatestHandler(onKeyFocus);
  const draggable = useLatestHandler(keyDraggable);
  const dragSupported = onKeyDrop !== undefined;
  const beginKeyDrag = useCallback(
    (view: KeyView, ev: ReactPointerEvent) => {
      keyPointerDown?.(view, ev);
      if (!dragSupported || ev.button !== 0 || draggable?.(view) === false) return;
      dragRef.current = {
        pointerId: ev.pointerId,
        startX: ev.clientX,
        startY: ev.clientY,
        source: view,
        destination: null,
        started: false,
      };
      svgRef.current?.setPointerCapture(ev.pointerId);
    },
    [dragSupported, draggable, keyPointerDown],
  );

  const decorated = useMemo(
    () => model.keys.map((key) => ({ key, decor: decorFor(key) })),
    [model.keys, decorFor],
  );

  return (
    <svg
      ref={svgRef}
      viewBox={viewBox}
      className={className}
      style={{ touchAction: "none", display: "block" }}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={(ev) => {
        if (ev.target === ev.currentTarget) onBackgroundPointerDown?.();
      }}
      onPointerMove={(ev) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== ev.pointerId) return;
        if (
          !drag.started &&
          Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) < 6
        ) {
          return;
        }
        if (!drag.started) {
          drag.started = true;
          onKeyDragChange?.(drag.source, null);
        }
        ev.preventDefault();
        const candidate = keyAtPoint(ev.clientX, ev.clientY);
        const destination =
          candidate &&
          (candidate.row !== drag.source.row ||
            candidate.col !== drag.source.col)
            ? candidate
            : null;
        if (
          destination?.row !== drag.destination?.row ||
          destination?.col !== drag.destination?.col
        ) {
          drag.destination = destination;
          onKeyDragChange?.(drag.source, destination);
        }
      }}
      onPointerUp={(ev) => finishDrag(ev.pointerId, false)}
      onPointerCancel={(ev) => finishDrag(ev.pointerId, true)}
    >
      <CapDefs />

      {decorated.map(({ key, decor }) => (
        <KeyShape
          key={`${key.row},${key.col}`}
          view={key}
          decor={decor}
          interactive={interactive}
          onPointerDown={beginKeyDrag}
          onPointerEnter={keyPointerEnter}
          onContextMenu={onKeyContextMenu ? keyContextMenu : undefined}
          onHover={onKeyHover ? keyHover : undefined}
          onKeyboardActivate={keyKeyboardActivate}
          onFocus={keyFocus}
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

      {model.pointingDevices.map((device) => (
        <PointingDeviceShape
          key={device.id}
          device={device}
          decor={pointingDeviceDecorFor?.(device) ?? {}}
          interactive={interactive && onPointingDeviceActivate !== undefined}
          onActivate={onPointingDeviceActivate}
        />
      ))}
    </svg>
  );
}

