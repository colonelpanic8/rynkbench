// Contrast between two theme colors, for the tests that keep both themes
// legible. Pure color math; nothing here touches the page.
//
// Tokens are written as `oklch(L% C H)`. The conversion goes OKLCH to OKLab to
// linear sRGB (clipped to the sRGB gamut), then WCAG 2 relative luminance.

export interface Oklch {
  /** Lightness, 0 to 1. */
  l: number;
  /** Chroma. */
  c: number;
  /** Hue in degrees. */
  h: number;
}

/** Reads `oklch(84% 0.126 195)`; a trailing `/ alpha` is ignored. */
export function parseOklch(value: string): Oklch {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)$/.exec(value.trim());
  if (!match) throw new Error(`not an oklch color: ${value}`);
  const lightness = Number(match[1]);
  return { l: match[2] === "%" ? lightness / 100 : lightness, c: Number(match[3]), h: Number(match[4]) };
}

function linearSrgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  return [
    clip(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
    clip(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
    clip(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
  ];
}

/** WCAG 2 relative luminance of an oklch color. */
export function luminance(color: Oklch): number {
  const [r, g, b] = linearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 (none) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(parseOklch(a));
  const lb = luminance(parseOklch(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
