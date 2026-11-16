import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ComboDefinition, KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { testWorkbench } from "../../test/workbench";
import { mockProvider } from "../../session/mock/board";
import { glove80Board } from "../../session/mock/glove80";
import type { RynkSession } from "../../session/types";
import { emptyCombo } from "../../model/slots";
import { openBundle } from "../bundle";
import { initialWorkbenchState, type ConnectedBundle } from "../../workbench";
import { WorkbenchContext } from "../state";
import { ComboList } from "../sidepanel/ComboList";
import { ComboEditor } from "./ComboEditor";
import { ComboFocusCanvas } from "./ComboFocusCanvas";
import { useComboFocus } from "./useComboFocus";

const ESC = { Single: { Key: { Hid: "Escape" } } } as unknown as KeyAction;
const combo = (keys: number, output: KeyAction = ESC): ComboDefinition => ({
  Positions: { positions: Array.from({ length: keys }, (_, col) => ({ row: 1, col })), output, layer: undefined },
});

let session: RynkSession;
let bundle: ConnectedBundle;
beforeAll(async () => {
  session = await mockProvider(glove80Board).connect();
  bundle = await openBundle(session);
});
afterAll(() => session.close());

function Focus() {
  const focus = useComboFocus();
  return focus ? (
    <>
      <ComboFocusCanvas focus={focus} />
      <ComboEditor focus={focus} size={300} />
    </>
  ) : null;
}

function render(node: ReactNode, combos: ComboDefinition[], open: number | null) {
  const state = initialWorkbenchState(bundle);
  const all = state.combos.map((_, i) => combos[i] ?? emptyCombo());
  const value = testWorkbench({
    bundle,
    state: { ...state, combos: all, selection: open === null ? null : { type: "combo", index: open } },
  });
  return renderToStaticMarkup(<WorkbenchContext value={value}>{node}</WorkbenchContext>);
}

describe("combos in Focus Mode", () => {
  it("marks the combo's keys and says what it still needs", () => {
    const html = render(<Focus />, [combo(1)], 0);
    expect(html).toContain("Focus Mode: click keys to toggle");
    expect(html).toContain(`1 of ${bundle.caps.max_combo_keys} keys`);
    expect(html).toContain("Needs at least 2 keys");
    expect(html).toContain("Discard combo");
    expect(html).toContain("Done Editing");
  });

  it("needs nothing once it has two keys and an action", () => {
    const html = render(<Focus />, [combo(2)], 0);
    expect(html).not.toContain('data-testid="combo-needs"');
    expect(html).not.toContain("Discard combo");
  });

  it("opens a new combo with nothing in it", () => {
    const html = render(<Focus />, [], 0);
    expect(html).toContain("0 of");
    expect(html).toContain("Combo C0");
    expect(html).toContain("Every layer");
  });

  it("warns about a combo on the same keys as another", () => {
    expect(render(<Focus />, [combo(2), combo(2)], 1)).toContain("Same keys as C0");
  });

  it("shows nothing outside Focus Mode", () => {
    expect(render(<Focus />, [combo(2)], null)).toBe("");
  });
});

describe("the combo list", () => {
  it("lists combos with their warnings and outlines the one being edited", () => {
    const html = render(<ComboList />, [combo(2), combo(2, "No"), combo(1)], 1);
    expect(html.match(/data-testid="combo-row"/g)).toHaveLength(3);
    expect(html).toContain("No action");
    expect(html).toContain("Needs another key");
    expect(html).toContain('aria-current="true"');
  });

  it("shows each combo as a card with a small keyboard and its layers", () => {
    const html = render(<ComboList />, [combo(2)], null);
    expect(html).toContain("var(--color-accent-fill)");
    expect(html).toContain("All Layers");
    expect(html).toContain('aria-label="Search combos"');
  });

  it("explains why Create is unavailable when every combo is in use", () => {
    const full = Array.from({ length: bundle.caps.max_combos }, () => combo(2));
    expect(render(<ComboList />, full, null)).toContain(`All ${bundle.caps.max_combos} combos are in use`);
  });
});
