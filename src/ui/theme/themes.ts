// The colour themes, after GLIDE's (core/themes.js there), the one source of
// truth for theme colours (ADR 0014). A theme is its 12 main colours (app,
// keyboard, special keys) and a few pins; everything else is worked out from
// them (`derive`), with its own amounts for dark and light themes, so every
// theme gets every token and stays legible (themes.test.ts checks each one).
// The themes are written as CSS once, at start-up (index.ts); index.css only
// declares the token names (and Default Dark's values as the fallback).
//
// Colours are #rrggbb here (the same values as GLIDE, so its themes copy over);
// the UI never uses them directly, only the tokens (colours.test.ts).

/** Theme ids as saved in the browser. "dark" and "light" keep their meaning
 *  from before there were more themes: Default Dark and Default Light. */
export type ThemeId = "dark" | "nebula" | "volt" | "light" | "clear" | "oat";

export type Scheme = "dark" | "light";

/** The main colours, in GLIDE's names. */
interface Main {
  "bg-base": string;
  "bg-surface": string;
  "text-main": string;
  "text-muted": string;
  "accent-primary": string;
  canvas: string;
  "key-face": string;
  "key-legend": string;
  select: string;
  "special-custom": string;
  "special-bluetooth": string;
  "special-action": string;
}

/** Worked-out colours a theme may set itself where the worked-out shade is not what it wants. */
type Pins = Partial<{
  "accent-fill": string;
  "accent-hover": string;
  "accent-text": string;
  "accent-ghost": string;
  "bg-chrome": string;
  "bg-card": string;
  "key-grad-bot": string;
  "key-border": string;
  "canvas-dot": string;
}>;

interface ThemeDef {
  name: string;
  scheme: Scheme;
  main: Main;
  pins?: Pins;
}

// Colours with a meaning, the same in every theme of a scheme: status text.
const STATUS: Record<Scheme, { ok: string; warn: string; danger: string }> = {
  dark: { ok: "#34d399", warn: "#fbbf24", danger: "#f87171" },
  light: { ok: "#065f46", warn: "#92400e", danger: "#b91c1c" },
};

/** The order here is the order in Preferences: dark themes first, then light, each with its Default first. */
export const THEMES: Record<ThemeId, ThemeDef> = {
  dark: {
    name: "Default Dark",
    scheme: "dark",
    main: {
      "bg-base": "#111111", "bg-surface": "#1a1a1a", "text-main": "#ffffff", "text-muted": "#9ca3af",
      "accent-primary": "#e55f2e", canvas: "#111111", "key-face": "#333333", "key-legend": "#ffffff",
      select: "#e55f2e", "special-custom": "#efb47e", "special-bluetooth": "#6a6a6a", "special-action": "#46cf87",
    },
    pins: { "accent-fill": "#c94f19", "accent-hover": "#b0440f", "accent-text": "#ef7440" },
  },
  nebula: {
    name: "Nebula",
    scheme: "dark",
    main: {
      "bg-base": "#0b0d17", "bg-surface": "#111422", "text-main": "#eef0ff", "text-muted": "#9aa0c2",
      "accent-primary": "#9b8cff", canvas: "#0b0d17", "key-face": "#1f2438", "key-legend": "#eef0ff",
      select: "#ff7ac6", "special-custom": "#d9a6ff", "special-bluetooth": "#4b56a6", "special-action": "#5fe3c4",
    },
  },
  volt: {
    name: "Volt",
    scheme: "dark",
    main: {
      "bg-base": "#0f100e", "bg-surface": "#161815", "text-main": "#f2f4ec", "text-muted": "#a3a89a",
      "accent-primary": "#d4f06b", canvas: "#0f100e", "key-face": "#262924", "key-legend": "#f2f4ec",
      select: "#d4f06b", "special-custom": "#e6f3a6", "special-bluetooth": "#3b5562", "special-action": "#78e0b4",
    },
  },
  // MoErgo's own editor: blue-grey chrome around a white canvas, flat light keys with teal legends.
  light: {
    name: "Default Light",
    scheme: "light",
    main: {
      "bg-base": "#ffffff", "bg-surface": "#ffffff", "text-main": "#244550", "text-muted": "#46626e",
      "accent-primary": "#dd7829", canvas: "#ffffff", "key-face": "#f3f4f6", "key-legend": "#2f6b80",
      select: "#4c7d8f", "special-custom": "#efb47e", "special-bluetooth": "#b5caec", "special-action": "#2e8a59",
    },
    pins: {
      "bg-chrome": "#dee6e8", "bg-card": "#f4f6f7", "accent-fill": "#325f6f", "accent-hover": "#274c59",
      "accent-ghost": "#ecf1f4", "key-grad-bot": "#f3f4f6", "key-border": "#e1e5e8", "canvas-dot": "rgba(0,0,0,0)",
    },
  },
  // GLIDE's "Light": cool grey canvas, white keys, near-black ink, an electric blue accent.
  clear: {
    name: "Light",
    scheme: "light",
    main: {
      "bg-base": "#eef0f3", "bg-surface": "#ffffff", "text-main": "#0b1220", "text-muted": "#5b6474",
      "accent-primary": "#1f6bff", canvas: "#eef0f3", "key-face": "#ffffff", "key-legend": "#0b1220",
      select: "#1f6bff", "special-custom": "#f7c59f", "special-bluetooth": "#b9ccff", "special-action": "#2fb383",
    },
    pins: { "accent-fill": "#1a5fe6", "bg-chrome": "#f8f9fb" },
  },
  // Warm oat and cream paper, brown ink, a deep moss accent, terracotta for the selected key.
  oat: {
    name: "Oat",
    scheme: "light",
    main: {
      "bg-base": "#f3eee6", "bg-surface": "#fffdf9", "text-main": "#2b251d", "text-muted": "#6b6153",
      "accent-primary": "#2f6f5e", canvas: "#f3eee6", "key-face": "#fffdf9", "key-legend": "#2b251d",
      select: "#c2643b", "special-custom": "#ecc29a", "special-bluetooth": "#bccbd3", "special-action": "#5f8f6d",
    },
    pins: { "accent-ghost": "#e2eee8" },
  },
};

