import { describe, expect, it } from "vitest";
import { freeName, labelsFromText, labelsToText, noLabels, withLabel, withoutEmptySlots } from "./behavior-labels";

describe("behavior labels", () => {
  it("sets, trims and removes a slot's label", () => {
    const named = withLabel(noLabels(), "morse", 3, { name: " Home row ", description: "" });
    expect(named.morse).toEqual({ 3: { name: "Home row", description: "" } });
    expect(withLabel(named, "morse", 3, { name: "", description: " " }).morse).toEqual({});
    expect(withLabel(named, "morse", 3, null).morse).toEqual({});
  });

  it("finds a free name, any case", () => {
    expect(freeName("Copy", [])).toBe("Copy");
    expect(freeName("Copy", ["copy"])).toBe("Copy 2");
    expect(freeName("Copy 2", ["Copy", "Copy 2"])).toBe("Copy 3");
  });

  it("drops labels on slots a read finds empty", () => {
    const labels = withLabel(withLabel(noLabels(), "macros", 0, { name: "a", description: "" }), "macros", 1, { name: "b", description: "" });
    expect(withoutEmptySlots(labels, (_, slot) => slot === 1).macros).toEqual({ 1: { name: "b", description: "" } });
  });

  it("round-trips through text and ignores what it cannot read", () => {
    const labels = withLabel(noLabels(), "forks", 2, { name: "Shift comma", description: "; with shift" });
    expect(labelsFromText(labelsToText(labels))).toEqual(labels);
    expect(labelsFromText("not json")).toEqual(noLabels());
    expect(labelsFromText('{"morse":{"x":{"name":"bad"},"1":{"name":5},"2":{"name":"ok"}}}').morse).toEqual({ 2: { name: "ok", description: "" } });
  });
});
