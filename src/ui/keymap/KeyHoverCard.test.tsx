import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { testWorkbench } from "../../test/workbench";
import type { KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import type { KeyView } from "../../model/keyboard";
import { WorkbenchContext } from "../state";
import { KeyHoverCard } from "./KeyHoverCard";

const key = { row: 0, col: 1, address: "LH-C5R1" } as unknown as KeyView;

function card(binding: KeyAction, combos: Array<{ Positions: { positions: Array<{ row: number; col: number }>; output: "No" } }> = []) {
  const workbench = testWorkbench({
    bundle: { caps: { num_cols: 2 } },
    state: { uiLayer: 0, layers: [["No", binding]], combos },
  });
  return renderToStaticMarkup(
    <WorkbenchContext value={workbench}>
      <KeyHoverCard keyView={key} />
    </WorkbenchContext>,
  );
}

describe("key hover card", () => {
  it("names the key and says what a plain key does", () => {
    const html = card({ Single: { Key: { Hid: "A" } } } as unknown as KeyAction);
    expect(html).toContain("LH-C5R1");
    expect(html).toContain("Key · A");
  });

  it("splits a tap-hold into tapped and held", () => {
    const html = card({ TapHold: [{ Key: { Hid: "A" } }, { LayerOn: 1 }, 255] } as unknown as KeyAction);
    expect(html).toContain("When tapped");
    expect(html).toContain("When held");
  });

  it("counts the combos the key is part of", () => {
    const combos: Parameters<typeof card>[1] = [
      { Positions: { positions: [{ row: 0, col: 1 }, { row: 0, col: 0 }], output: "No" } },
      { Positions: { positions: [{ row: 0, col: 0 }], output: "No" } },
    ];
    expect(card("No", combos)).toContain("In 1 combo");
  });
});
