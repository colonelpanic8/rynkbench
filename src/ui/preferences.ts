// The preferences that change how Rynkbench looks and reads, as GLIDE's
// Settings has them (ui/settingsPanel.jsx there): browser-local, never written
// to the keyboard. Theme and wording have their own homes (theme/, terms.ts);
// the rest live here, each a small store with a hook (ADR 0014).

import { useSyncExternalStore } from "react";
import { SETTING_KEYS, createSetting, type Setting } from "./settings";
import { DEFAULT_THEME, setTheme } from "./theme";
import { DEFAULT_WORDING, setWording } from "./terms";
import { DEFAULT_LOCALE_ID, setLocaleId } from "./locale";

/** The computer the keyboard types into: decides how modifiers and some keys read. */
export type Os = "mac" | "win" | "linux";
export type OsChoice = "auto" | Os;

/** The computer this page runs on, as well as the browser tells. */
export function detectOs(): Os {
  const platform =
    typeof navigator === "undefined"
      ? ""
      : ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
        navigator.platform ??
        "");
  if (/mac|iphone|ipad/i.test(platform)) return "mac";
  if (/win/i.test(platform)) return "win";
  return "linux";
}

const oneOf =
  <T extends string>(values: readonly T[], fallback: T) =>
  (raw: string | null): T =>
    values.includes(raw as T) ? (raw as T) : fallback;
const onOff = (fallback: boolean) => (raw: string | null) => (raw === null ? fallback : raw === "true");

const DEFAULTS = {
  os: "auto",
  highlightSpecialKeys: true,
  shiftedCharacters: "base",
  keyEditorSide: "bottom",
  sidePanelSide: "left",
} as const;

export const PREFERENCES = {
  os: createSetting<OsChoice>(SETTING_KEYS.os, oneOf(["auto", "mac", "win", "linux"] as const, DEFAULTS.os)),
  /** Layer, Bluetooth, lighting and other special keys get the theme's highlight colours. */
  highlightSpecialKeys: createSetting(SETTING_KEYS.highlightSpecialKeys, onOff(DEFAULTS.highlightSpecialKeys)),
  /** The small character Shift gives (the "@" over the "2"): on the base layer only, or on every layer. */
  shiftedCharacters: createSetting(SETTING_KEYS.shiftedCharacters, oneOf(["base", "all"] as const, DEFAULTS.shiftedCharacters)),
  /** Where the key editor sits: under the keyboard, or beside it. */
  keyEditorSide: createSetting(SETTING_KEYS.keyEditorSide, oneOf(["bottom", "right"] as const, DEFAULTS.keyEditorSide)),
  /** Which side the Layers panel is on. */
  sidePanelSide: createSetting(SETTING_KEYS.sidePanelSide, oneOf(["left", "right"] as const, DEFAULTS.sidePanelSide)),
} as const;

export function usePreference<T>(setting: Setting<T>): T {
  return useSyncExternalStore(setting.subscribe, setting.get, setting.get);
}

/** The OS keys are shown for: the chosen one, or the computer's own on Auto. */
export function useOs(): Os {
  const choice = usePreference(PREFERENCES.os);
  return choice === "auto" ? detectOs() : choice;
}

/** Settings' "Reset settings to default": every preference, the theme, the
 *  wording and the keyboard layout back as they start. The layout is untouched. */
export function resetPreferences(): void {
  for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    (PREFERENCES[key] as Setting<unknown>).set(DEFAULTS[key]);
  }
  setTheme(DEFAULT_THEME);
  setWording(DEFAULT_WORDING);
  setLocaleId(DEFAULT_LOCALE_ID);
}
