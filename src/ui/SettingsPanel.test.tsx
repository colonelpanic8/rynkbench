import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsBody } from "./SettingsPanel";
import { PREFERENCES, resetPreferences } from "./preferences";
import { setTheme } from "./theme";
import { THEME_IDS, themeList } from "./theme/themes";

describe("Settings", () => {
  afterEach(() => resetPreferences());

  it("shows GLIDE's sections and choices, without the custom-behaviour question", () => {
    const html = renderToStaticMarkup(<SettingsBody />);
    for (const text of ["Look", "Your computer", "Screen", "Highlight special keys", "Terminology", "Show shifted characters", "Key editor", "Layers panel", "Reset settings to default"])
      expect(html).toContain(text);
    expect(html).not.toMatch(/convert custom behaviors/i);
  });

  it("offers every theme as a card, the chosen one pressed", () => {
    setTheme("oat");
    const html = renderToStaticMarkup(<SettingsBody />);
    for (const theme of themeList()) expect(html).toContain(`>${theme.name}</button>`);
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Oat<\/button>/);
    expect(THEME_IDS).toHaveLength(6);
  });

  it("marks the stored choices", () => {
    PREFERENCES.keyEditorSide.set("right");
    const html = renderToStaticMarkup(<SettingsBody />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Side<\/button>/);
  });

  it("resets every preference, the theme included", () => {
    PREFERENCES.os.set("win");
    PREFERENCES.highlightSpecialKeys.set(false);
    PREFERENCES.sidePanelSide.set("right");
    setTheme("volt");
    resetPreferences();
    expect(PREFERENCES.os.get()).toBe("auto");
    expect(PREFERENCES.highlightSpecialKeys.get()).toBe(true);
    expect(PREFERENCES.sidePanelSide.get()).toBe("left");
  });
});
