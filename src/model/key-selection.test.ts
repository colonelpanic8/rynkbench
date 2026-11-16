import { describe, expect, it } from "vitest";
import type { Selection } from "./workbench-state";
import { ledsOf, secondaryPress, selectedKeys, selectGesture, selectionExtended, selectionShowing, selectionWith } from "./key-selection";

const at = (row: number, col: number) => ({ row, col });
const one: Selection = { type: "key", row: 0, col: 0 };
const three: Selection = { type: "key", row: 0, col: 2, more: [at(0, 0), at(0, 1)] };

describe("the keys selected on the keymap", () => {
  it("lists them in the order they were selected, the editor's key last", () => {
    expect(selectedKeys(null)).toEqual([]);
    expect(selectedKeys({ type: "encoder", id: 1 })).toEqual([]);
    expect(selectedKeys(one)).toEqual([at(0, 0)]);
    expect(selectedKeys(three)).toEqual([at(0, 0), at(0, 1), at(0, 2)]);
  });

  it("adds a key as the last selected, and leaves a key already selected where it is", () => {
    expect(selectionWith(one, [at(1, 1)], "add")).toEqual({ type: "key", row: 1, col: 1, more: [at(0, 0)] });
    expect(selectionWith(three, [at(0, 0)], "add")).toEqual(three);
    expect(selectionWith(null, [at(2, 0)], "add")).toEqual({ type: "key", row: 2, col: 0 });
    expect(selectionWith({ type: "encoder", id: 1 }, [at(2, 0)], "add")).toEqual({ type: "key", row: 2, col: 0 });
  });

  it("removes keys: the one before becomes the editor's, and the last removed leaves nothing", () => {
    expect(selectionWith(three, [at(0, 2)], "remove")).toEqual({ type: "key", row: 0, col: 1, more: [at(0, 0)] });
    expect(selectionWith(three, [at(0, 0), at(0, 1)], "remove")).toEqual({ type: "key", row: 0, col: 2 });
    expect(selectionWith(one, [at(0, 0)], "remove")).toBeNull();
    const encoder: Selection = { type: "encoder", id: 1 };
    expect(selectionWith(encoder, [at(0, 0)], "remove")).toBe(encoder);
  });

  it("extends to a key by the rows and columns between, only over keys the board has", () => {
    const board = [at(0, 0), at(0, 1), at(1, 0), at(1, 1), at(2, 2)];
    expect(selectedKeys(selectionExtended(one, at(1, 1), board))).toEqual([at(0, 0), at(0, 1), at(1, 0), at(1, 1)]);
    // (1, 2), (2, 0) and (2, 1) are gaps in the matrix.
    expect(selectedKeys(selectionExtended({ type: "key", row: 1, col: 1 }, at(2, 2), board))).toEqual([at(1, 1), at(2, 2)]);
    expect(selectionExtended(null, at(1, 0), board)).toEqual({ type: "key", row: 1, col: 0 });
  });

  it("shows another selected key in the editor without losing the rest; a key outside replaces them", () => {
    expect(selectionShowing(three, at(0, 0))).toEqual({ type: "key", row: 0, col: 0, more: [at(0, 1), at(0, 2)] });
    expect(selectionShowing(three, at(3, 3))).toEqual({ type: "key", row: 3, col: 3 });
  });

  it("finds the selected keys' LEDs, leaving out a key that has none", () => {
    const board = [{ ...at(0, 0), ledId: 7 }, at(0, 1), { ...at(0, 2), ledId: 3 }];
    expect(ledsOf(board, selectedKeys(three))).toEqual([7, 3]);
  });

  it("reads a press: the toggle key adds or removes, Shift extends, and a canvas choosing keys needs neither", () => {
    const none = { ctrlKey: false, metaKey: false, shiftKey: false };
    expect(selectGesture(null, none, false)).toBeNull();
    expect(selectGesture(null, { ...none, ctrlKey: true }, false)).toBe("toggle");
    expect(selectGesture(null, { ...none, metaKey: true }, true)).toBe("toggle");
    expect(selectGesture(null, { ...none, shiftKey: true }, false)).toBe("extend");
    expect(selectGesture("many", none, false)).toBe("toggle");
    expect(selectGesture("one", { ...none, ctrlKey: true }, false)).toBe("only");
  });

  it("toggles with ⌘ on Apple computers and Ctrl elsewhere, never with the other", () => {
    const none = { ctrlKey: false, metaKey: false, shiftKey: false };
    expect(selectGesture(null, { ...none, ctrlKey: true }, true)).toBeNull();
    expect(selectGesture(null, { ...none, metaKey: true }, false)).toBeNull();
  });

  it("reads Ctrl with a click on a Mac as the secondary click, which never selects", () => {
    const click = { ctrlKey: false, metaKey: false, shiftKey: false, button: 0 };
    expect(secondaryPress({ ...click, ctrlKey: true }, true)).toBe(true);
    expect(secondaryPress({ ...click, ctrlKey: true }, false)).toBe(false);
    expect(secondaryPress({ ...click, metaKey: true }, true)).toBe(false);
    expect(secondaryPress({ ...click, button: 2 }, false)).toBe(true);
  });
});
