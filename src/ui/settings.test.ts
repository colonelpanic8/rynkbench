import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTING_KEYS, createSetting, readSetting, writeSetting } from "./settings";

function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("browser settings", () => {
  it("reads back what it wrote", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    writeSetting(SETTING_KEYS.theme, "light");
    expect(readSetting(SETTING_KEYS.theme)).toBe("light");
  });

  it("never throws when storage refuses", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    });
    expect(readSetting("x")).toBeNull();
    expect(() => writeSetting("x", "1")).not.toThrow();
  });

  it("makes a store that parses, saves and tells subscribers once per change", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    writeSetting("test:mode", "nonsense");
    const setting = createSetting("test:mode", (raw) => (raw === "b" ? "b" : "a"));
    expect(setting.get()).toBe("a");
    const listener = vi.fn();
    setting.subscribe(listener);
    setting.set("b");
    setting.set("b");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(readSetting("test:mode")).toBe("b");
  });

  it("keeps the key names people's settings are saved under", () => {
    expect(SETTING_KEYS.theme).toBe("rynk:theme");
    expect(SETTING_KEYS.wording).toBe("rynk:wording");
    expect(SETTING_KEYS.locale).toBe("rynk:locale");
    expect(SETTING_KEYS.layerLighting("abc")).toBe("rynkbench:layer-lighting:abc");
  });
});