export const DEFAULT_THEME: ThemeId = "dark";

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

// --- Colour arithmetic on #rrggbb and rgba(…) -------------------------------

type Rgba = [number, number, number, number];

export function parseColor(value: string): Rgba | null {
  const hexMatch = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value.trim());
  if (hexMatch) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hexMatch[1].slice(i, i + 2), 16));
    return [r, g, b, hexMatch[2] ? parseInt(hexMatch[2], 16) / 255 : 1];
  }
  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(value.trim());
  if (!rgbMatch) return null;
  const parts = rgbMatch[1].split(",").map(Number);
  return parts.slice(0, 3).every(Number.isFinite) ? [parts[0], parts[1], parts[2], parts[3] ?? 1] : null;
}

const toHex = (c: Rgba) =>
  `#${c.slice(0, 3).map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("")}`;

/** `t` of the way from `a` to `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a);
  const y = parseColor(b);
  return x && y ? toHex(x.map((v, i) => v * (1 - t) + y[i] * t) as Rgba) : a;
}

const withAlpha = (c: string, a: number) => {
  const x = parseColor(c);
  return x ? `rgba(${x.slice(0, 3).map(Math.round).join(",")},${a})` : c;
};

function luminance([r, g, b]: Rgba): number {
  const channel = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2 contrast; a see-through foreground is first laid over the background. */
