import { describe, expect, it } from "vitest";
import { LOCALES } from "../locale";
import { layerTiles, pickKeyGroups, searchTiles } from "./pickKey";

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
});
