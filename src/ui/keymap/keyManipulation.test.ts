import { describe, expect, it } from "vitest";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { noModifiers } from "../../model/slots";
import {
  isTextEditingTarget,
  keyClipboardShortcut,
  parseKeyActionClipboard,
  pasteStillTargets,
  planClipboardAction,
  serializeKeyAction,
} from "./keyManipulation";
import type { ClipboardBoard } from "./keyManipulation";

describe("key-action clipboard", () => {
  it("round-trips a complete structured KeyAction", () => {
    const action: KeyAction = {
      TapHold: [
        { KeyWithModifier: ["Kc1", { ...noModifiers(), left_shift: true }] },
        {
          LayerOnWithModifier: [
            3,
            { ...noModifiers(), left_ctrl: true, right_alt: true },
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

describe("copy/paste policy", () => {
  const enter = { Single: { Key: { Hid: "Enter" } } } as KeyAction;
  const board: ClipboardBoard = {
    cols: 2,
    layers: [["No", enter] as KeyAction[]],
    pending: {},
  };
  const selection = { type: "key", col: 1, row: 0 } as const;

  it("copies and pastes the selected key", () => {
    expect(planClipboardAction("copy", selection, 0, board)).toEqual({
      kind: "copy",
      target: { layer: 0, row: 0, col: 1, action: enter },
    });
    expect(planClipboardAction("paste", selection, 0, board).kind).toBe("paste");
  });

  it("ignores keystrokes without a shortcut, a key selection, or a key", () => {
    expect(planClipboardAction(null, selection, 0, board).kind).toBe("ignore");
    expect(planClipboardAction("copy", { type: "encoder", id: 0 }, 0, board).kind).toBe("ignore");
    expect(planClipboardAction("copy", { type: "key", row: 4, col: 0 }, 0, board).kind).toBe(
      "ignore",
    );
  });

  it("refuses to paste over a key whose write is still in flight", () => {
    const busy = { ...board, pending: { "0:0:1": { status: "pending" as const } } };
    expect(planClipboardAction("paste", selection, 0, busy).kind).toBe("blocked");
    // Copying reads what is already there, so it is never blocked.
    expect(planClipboardAction("copy", selection, 0, busy).kind).toBe("copy");
  });

  it("drops a paste whose key changed while the clipboard was read", () => {
    const target = { layer: 0, row: 0, col: 1, action: enter };
    expect(pasteStillTargets(target, board)).toBe(true);
    expect(pasteStillTargets(target, { ...board, layers: [["No", "No"]] })).toBe(false);
    expect(
      pasteStillTargets(target, {
        ...board,
        pending: { "0:0:1": { status: "pending" as const } },
      }),
    ).toBe(false);
  });
});
