// One key's face on its own, drawn exactly as on the canvas (KeyLabel) at the
// size of its box, as GLIDE's key previews are (ui/keyMenu.jsx KeyFace): the
// key editor's heading, so the selected key looks the same there, only smaller.

import type { KeyView } from "../../model/keyboard";
import type { KeyGlyph } from "../labels";
import { CAP_INSET } from "./geometry";
import { KeyLabel } from "./keys";

const VIEW: KeyView = {
  row: 0,
  col: 0,
  zoneIds: [],
  shape: { row: 0, col: 0, rect: { x: 0.5, y: 0.5, w: 1, h: 1 }, r: 0, rect2: undefined, pivot: undefined },
};
const CAP = 1 - CAP_INSET * 2;

export function KeyPreview({ glyph }: { glyph: KeyGlyph }) {
  return (
    <svg viewBox={`${CAP_INSET} ${CAP_INSET} ${CAP} ${CAP}`} className="size-full" aria-hidden>
      <KeyLabel view={VIEW} decor={{ glyph }} />
    </svg>
  );
}
