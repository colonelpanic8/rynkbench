// What the canvas shows on each key, encoder and trackpad: decided by the screen
// that draws it, passed in, never worked out here.

import type { KeyGlyph } from "../labels";
import type { SpecialKey } from "../theme/themes";

export interface KeyDecor {
  glyph?: KeyGlyph;
  /** Accessible description of the key and its current action. */
  ariaLabel?: string;
  ariaKeyShortcuts?: string;
  /** Per-key lighting color (CSS), rendered as a flat cap fill. */
  fill?: string;
  /** "Highlight special keys": the cap takes that theme colour (keyface/keyFace.ts specialKind). */
  special?: SpecialKey;
  /** Device-wide base lighting, rendered across the full cap below labels. */
  backgroundFill?: string;
  fillAnim?: {
    name: "led-blink" | "led-breathe";
    periodMs: number;
    delayMs?: number;
  };
  staged?: boolean;
  selected?: boolean;
  pending?: boolean;
  error?: boolean;
  /** Zone-hover emphasis; on the keymap, where a dragged key will land. */
  highlight?: boolean;
  /** The key being carried away by a drag or a keyboard move: drawn faded. */
  lifted?: boolean;
  /** Member of the current bulk selection. */
  inSelection?: boolean;
  /** Not paintable / not interactive right now. */
  disabled?: boolean;
  /** Drawn as the real board under its lights (GLIDE's lit view): a light
   *  keycap with grey legends, and its LED's colour as a glow, animated as the
   *  LED's effect is. No `led`: an unlit cap. */
  lit?: {
    led?: string;
    anim?: KeyDecor["fillAnim"];
  };
  /** Bump to replay the paint pop animation. */
  popNonce?: number;
}

export interface EncoderDecor {
  selected?: boolean;
  staged?: boolean;
  pending?: boolean;
  error?: boolean;
  label?: string;
}

export interface PointingDeviceDecor {
  selected?: boolean;
  staged?: boolean;
  mode?: string;
}
