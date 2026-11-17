import { describe, expect, it } from "vitest";
import { LOCALES } from "../locale";
import { HID_CODES, NOT_KEYS } from "../../model/hid-codes";
import { behaviorEntries, behaviorTiles, layerTiles, narrowTo, pickKeyGroups, plainKey, searchTiles, type TileGroup } from "./pickKey";

const us = LOCALES[0];
const groups = pickKeyGroups(us, { userActions: [{ id: 3, label: "Board light toggle", hint: "" }] });
const group = (id: string) => groups.main.find((g) => g.id === id)!;

describe("pick key", () => {
  it("lists GLIDE's groups in GLIDE's order", () => {
    expect(groups.main.map((g) => g.id)).toEqual([
      "letters",
      "numbers",
      "symbols",
      "essentials",
      "modifiers",
      "navigation",
      "toggles",
      "media",
      "fkeys",
      "mouse",
      "device",
      "special",
      "numpad",
    ]);
    expect(groups.main.filter((g) => g.chip).map((g) => g.chip)).toEqual([
      "Letters",
      "Numbers",
      "Symbols",
      "Navigation",
      "Toggle",
      "Media",
      "Fn Keys",
      "Device",
    ]);
  });

  it("shows each letter key once, as its keycap, bound to the key itself", () => {
    const letters = group("letters").tiles;
    expect(letters.map((t) => t.label)).toEqual("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
    expect(letters.find((t) => t.label === "A")).toMatchObject({ lilac: false, action: { Key: { Hid: "A" } } });
    expect(searchTiles(groups, "a").flatMap((g) => g.tiles.map((t) => t.label))).toContain("A");
  });

  it("gives every other character one tile, a shifted one marked", () => {
    const dollar = group("symbols").tiles.find((t) => t.label === "$");
    expect(dollar?.lilac).toBe(true);
    expect(dollar?.action).toMatchObject({ KeyWithModifier: ["Kc4", { left_shift: true }] });
    const ids = groups.main.flatMap((g) => g.tiles.map((t) => t.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps a layout's own letters, such as the German ä and ß", () => {
    const german = pickKeyGroups(LOCALES.find((l) => l.id === "de")!).main.find((g) => g.id === "letters")!;
    expect(german.tiles.map((t) => t.label)).toEqual(expect.arrayContaining(["Ä", "Ö", "Ü", "ß"]));
    expect(german.tiles.filter((t) => t.label === "Z")).toHaveLength(1);
  });

  it("clusters symbols so the eye finds them", () => {
    const brackets = group("symbols").tiles.filter((t) => t.cluster === "Brackets").map((t) => t.label);
    expect(brackets).toEqual(expect.arrayContaining(["(", ")", "[", "]", "{", "}"]));
  });

  it("offers this keyboard's own actions under Device", () => {
    expect(group("device").tiles.some((t) => t.label === "Board light toggle" && t.cluster === "This keyboard")).toBe(true);
  });

  it("finds a typed character first, and finds keys by their words", () => {
    expect(searchTiles(groups, "$")[0]).toMatchObject({ name: "Best match", tiles: [{ label: "$" }] });
    expect(searchTiles(groups, "volume").flatMap((g) => g.tiles.map((t) => t.label))).toEqual(
      expect.arrayContaining(["Volume +", "Volume −"]),
    );
    expect(searchTiles(groups, "sleep").some((g) => g.name.startsWith("All keys"))).toBe(true);
  });

  it("finds layers by name", () => {
    const found = layerTiles([{ index: 1, name: "Lower" }, { index: 2, name: "Magic" }], "low");
    expect(found?.tiles.map((t) => t.label)).toEqual(["While held: Lower", "Toggle Lower", "Switch to Lower"]);
    expect(layerTiles([{ index: 1, name: "Lower" }], "")).toBeNull();
  });

  it("has every key RMK has, each once, in the main groups or under All keys", () => {
    const pressed = (list: TileGroup[]) => list.flatMap((g) => g.tiles).map(plainKey).filter(Boolean);
    const all = [...pressed(groups.main), ...pressed(groups.more)];
    // A character key is in the main groups by its character; every other key has its own tile.
    expect(new Set(all)).toEqual(new Set(HID_CODES.filter((code) => !NOT_KEYS.has(code))));
    const moreKeys = pressed(groups.more);
    expect(new Set(moreKeys).size).toBe(moreKeys.length);
    expect(moreKeys.filter((code) => pressed(groups.main).includes(code))).toEqual([]);
  });

  it("has the whole mouse: wheel left and right, back and forward, and speed while held", () => {
    expect(group("mouse").tiles.map((t) => plainKey(t))).toEqual(
      expect.arrayContaining(["MouseWheelLeft", "MouseWheelRight", "MouseBtn4", "MouseBtn5", "MouseAccel0", "MouseAccel1", "MouseAccel2"]),
    );
  });

  it("names the modifiers as the computer does", () => {
    const names = (os: "mac" | "win" | "linux") => pickKeyGroups(us, { os }).main.find((g) => g.id === "modifiers")!.tiles.map((t) => t.label);
    expect(names("mac")).toEqual(expect.arrayContaining(["Left Control", "Left Option", "Left Command"]));
    expect(names("win")).toEqual(expect.arrayContaining(["Left Ctrl", "Left Alt", "Left Windows"]));
    expect(names("linux")).toContain("Left Super");
  });

  it("finds your macros and tap patterns by name and by what they do", () => {
    const entries = behaviorEntries({
      macros: [null, "“hello”"],
      morse: [{ profile: 0, actions: [[1, "No"]] } as never, { profile: 0, actions: [] } as never],
      title: (kind, index) => (kind === "macros" ? `Greeting ${index}` : `Tap pattern ${index}`),
      describe: () => "",
    });
    expect(entries.map((e) => `${e.kind}:${e.index}`)).toEqual(["macros:1", "morse:0"]);
    expect(behaviorTiles(entries, "hello")?.tiles).toMatchObject([{ label: "Greeting 1", action: { TriggerMacro: 1 } }]);
    expect(behaviorTiles(entries, "tap")?.tiles).toMatchObject([{ label: "Tap pattern 0", action: { Morse: 0 } }]);
    expect(behaviorTiles(entries, "")).toBeNull();
  });

  it("offers a behavior's slot no tap patterns or Transparent, and a plain key only keys", () => {
    const found = [behaviorTiles(behaviorEntries({ macros: ["x"], morse: [{ profile: 0, actions: [[1, "No"]] } as never], title: () => "pattern", describe: () => "" }), "pattern")!];
    expect(narrowTo(found, "slot").flatMap((g) => g.tiles.map((t) => t.id))).toEqual(["macro:0"]);
    expect(narrowTo(groups.main, "slot").flatMap((g) => g.tiles).some((t) => t.action === "Transparent")).toBe(false);
    const keys = narrowTo(groups.main, "keycode").flatMap((g) => g.tiles);
    expect(keys.every((t) => plainKey(t) !== null && !t.lilac)).toBe(true);
    expect(keys.some((t) => t.label === "$")).toBe(false);
  });

  it("finds a typed character with a layout's own keys, as the old search did", () => {
    const german = pickKeyGroups(LOCALES.find((l) => l.id === "de")!);
    expect(searchTiles(german, "@")[0].tiles[0].action).toMatchObject({ KeyWithModifier: ["Q", { right_alt: true }] });
    expect(searchTiles(german, "ö")[0].tiles[0].label).toBe("Ö");
  });
});
