// The canvas a keyboard sits on.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { KeyboardModel } from "../../model/keyboard";

import { cx } from "../kit";
import { boardViewBox } from "./geometry";
import { clampPan, startsPan } from "./pan";

/* ------------------------------------------------------------------ */
/* Fit-to-container canvas                                             */
/* ------------------------------------------------------------------ */

/** Largest key pitch, in CSS px per key-unit (GLIDE's: its 70 px key at 2x). */
const MAX_PITCH = 140;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.1;

/**
 * The canvas a keyboard sits on, as GLIDE draws it: the whole pane, with a dot
 * grid. The board fits 95% of it and refits whenever the pane changes size;
 * the zoom control (−, the percentage that returns to the fit, +) and Ctrl/⌘
 * with the scroll wheel zoom on top of the fit, and dragging the empty canvas
 * moves the board at any zoom, as in GLIDE (canvas/pan.ts keeps most of it in view). `top` floats at the top centre (GLIDE's hint pill),
 * `tools` sit left of the zoom control; `flush` drops the frame for a canvas
 * that is the whole pane.
 */
export function BoardWell({
  model,
  className,
  flush = false,
  top,
  tools,
  children,
}: {
  model: KeyboardModel;
  className?: string;
  flush?: boolean;
  top?: ReactNode;
  tools?: ReactNode;
  children: ReactNode;
}) {
  const vb = boardViewBox(model);
  const ratio = vb.w / vb.h;
  const capPx = Math.round(vb.w * MAX_PITCH);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panning = useRef<{ id: number; x: number; y: number; from: { x: number; y: number } } | null>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [grabbing, setGrabbing] = useState(false);
  /** `pan`, kept inside what the canvas and the board's size on screen allow. */
  const clamped = (next: { x: number; y: number }) => {
    const well = wellRef.current?.getBoundingClientRect();
    const board = boardRef.current?.getBoundingClientRect();
    if (!well || !board) return next;
    return clampPan(next, { w: well.width, h: well.height }, { w: board.width, h: board.height });
  };
  // Each step works from the zoom as it is now, so quick clicks all count.
  const zoomBy = (step: number) =>
    setZoom((current) => {
      return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current + step)) * 100) / 100;
    });

  const zoomByRef = useRef(zoomBy);
  useEffect(() => {
    zoomByRef.current = zoomBy;
  });
  // Ctrl/⌘ + wheel zooms (a plain wheel keeps scrolling the page).
  useEffect(() => {
    const well = wellRef.current;
    if (!well) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomByRef.current(-Math.sign(event.deltaY) * ZOOM_STEP);
    };
    well.addEventListener("wheel", onWheel, { passive: false });
    return () => well.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      ref={wellRef}
      className={cx(
        "canvas-well relative min-h-0 w-full flex-1 overflow-hidden select-none",
        !flush && "rounded-xl border border-line",
        className,
      )}
      style={{ containerType: "size", cursor: grabbing ? "grabbing" : "grab" }}
      onPointerDown={(event) => {
        // The empty canvas pans; keys and the controls over the canvas keep their own pointer handling.
        if (event.button !== 0 || !startsPan(event.target)) return;
        panning.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: pan };
        event.currentTarget.setPointerCapture(event.pointerId);
        setGrabbing(true);
      }}
      onPointerMove={(event) => {
        const drag = panning.current;
        if (!drag || drag.id !== event.pointerId) return;
        setPan(clamped({ x: drag.from.x + event.clientX - drag.x, y: drag.from.y + event.clientY - drag.y }));
      }}
      onPointerUp={() => {
        panning.current = null;
        setGrabbing(false);
      }}
      onPointerCancel={() => {
        panning.current = null;
        setGrabbing(false);
      }}
    >
      <div
        ref={boardRef}
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: `min(95cqw, ${capPx}px, 95cqh * ${ratio.toFixed(4)})`,
          aspectRatio: `${vb.w.toFixed(3)} / ${vb.h.toFixed(3)}`,
          transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <div className="pointer-events-auto h-full w-full">{children}</div>
      </div>
      {top && (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
          <div className="pointer-events-auto max-w-full">{top}</div>
        </div>
      )}
      <div className="absolute right-3 bottom-3 z-10 flex items-end gap-2">
        {tools}
        <div className="flex h-9 items-center rounded-xl border border-line-strong bg-raised px-1 shadow-2xl">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            onClick={() => zoomBy(-ZOOM_STEP)}
            className="flex h-full cursor-pointer items-center px-2.5 text-mute transition-transform hover:-translate-y-px hover:text-ink"
          >
            −
          </button>
          <button
            type="button"
            title="Fit the keyboard to the space"
            aria-label={`Zoom ${Math.round(zoom * 100)} percent; fit to the space`}
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            className="w-12 cursor-pointer text-center font-mono text-small font-semibold text-ink"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            onClick={() => zoomBy(ZOOM_STEP)}
            className="flex h-full cursor-pointer items-center px-2.5 text-mute transition-transform hover:-translate-y-px hover:text-ink"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
