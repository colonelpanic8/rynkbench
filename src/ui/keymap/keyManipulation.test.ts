import { describe, expect, it } from "vitest";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { EMPTY_MODS } from "../labels";
import {
  isTextEditingTarget,
  keyClipboardShortcut,
  parseKeyActionClipboard,
  serializeKeyAction,
} from "./keyManipulation";

describe("key-action clipboard", () => {
  it("round-trips a complete structured KeyAction", () => {
    const action: KeyAction = {
      TapHold: [
        { KeyWithModifier: ["Kc1", { ...EMPTY_MODS, left_shift: true }] },
        {
          LayerOnWithModifier: [
            3,
            { ...EMPTY_MODS, left_ctrl: true, right_alt: true },
          ],
        },
        7,
      ],
    } as KeyAction;

    const pasted = parseKeyActionClipboard(serializeKeyAction(action));

    expect(pasted).toEqual(action);
    expect(pasted).not.toBe(action);
  });

  it("rejects labels, ordinary JSON, and unknown payload versions", () => {
    expect(parseKeyActionClipboard("Enter")).toBeNull();
    expect(
      parseKeyActionClipboard('{"Single":{"Key":{"Hid":"A"}}}'),
    ).toBeNull();
    expect(
      parseKeyActionClipboard(
        '{"kind":"rynkbench/key-action","version":2,"action":"No"}',
      ),
    ).toBeNull();
  });

  it("rejects malformed actions before they can enter optimistic state", () => {
    expect(
      parseKeyActionClipboard(
        '{"kind":"rynkbench/key-action","version":1,"action":{"TapHold":null}}',
      ),
    ).toBeNull();
    expect(
      parseKeyActionClipboard(
        '{"kind":"rynkbench/key-action","version":1,"action":{"Single":{"Modifier":{}}}}',
      ),
    ).toBeNull();
  });
});

describe("key clipboard shortcuts", () => {
  const event = (overrides: Record<string, unknown> = {}) =>
    ({
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      key: "c",
      target: null,
      ...overrides,
    }) as KeyboardEvent;

  it("recognizes Ctrl/Cmd+C and Ctrl/Cmd+V", () => {
    expect(keyClipboardShortcut(event())).toBe("copy");
    expect(
      keyClipboardShortcut(event({ ctrlKey: false, metaKey: true, key: "V" })),
    ).toBe("paste");
  });

  it("does not intercept text editors or modified shortcuts", () => {
    expect(
      keyClipboardShortcut(event({ target: { tagName: "INPUT" } })),
    ).toBeNull();
    expect(
      keyClipboardShortcut(event({ target: { isContentEditable: true } })),
    ).toBeNull();
    expect(keyClipboardShortcut(event({ altKey: true }))).toBeNull();
    expect(keyClipboardShortcut(event({ shiftKey: true }))).toBeNull();
  });

  it("recognizes nested textbox content as editing", () => {
    expect(
      isTextEditingTarget({
        closest: () => ({ role: "textbox" }),
      } as unknown as EventTarget),
    ).toBe(true);
  });
});
