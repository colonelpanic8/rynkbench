// Dragging a row of a list by its handle to another place, as GLIDE reorders
// layers: the row under the pointer is where it lands; letting go there calls
// `onMove(from, to)`. Rows carry `data-row={id}` so the pointer can find them.

import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface RowDrag {
  from: number;
  over: number | null;
}

export function useRowDrag(onMove: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<RowDrag | null>(null);

  const start = (from: number, event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const pointer = event.pointerId;
    let over: number | null = null;
    setDrag({ from, over });
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-row]");
      const next = row ? Number(row.dataset.row) : null;
      if (next !== over) {
        over = next;
        setDrag({ from, over });
      }
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pointer) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrag(null);
      if (ev.type === "pointerup" && over !== null && over !== from) onMove(from, over);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return {
    drag,
    /** Props for a row's drag handle. */
    handle: (id: number) => ({ onPointerDown: (event: ReactPointerEvent) => start(id, event), style: { touchAction: "none" as const } }),
    /** Where a row draws the line that shows the dragged row will land next to it. */
    edge(id: number): "top" | "bottom" | null {
      if (!drag || drag.over !== id || drag.over === drag.from) return null;
      return drag.from > id ? "top" : "bottom";
    },
  };
}
