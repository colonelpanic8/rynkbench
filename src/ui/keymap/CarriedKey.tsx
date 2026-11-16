// The key being dragged, drawn under the pointer as in GLIDE's drag ghost: its
// legend on a cap, and what letting go will do (swap, or copy with a modifier).

import { createPortal } from "react-dom";
import type { KeyGlyph } from "../labels";
import { cx } from "../kit";
import type { Carry } from "./useKeyMoves";

export function CarriedKey({ carry, glyph, over }: { carry: Carry; glyph: KeyGlyph; over: boolean }) {
  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed top-0 left-0 z-[1000] flex flex-col items-center gap-1"
      style={{ transform: `translate(${carry.x - 24}px, ${carry.y - 24}px)` }}
    >
      <div className="flex size-12 items-center justify-center rounded-lg border border-cap-edge bg-cap font-bold text-title text-cap-ink opacity-90 shadow-2xl">
        {glyph.text || "·"}
      </div>
      {over && (
        <span className={cx("rounded-full bg-accent-fill px-2 py-0.5 text-caption font-bold tracking-widest text-on-accent uppercase")}>
          {carry.copy ? "+ copy" : "⇄ swap"}
        </span>
      )}
    </div>,
    document.body,
  );
}
