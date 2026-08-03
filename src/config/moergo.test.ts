import { describe, expect, it } from "vitest";
import type { KeyAction } from "../vendor/rynk-wasm/rynk_wasm";
import { MOERGO_TO_MATRIX, parseMoergoJson, serializeMoergoJson } from "./moergo";

const none = (): Record<string, unknown>[] =>
  Array.from({ length: 80 }, () => ({ value: "&none" }));

describe("MoErgo Layout Editor JSON", () => {
  it("maps the physical 80-key walk onto all non-hole matrix cells", () => {
    expect(new Set(MOERGO_TO_MATRIX).size).toBe(80);
    expect([...MOERGO_TO_MATRIX].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 84 }, (_, n) => n).filter((n) => ![5, 8, 75, 78].includes(n)),
    );
  });

  it("imports wrapped JSON, built-ins, and shifted/mod-tap keycodes", () => {
    const base = none();
    base[0] = { value: "&kp", params: [{ value: "F1", params: [] }] };
    base[52] = { value: "&mt", params: [{ value: "LSHFT" }, { value: "A" }] };
    base[54] = { value: "&magic" };
    base[79] = { value: "&rgb_ug", params: [{ value: "RGB_TOG" }] };
    const result = parseMoergoJson(JSON.stringify({ keymap: {
      keyboard: "glove80", title: "Keep", layer_names: ["Base", "Magic"], layers: [base, none()],
    } }), 6, 14);
    expect(result.layers[0][0]).toEqual({ Single: { Key: { Hid: "F1" } } });
    expect(result.layers[0][6]).toEqual({ TapHold: [
      { Key: { Hid: "A" } },
      { Modifier: { left_ctrl: false, left_shift: true, left_alt: false, left_gui: false,
        right_ctrl: false, right_shift: false, right_alt: false, right_gui: false } },
      200,
    ] });
    expect(result.layers[0][34]).toEqual({ Single: { LayerOn: 1 } });
    expect(result.layers[0][83]).toEqual({ Single: { Light: "RgbTog" } });
    expect(result.template.keymap).toMatchObject({ title: "Keep" });
  });

  it("round-trips representable actions while preserving editor-only metadata", () => {
    const layer = Array<KeyAction>(84).fill("No");
    layer[0] = { Single: { Key: { Hid: "A" } } };
    layer[6] = { TapHold: [{ Key: { Hid: "Escape" } }, { LayerOn: 1 }, 200] };
    layer[83] = { Single: { User: 12 } };
    const template = { keymap: { keyboard: "glove80", title: "Keep", combos: [{ name: "kept" }], layer_names: ["Base"], layers: [none()] } };
    const text = serializeMoergoJson([layer], { template });
    const value = JSON.parse(text);
    expect(value.keymap.title).toBe("Keep");
    expect(value.keymap.combos).toEqual([{ name: "kept" }]);
    expect(value.keymap.layers[0]).toHaveLength(80);
    expect(parseMoergoJson(text, 6, 14).layers).toEqual([layer]);
  });

  it("names the exact key for unsupported custom behavior", () => {
    const base = none();
    base[52] = { value: "&my_macro" };
    expect(() => parseMoergoJson(JSON.stringify({
      keyboard: "glove80", layer_names: ["Base"], layers: [base],
    }), 6, 14)).toThrow("layer 0, editor key 52 (r0,c6) behavior '&my_macro'");
  });
});
