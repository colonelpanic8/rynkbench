// The colour theme: one of the themes in themes.ts, Default Dark unless chosen
// otherwise. The choice is a browser-local preference, kept with the other
// settings (../settings.ts) and applied as <html data-theme="…">; the themes'
// values are written into the page once, at start-up (ADR 0014).

import { useSyncExternalStore } from "react";
import { SETTING_KEYS, createSetting } from "../settings";
import { DEFAULT_THEME, THEMES, themesCss, type ThemeId } from "./themes";

export type Theme = ThemeId;
export { DEFAULT_THEME };

/** Anything that is not a known theme is the default. */
export function normalizeTheme(value: unknown): Theme {
  return typeof value === "string" && value in THEMES ? (value as Theme) : DEFAULT_THEME;
}

const themeSetting = createSetting(SETTING_KEYS.theme, normalizeTheme);

/** Writes every theme's values into the page, once. */
function installThemes(): void {
  if (typeof document === "undefined" || document.getElementById("rynk-themes")) return;
  const style = document.createElement("style");
  style.id = "rynk-themes";
  style.textContent = themesCss();
  document.head.append(style);
}

function apply(theme: Theme): void {
  if (typeof document === "undefined") return;
  installThemes();
  document.documentElement.dataset.theme = theme;
}

export function getTheme(): Theme {
  return themeSetting.get();
}

export function subscribeTheme(listener: () => void): () => void {
  return themeSetting.subscribe(listener);
}

/** Applies the saved theme to the page. Called once before the first render. */
export function applyStoredTheme(): void {
  apply(themeSetting.reload());
}

export function setTheme(theme: Theme): void {
  apply(theme);
  themeSetting.set(theme);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, getTheme, getTheme);
}
