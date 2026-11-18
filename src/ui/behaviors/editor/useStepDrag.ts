// Dragging a macro step by its grip, as in GLIDE: the row under the pointer
// and which half of it say where it lands (a line shows the place); the list
// scrolls when the pointer nears its edge. Rows carry `data-step={index}`.

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { dropIndex } from "../../../model/macro-draft";

export interface DropLine {
  /** The row the line is drawn at. */
  row: number;
  /** Below it rather than above. */
  after: boolean;
}

export interface StepDrag {
  /** The step being dragged, or null. */
  from: number | null;
  line: DropLine | null;
  start: (event: ReactPointerEvent<HTMLElement>, from: number) => void;
}

const EDGE = 36;

export function useStepDrag(onMove: (from: number, to: number) => void): StepDrag {
  const [from, setFrom] = useState<number | null>(null);
  const [line, setLine] = useState<DropLine | null>(null);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);

  const start = (event: ReactPointerEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    const scroller = event.currentTarget.closest<HTMLElement>("[data-step-list]");
    let last: DropLine | null = null;
    let direction = 0;
    const scroll = () => {
      if (!direction || !scroller) return;
      scroller.scrollTop += direction * 10;
      requestAnimationFrame(scroll);
    };
    const spot = (x: number, y: number): DropLine | null => {
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-step]");
      if (!row) return null;
      const target = Number(row.dataset.step);
      const box = row.getBoundingClientRect();
      const after = y > box.top + box.height / 2;
      return dropIndex(index, target, after) === null ? null : { row: target, after };
    };
    const move = (moving: PointerEvent) => {
      last = spot(moving.clientX, moving.clientY) ?? last;
      setLine(last);
      const box = scroller?.getBoundingClientRect();
      const next = !box ? 0 : moving.clientY < box.top + EDGE ? -1 : moving.clientY > box.bottom - EDGE ? 1 : 0;
      if (next !== direction) {
        direction = next;
        scroll();
      }
    };
    const end = (ending: PointerEvent) => {
      stop.current();
      const to = ending.type === "pointerup" && last ? dropIndex(index, last.row, last.after) : null;
      if (to !== null) onMove(index, to);
    };
    stop.current = () => {
      direction = 0;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setFrom(null);
      setLine(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    setFrom(index);
  };

  return { from, line, start };
}
