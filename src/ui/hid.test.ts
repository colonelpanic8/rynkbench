import { afterEach, describe, expect, it } from "vitest";
import { searchKeycodes } from "./hid";
import { DEFAULT_LOCALE_ID, setLocaleId } from "./locale";

afterEach(() => setLocaleId(DEFAULT_LOCALE_ID));

describe("character-aware keycode search", () => {
  it("resolves a single-character query to the keystroke that types it", () => {
    const groups = searchKeycodes("@");
    expect(groups[0].name).toContain("@");
    expect(groups[0].entries[0].code).toBe("Kc2");
    expect(groups[0].entries[0].mods?.left_shift).toBe(true);
  });

  it("follows the active locale for both resolution and search text", () => {
    setLocaleId("de");
    const groups = searchKeycodes("@");
    expect(groups[0].entries[0].code).toBe("Q");
    expect(groups[0].entries[0].mods?.right_alt).toBe(true);

    // "ö" is the bare Semicolon key on German — no modifiers needed.
    const umlaut = searchKeycodes("ö");
    expect(umlaut[0].entries[0].code).toBe("Semicolon");
    expect(umlaut[0].entries[0].mods).toBeUndefined();
  });

  it("keeps plain keyword search working alongside character matches", () => {
    const groups = searchKeycodes("volume up");
    expect(groups.some((g) => g.entries.some((e) => e.code === "AudioVolUp"))).toBe(true);
  });

  it("labels catalog letters with the locale's characters", () => {
    setLocaleId("de");
    const letters = searchKeycodes("").find((g) => g.name === "Letters");
    const y = letters?.entries.find((e) => e.code === "Y");
    expect(y?.label).toBe("Z");
  });
});
