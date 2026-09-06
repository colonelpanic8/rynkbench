import { describe, expect, it } from "vitest";
import { claimFreeSlot, firstFreeSlot, openSlot, visibleSlots } from "./use-slot-editor";

/** A stand-in for the fixed-length slot tables: "" is an empty slot. */
const isEmpty = (value: string) => value === "";
const table = ["a", "", "b", ""];

describe("visibleSlots", () => {
  it("lists occupied slots with their real indices", () => {
    expect(visibleSlots(table, isEmpty, null)).toEqual([
      { value: "a", index: 0 },
      { value: "b", index: 2 },
    ]);
  });

  it("keeps the selected slot listed while it is still empty", () => {
    // Otherwise a freshly added entry disappears from the list the moment it
    // is created, before the user has anything to save.
    expect(visibleSlots(table, isEmpty, 1)).toEqual([
      { value: "a", index: 0 },
      { value: "", index: 1 },
      { value: "b", index: 2 },
    ]);
  });
});

describe("firstFreeSlot", () => {
  it("claims the lowest empty index, not the end of the table", () => {
    expect(firstFreeSlot(table, isEmpty)).toBe(1);
  });

  it("reports -1 when the table is full", () => {
    expect(firstFreeSlot(["a", "b"], isEmpty)).toBe(-1);
  });
});

describe("openSlot", () => {
  it("hands back a copy, so editing the draft cannot mutate the table", () => {
    const slots = [{ steps: [1] }];
    const { draft } = openSlot(slots, 0);
    draft!.steps.push(2);
    expect(slots[0].steps).toEqual([1]);
  });
});

describe("claimFreeSlot", () => {
  it("seeds a blank draft in the first free slot", () => {
    expect(claimFreeSlot(table, isEmpty, () => "new")).toEqual({ sel: 1, draft: "new" });
  });

  it("refuses when there is nowhere to put it", () => {
    expect(claimFreeSlot(["a"], isEmpty, () => "new")).toBeNull();
  });
});
