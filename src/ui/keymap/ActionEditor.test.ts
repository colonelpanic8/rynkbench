import { describe, expect, it } from "vitest";
import { EMPTY_MODS } from "../labels";
import { pickedHidAction } from "./actions";

describe("pickedHidAction", () => {
  it("combines selected modifiers with the key for advanced action slots", () => {
    const alt = { ...EMPTY_MODS, left_alt: true };

    expect(pickedHidAction("F4", alt)).toEqual({ KeyWithModifier: ["F4", alt] });
  });

  it("keeps an unmodified key as a normal HID action", () => {
    expect(pickedHidAction("F4", EMPTY_MODS)).toEqual({ Key: { Hid: "F4" } });
  });
});
