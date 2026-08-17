import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE_ID,
  LOCALES,
  activeLocale,
  characterFor,
  getLocaleId,
  keycapCharacter,
  keystrokeForCharacter,
  setLocaleId,
  subscribeLocale,
} from "./locale";

const locale = (id: string) => {
  const found = LOCALES.find((l) => l.id === id);
  if (!found) throw new Error(`no locale ${id}`);
  return found;
};

afterEach(() => setLocaleId(DEFAULT_LOCALE_ID));

describe("characterFor", () => {
  it("treats US as the identity layout", () => {
    const us = locale("us");
    expect(characterFor(us, "A", false)).toBe("a");
    expect(characterFor(us, "A", true)).toBe("A");
    expect(characterFor(us, "Kc2", true)).toBe("@");
    expect(characterFor(us, "Semicolon", false)).toBe(";");
    expect(characterFor(us, "Enter", false)).toBeNull();
    expect(characterFor(us, "Kc2", false, true)).toBeNull();
  });

  it("maps German QWERTZ letters, shifts, and AltGr", () => {
    const de = locale("de");
    expect(characterFor(de, "Y", false)).toBe("z");
    expect(characterFor(de, "Y", true)).toBe("Z");
    expect(characterFor(de, "Kc2", true)).toBe('"');
    expect(characterFor(de, "Q", false, true)).toBe("@");
    expect(characterFor(de, "Kc8", false, true)).toBe("[");
    expect(characterFor(de, "Semicolon", false)).toBe("ö");
    expect(characterFor(de, "Minus", false)).toBe("ß");
  });

  it("maps French AZERTY's moved letters and symbol-first digit row", () => {
    const fr = locale("fr");
    expect(characterFor(fr, "Q", false)).toBe("a");
    expect(characterFor(fr, "Q", true)).toBe("A");
    expect(characterFor(fr, "M", false)).toBe(",");
    expect(characterFor(fr, "Semicolon", false)).toBe("m");
    expect(characterFor(fr, "Kc2", false)).toBe("é");
    expect(characterFor(fr, "Kc2", true)).toBe("2");
    expect(characterFor(fr, "Kc0", false, true)).toBe("@");
  });

  it("maps Spanish ñ and AltGr symbols", () => {
    const es = locale("es");
    expect(characterFor(es, "Semicolon", false)).toBe("ñ");
    expect(characterFor(es, "Kc2", false, true)).toBe("@");
    expect(characterFor(es, "E", false, true)).toBe("€");
  });
});

describe("keycapCharacter", () => {
  it("uppercases letter-like keys and leaves symbol keys alone", () => {
    expect(keycapCharacter(locale("us"), "A")).toBe("A");
    expect(keycapCharacter(locale("de"), "Y")).toBe("Z");
    expect(keycapCharacter(locale("de"), "Semicolon")).toBe("Ö");
    expect(keycapCharacter(locale("fr"), "Kc2")).toBe("é");
    expect(keycapCharacter(locale("us"), "Semicolon")).toBe(";");
    expect(keycapCharacter(locale("us"), "F5")).toBeNull();
  });
});

describe("keystrokeForCharacter", () => {
  it("resolves characters to keystrokes with required layers", () => {
    expect(keystrokeForCharacter(locale("us"), "a")).toEqual({
      code: "A",
      shift: false,
      altgr: false,
    });
    expect(keystrokeForCharacter(locale("us"), "@")).toEqual({
      code: "Kc2",
      shift: true,
      altgr: false,
    });
    expect(keystrokeForCharacter(locale("de"), "@")).toEqual({
      code: "Q",
      shift: false,
      altgr: true,
    });
    expect(keystrokeForCharacter(locale("de"), "ö")).toEqual({
      code: "Semicolon",
      shift: false,
      altgr: false,
    });
    expect(keystrokeForCharacter(locale("fr"), "a")).toEqual({
      code: "Q",
      shift: false,
      altgr: false,
    });
    expect(keystrokeForCharacter(locale("us"), "ö")).toBeNull();
  });

  it("prefers the simplest keystroke when a character exists on two layers", () => {
    // German "#" is both the bare NonusHash/Backslash key and nothing else
    // shifted; French "é" is a bare digit-row key.
    expect(keystrokeForCharacter(locale("de"), "#")?.shift).toBe(false);
    expect(keystrokeForCharacter(locale("fr"), "é")).toEqual({
      code: "Kc2",
      shift: false,
      altgr: false,
    });
  });
});

describe("locale store", () => {
  it("switches the active locale and notifies subscribers", () => {
    expect(getLocaleId()).toBe(DEFAULT_LOCALE_ID);
    let notified = 0;
    const unsubscribe = subscribeLocale(() => notified++);
    setLocaleId("de");
    expect(getLocaleId()).toBe("de");
    expect(activeLocale().name).toBe("German (QWERTZ)");
    expect(notified).toBe(1);
    setLocaleId("nonsense");
    expect(getLocaleId()).toBe("de");
    expect(notified).toBe(1);
    unsubscribe();
  });
});
