// A small drawing of the keyboard, as on GLIDE's combo cards: every key a
// plain cap, the marked ones in the accent colour. No legends, no events.

import type { KeyboardModel, KeyView } from "../../model/keyboard";
import { boardViewBox, rectAttrs } from "./geometry";

export function MiniBoard({ model, marked }: { model: KeyboardModel; marked: (key: KeyView) => boolean }) {
  const vb = boardViewBox(model);
  return (
    <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="block h-full w-full" aria-hidden>
      {model.keys.map((key) => {
        const { rect, rect2, r } = key.shape;
        const on = marked(key);
        return (
          <g key={`${key.row},${key.col}`} transform={`rotate(${r} ${rect.x} ${rect.y})`}>
            {[rect, ...(rect2 ? [rect2] : [])].map((part, i) => (
              <rect
                key={i}
                {...rectAttrs(part, 0.09)}
                rx={0.14}
                fill={on ? "var(--color-accent-fill)" : "var(--color-cap-low)"}
                stroke={on ? "none" : "var(--color-line-strong)"}
                strokeWidth={0.05}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
