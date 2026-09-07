import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { initSync } from "../vendor/moergo-config-wasm/moergo_config_wasm";
import { parseDocument, type RuntimeSnapshot } from "./document";
import { migrationDraft } from "./migration";

const catalog = { effects: [], palettes: [], params: [] };
beforeAll(() => initSync({ module: readFileSync("src/vendor/moergo-config-wasm/moergo_config_wasm_bg.wasm") }));
function source(rows: number): RuntimeSnapshot {
  return {
    rows, cols: 14, default_layer: 0, bluetooth_name: "Original",
    layers: [Array.from({ length: rows * 14 }, () => "Transparent")],
    lighting: undefined, behaviors: undefined,
  };
}

describe("standalone board migration", () => {
  it.each([5, 6])("renders and validates the peer board from %i rows without changing the source", (rows) => {
    const snapshot = source(rows);
    const homeRow = rows === 6 ? 3 : 2;
    snapshot.layers[0][homeRow * 14 + 1] = { Single: { User: 12 } };
    const original = structuredClone(snapshot);
    const draft = migrationDraft(snapshot, catalog);
    const parsed = parseDocument(draft.text, catalog).snapshot;
    const targetRows = rows === 6 ? 5 : 6;
    expect(parsed.rows).toBe(targetRows);
    expect(parsed.layers[0]).toHaveLength(targetRows * 14);
    expect(parsed.layers[0][(targetRows === 6 ? 3 : 2) * 14 + 1]).toEqual({ Single: { User: 12 } });
    expect(parsed.bluetooth_name).toBeUndefined();
    expect(snapshot).toEqual(original);
    if (targetRows === 6) expect(parsed.layers[0][0]).toBe("Transparent");
  });
  it("reports lost function keys", () => {
    const snapshot = source(6);
    snapshot.layers[0][0] = { Single: { User: 12 } };
    expect(migrationDraft(snapshot, catalog).notes.some(note => note.location?.includes("[0, 0]"))).toBe(true);
  });
  it("moves positional combos and disables an entire combo if an input is lost", () => {
    const snapshot = source(6);
    snapshot.behaviors = {
      config: undefined, options: undefined, morse_profiles: undefined,
      hold_trigger_positions: undefined, auto_mouse_layers: undefined,
      morses: undefined, forks: undefined, macros: undefined,
      combos: [
        { Positions: { positions: [{ row: 3, col: 1 }, { row: 3, col: 2 }], output: { Single: { User: 1 } }, layer: 0 } },
        { Positions: { positions: [{ row: 0, col: 0 }, { row: 3, col: 2 }], output: { Single: { User: 2 } }, layer: 0 } },
      ],
    };
    const draft = migrationDraft(snapshot, catalog);
    const parsed = parseDocument(draft.text, catalog).snapshot;
    expect(parsed.behaviors?.combos?.[0]).toEqual({
      Positions: { positions: [{ row: 2, col: 1 }, { row: 2, col: 2 }], output: { Single: { User: 1 } }, layer: 0 },
    });
    expect(draft.notes.some(note => note.message.includes("Disabled"))).toBe(true);
  });
  it("refuses to empty a profile's hold-trigger policy", () => {
    const snapshot = source(6);
    snapshot.behaviors = {
      config: undefined, options: undefined, morse_profiles: undefined,
      hold_trigger_positions: [{ profile: 0, row: 0, col: 0 }], auto_mouse_layers: undefined,
      morses: undefined, forks: undefined, macros: undefined, combos: undefined,
    };
    expect(() => migrationDraft(snapshot, catalog)).toThrow(/lose all hold-trigger positions/);
  });

});
