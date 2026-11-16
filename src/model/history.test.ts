import { describe, expect, it } from "vitest";
import { historyShortcut } from "./history";

function shortcutEvent(
  key: string,
  overrides: Partial<Parameters<typeof historyShortcut>[0]> = {},
): Parameters<typeof historyShortcut>[0] {
  return {
    key,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
    target: null,
    ...overrides,
  };
}

describe("history shortcuts", () => {
  it("recognizes platform undo and redo chords", () => {
    expect(historyShortcut(shortcutEvent("z"))).toBe("undo");
    expect(historyShortcut(shortcutEvent("Z", { shiftKey: true }))).toBe("redo");
    expect(historyShortcut(shortcutEvent("y"))).toBe("redo");
    expect(historyShortcut(shortcutEvent("z", { ctrlKey: false, metaKey: true }))).toBe("undo");
  });

  it("does not claim shortcuts from text-entry controls", () => {
    const target = { closest: () => ({}) } as unknown as EventTarget;
    expect(historyShortcut(shortcutEvent("z", { target }))).toBeNull();
    expect(historyShortcut(shortcutEvent("y", { target }))).toBeNull();
  });

  it("ignores unrelated or already-handled chords", () => {
    expect(historyShortcut(shortcutEvent("z", { altKey: true }))).toBeNull();
    expect(historyShortcut(shortcutEvent("z", { defaultPrevented: true }))).toBeNull();
    expect(historyShortcut(shortcutEvent("x"))).toBeNull();
  });
});

