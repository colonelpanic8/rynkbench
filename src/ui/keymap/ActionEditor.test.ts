import { describe, expect, it } from "vitest";
import { noModifiers } from "../../model/slots";
import { pickedHidAction } from "./actions";

describe("pickedHidAction", () => {
  it("combines selected modifiers with the key for advanced action slots", () => {
    const alt = { ...noModifiers(), left_alt: true };

    expect(pickedHidAction("F4", alt)).toEqual({ KeyWithModifier: ["F4", alt] });
  });

  it("keeps an unmodified key as a normal HID action", () => {
    expect(pickedHidAction("F4", noModifiers())).toEqual({ Key: { Hid: "F4" } });
  });
});