export function contrast(fg: string, bg: string): number {
  const b = parseColor(bg);
  const f = parseColor(fg);
  if (!b || !f) return 0;
  const over = f.map((v, i) => (i < 3 ? v * f[3] + b[i] * (1 - f[3]) : 1)) as Rgba;
  const [hi, lo] = [luminance(over), luminance(b)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/** The more readable of white or near-black on a colour. */
export const textOn = (c: string) => (contrast("#ffffff", c) >= contrast("#111111", c) ? "#ffffff" : "#111111");

/** `c` moved toward white (on dark backgrounds) or black (on light ones) until it reads on each of them. */
function readable(c: string, backgrounds: string | string[], min: number): string {
  const all = Array.isArray(backgrounds) ? backgrounds : [backgrounds];
  return all.reduce((x, bg) => readableOn(x, bg, min), c);
}

function readableOn(c: string, bg: string, min: number): string {
  const b = parseColor(bg);
  if (!b || !parseColor(c)) return c;
  const toward = luminance(b) < 0.2 ? "#ffffff" : "#000000";
  let x = c;
  for (let i = 0; i < 24 && contrast(x, bg) < min; i += 1) x = mix(x, toward, 0.08);
  return x;
}

// --- From main colours to every token ---------------------------------------

/** Every token a theme sets, by the name index.css declares (`--color-<name>`). */
export type ThemeTokens = Record<string, string>;

/** MoErgo's POM keycaps as they really are under their lights (the lit view): the same in every theme. */
const POM = { pom: "oklch(81% 0.008 110)", "pom-edge": "oklch(66% 0.008 110)", "pom-ink": "oklch(42% 0.006 110)" };

export function themeTokens(id: ThemeId): ThemeTokens {
  const { scheme, main, pins = {} } = THEMES[id] ?? THEMES[DEFAULT_THEME];
  const dark = scheme === "dark";
  const surface = main["bg-surface"];
  const text = main["text-main"];
  const key = main["key-face"];
  const status = STATUS[scheme];
  const fill = pins["accent-fill"] ?? main["accent-primary"];
  const shade = (t: number) => mix(surface, text, t);
  const keyLow = pins["key-grad-bot"] ?? (dark ? mix(key, "#000000", 0.33) : mix(key, text, 0.1));
  const bg = pins["bg-chrome"] ?? main["bg-base"];
  const raised = pins["bg-card"] ?? shade(dark ? 0.065 : 0.025);
  // Text that may sit on the app background, a panel or a card reads on all three.
  const onSurfaces = [surface, raised, bg];
  const tokens: ThemeTokens = {
    bg,
    well: main.canvas,
    plate: main.canvas,
    panel: surface,
    raised,
    hover: shade(dark ? 0.14 : 0.07),
    "line-soft": shade(dark ? 0.07 : 0.06),
    line: shade(dark ? 0.14 : 0.12),
    "line-strong": shade(dark ? 0.3 : 0.3),
    ink: text,
    mute: readable(main["text-muted"], shade(dark ? 0.14 : 0.07), 4.5),
    faint: readable(mix(main["text-muted"], surface, 0.12), onSurfaces, 4.5),
    accent: readable(pins["accent-text"] ?? main["accent-primary"], onSurfaces, 4.5),
    "accent-fill": fill,
    "on-accent": textOn(fill),
    "accent-deep": pins["accent-hover"] ?? mix(fill, "#000000", 0.14),
    "accent-dim": pins["accent-ghost"] ?? mix(surface, main["accent-primary"], dark ? 0.15 : 0.1),
    select: main.select,
    ok: status.ok,
    warn: status.warn,
    danger: status.danger,
    "danger-dim": mix(surface, status.danger, dark ? 0.15 : 0.08),
    cap: key,
    "cap-low": keyLow,
    "cap-side": keyLow,
    "cap-edge": pins["key-border"] ?? (dark ? mix(key, "#ffffff", 0.08) : mix(key, text, 0.16)),
    "cap-ink": main["key-legend"],
    "cap-ink-dim": readable(mix(main["key-legend"], key, 0.35), key, 3),
    "cap-shadow": dark ? "rgba(0,0,0,0.5)" : withAlpha(text, 0.15),
    "canvas-dot": pins["canvas-dot"] ?? withAlpha(text, dark ? 0.08 : 0.1),
    "cap-sheen": "rgba(255,255,255,0.08)",
    "legend-halo": "rgba(0,0,0,0.72)",
    "special-custom": main["special-custom"],
    "special-bluetooth": main["special-bluetooth"],
    "special-action": main["special-action"],
    ...POM,
  };
  for (const kind of SPECIAL_KEYS) tokens[`special-${kind}-ink`] = keyTextOn(tokens[`special-${kind}`], tokens);
  return tokens;
}

/** "Highlight special keys": the kinds that get a cap colour, as in GLIDE. */
export const SPECIAL_KEYS = ["custom", "bluetooth", "action"] as const;
export type SpecialKey = (typeof SPECIAL_KEYS)[number];

/** The colour of the text on a key with a colour of its own: the key's legend
 *  colour when it reads (4.5:1), else the theme's text or background colour that does. */
export function keyTextOn(background: string, tokens: ThemeTokens): string {
  const candidates = [tokens["cap-ink"], tokens.ink, tokens.bg];
  const plain = contrast("#ffffff", background) >= contrast("#000000", background) ? "#ffffff" : "#000000";
  return candidates.find((c) => contrast(c, background) >= 4.5) ?? plain;
}

/** Every theme as CSS, one block per theme, applied by <html data-theme="…">. */
export function themesCss(): string {
  return THEME_IDS.map((id) => {
    const tokens = themeTokens(id);
    const lines = Object.entries(tokens).map(([name, value]) => `--color-${name}: ${value};`);
    return `:root[data-theme="${id}"] { color-scheme: ${THEMES[id].scheme}; ${lines.join(" ")} }`;
  }).join("\n");
}

/** What Preferences shows for each theme: its name, scheme and a little picture [background, panel, key, accent]. */
export function themeList(): { id: ThemeId; name: string; scheme: Scheme; swatch: [string, string, string, string] }[] {
  return THEME_IDS.map((id) => {
    const t = themeTokens(id);
    return { id, name: THEMES[id].name, scheme: THEMES[id].scheme, swatch: [t.bg, t.panel, t.cap, t["accent-fill"]] };
  });
}
