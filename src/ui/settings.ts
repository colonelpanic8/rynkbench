// Settings kept in this browser (theme, wording, keyboard layout, pane sizes,
// lighting presets): one place that reads and writes them, never throwing (a
// private window may refuse storage; the app then simply forgets), and one way
// to make a setting a small store screens can subscribe to. Every key is
// listed here, so what the app keeps is visible in one place.

/** Every key the app keeps. Do not rename one: people would lose the setting. */
export const SETTING_KEYS = {
  theme: "rynk:theme",
  wording: "rynk:wording",
  locale: "rynk:locale",
  sidePanelWidth: "rynk:side-panel-width",
  keyEditorWidth: "rynk:key-editor-width",
  keyEditorHeight: "rynk:key-editor-height",
  canvasHintDismissed: "rynk:canvas-hint-dismissed",
  comboView: "rynk:combo-view",
  /** Preferences (ui/preferences.ts). */
  os: "rynk:os",
  highlightSpecialKeys: "rynk:highlight-special-keys",
  shiftedCharacters: "rynk:shifted-characters",
  keyEditorSide: "rynk:key-editor-side",
  sidePanelSide: "rynk:side-panel-side",
  /** Changes not yet sent to a keyboard, kept per device (ADR 0010). */
  draft: (serial: string) => `rynk:draft:${serial || "unknown"}`,
  /** Layer lighting presets on boards without scene storage, per device. */
  layerLighting: (serial: string) => `rynkbench:layer-lighting:${serial || "unknown"}`,
  /** The effects' brightness to turn them back on at, per device: off is brightness 0 on the keyboard. */
  effectsOnValue: (serial: string) => `rynk:effects-on-value:${serial || "unknown"}`,
} as const;

export function readSetting(key: string): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {
    // Storage refused or full: the value still applies until the page closes.
  }
}

export interface Setting<T> {
  get(): T;
  /** Changes it, saves it and tells subscribers; the same value does nothing. */
  set(value: T): void;
  subscribe(listener: () => void): () => void;
  /** Reads it from storage again (the stored value may have changed). */
  reload(): T;
}

/** A setting as a store. `parse` turns what is stored (or nothing) into a
 *  valid value, so a missing or unknown one becomes the default. */
export function createSetting<T>(
  key: string,
  parse: (raw: string | null) => T,
  serialize: (value: T) => string = String,
): Setting<T> {
  let value = parse(readSetting(key));
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      writeSetting(key, serialize(next));
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reload() {
      value = parse(readSetting(key));
      return value;
    },
  };
}
