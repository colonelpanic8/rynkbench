import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { testWorkbench } from "../../test/workbench";
import type { KeyAction, Morse } from "../../vendor/rynk-wasm/rynk_wasm";
import { DOUBLE_TAP_PATTERN, TAP_PATTERN } from "../../model/key-slots";
import { emptyMorse } from "../../model/slots";
import { WorkbenchContext } from "../state";
import { KeyEditor } from "./KeyEditor";

const A = { Single: { Key: { Hid: "A" } } } as unknown as KeyAction;
const TAP_HOLD = { TapHold: [{ Key: { Hid: "A" } }, { Modifier: { left_shift: true } }, 255] } as unknown as KeyAction;

const B = { Key: { Hid: "B" } };
const DOUBLE_TAP: Morse = { ...emptyMorse(), actions: [[TAP_PATTERN, { Key: { Hid: "A" } }], [DOUBLE_TAP_PATTERN, B]] } as Morse;

function editor(binding: KeyAction | null, { morse = [] as Morse[], morseSlots = 0 } = {}) {
  const workbench = testWorkbench({
    bundle: {
      caps: { num_cols: 2, num_layers: 2, max_morse: morseSlots, max_patterns_per_key: 8 },
      model: { keys: [{ row: 0, col: 0, address: "LH-C1R1" }] },
      session: { kind: "offline" },
      lightingState: null,
      sceneStatus: null,
      compiledSceneStatus: null,
      lightingExtension: null,
      pointingConfig: null,
      runtimeConditionalStatus: null,
      lightingOutputMode: null,
    },
    state: {
      selection: binding ? { type: "key", row: 0, col: 0 } : null,
      uiLayer: 0,
      layers: [[binding ?? "No", "No"]],
      pending: {},
      layerMetadata: [{ occupied: true, name: "Base" }, { occupied: true, name: "Lower" }],
      morseProfiles: [],
      morse,
    },
    dispatch: () => {},
    io: {},
  });
  return renderToStaticMarkup(
    <WorkbenchContext value={workbench}>
      <KeyEditor />
    </WorkbenchContext>,
  );
}

describe("key editor", () => {
  it("points at the keyboard when no key is selected", () => {
    expect(editor(null)).toContain("Click a key on the keyboard to change what it does");
  });

  it("shows a plain key's On Tap and offers an On Hold", () => {
    const html = editor(A);
    expect(html).toContain("Left hand · row 1, column 1");
    expect(html).toContain("On Tap:");
    expect(html).toMatch(/On Tap:<\/span><span[^>]*>A<\/span>/);
    expect(html).toContain("On Hold");
    expect(html).not.toContain("Hold timing");
  });

  it("shows a tap-hold's two slots and its timing", () => {
    const html = editor(TAP_HOLD);
    expect(html).toContain("Clear On Hold");
    expect(html).toContain("Hold timing");
    expect(html).toContain("The keyboard&#x27;s default");
  });

  it("offers On Double Tap only on a keyboard that can do one", () => {
    expect(editor(A)).not.toContain("On Double Tap");
    expect(editor(A, { morseSlots: 4 })).toContain("On Double Tap");
  });

  it("shows a key bound to a morse entry of tap and tap-tap as its slots", () => {
    const html = editor({ Morse: 0 } as KeyAction, { morse: [DOUBLE_TAP], morseSlots: 4 });
    expect(html).toContain("Clear On Double Tap");
    expect(html).toMatch(/On Double Tap:<\/span><span[^>]*>B<\/span>/);
    expect(html).not.toContain("Behaviors → Morse");
  });

  it("opens on Pick Key with GLIDE's quick links", () => {
    const html = editor(A);
    expect(html).toContain("Pick Key");
    expect(html).toContain("Search keys, symbols, layers");
    for (const chip of ["Letters", "Numbers", "Symbols", "Navigation", "Media", "Device"]) expect(html).toContain(chip);
  });
});
