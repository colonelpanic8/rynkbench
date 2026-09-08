import { describe, expect, it, vi } from "vitest";
import { firmwarePreviewCells } from "./firmwareRules";
import { installedLightingKeyKind, lightingKeyAction, lightingKeyRules, replaceLightingKeyRules, writeLightingKeyPreset } from "./lightingKeyPresets";
import type { LightingKeyPreset } from "./lightingKeyPresets";
import { usbStatusRules } from "./statusPresets";

const preset: LightingKeyPreset = { kind: "output-mode", layer: 2, row: 2, col: 5, led: 6 };

describe("lighting control key presets", () => {
  it.each([
    ["AlwaysOn", { r: 0, g: 128, b: 0 }],
    ["AlwaysOff", { r: 128, g: 0, b: 0 }],
    ["PoweredOnly", { r: 0, g: 64, b: 160 }],
  ] as const)("pairs the cycle action with its %s indicator on the selected key and layer", (outputMode, color) => {
    expect(lightingKeyAction(preset.kind)).toEqual({ Single: { Light: "OutputModeCycle" } });
    const preview = { activeLayers: new Set([0, 2]), batteries: new Map(), outputMode };
    const rules = lightingKeyRules(preset);
    expect(firmwarePreviewCells([], [], rules, preview).get(6)?.effect).toEqual({ Solid: { color } });
    expect(firmwarePreviewCells([], [], rules, { ...preview, activeLayers: new Set([0]) }).size).toBe(0);
  });

  it.each([true, false])("pairs the effects toggle with its enabled=%s indicator", (effectsEnabled) => {
    const effectPreset: LightingKeyPreset = { ...preset, kind: "effects", layer: 4, led: 19 };
    expect(lightingKeyAction(effectPreset.kind)).toEqual({ Single: { Light: "RgbTog" } });
    const cells = firmwarePreviewCells([], [], lightingKeyRules(effectPreset), {
      activeLayers: new Set([4]), batteries: new Map(), outputMode: "AlwaysOn", effectsEnabled,
    });
    expect(cells.get(19)?.effect).toEqual({ Solid: { color: effectsEnabled ? { r: 0, g: 128, b: 0 } : { r: 128, g: 0, b: 0 } } });
  });

  it("replaces a control idempotently, including switching kinds, without removing other keys or layers", () => {
    const unrelated = [
      ...lightingKeyRules({ ...preset, layer: 1 }),
      ...lightingKeyRules({ ...preset, led: 7 }),
      ...usbStatusRules(2, 6),
    ];
    const first = replaceLightingKeyRules(unrelated, preset);
    expect(replaceLightingKeyRules(first, preset)).toEqual(first);
    const effects: LightingKeyPreset = { ...preset, kind: "effects" };
    expect(replaceLightingKeyRules(first, effects)).toEqual([...unrelated, ...lightingKeyRules(effects)]);
  });

  it("refuses insufficient capacity before writing either half of the preset", async () => {
    const writer = { setKey: vi.fn(), applyRules: vi.fn() };
    expect(await writeLightingKeyPreset(writer, [], preset, 2)).toMatchObject({ ok: false });
    expect(writer.setKey).not.toHaveBeenCalled();
    expect(writer.applyRules).not.toHaveBeenCalled();
  });

  it("writes both behavior and rules for the same selected key, in order", async () => {
    const calls: string[] = [];
    const writer = {
      setKey: vi.fn(async () => { calls.push("key"); return { ok: true as const }; }),
      applyRules: vi.fn(async () => { calls.push("rules"); return { ok: true as const }; }),
    };
    expect(await writeLightingKeyPreset(writer, [], preset, 3)).toEqual({ ok: true });
    expect(calls).toEqual(["key", "rules"]);
    expect(writer.setKey).toHaveBeenCalledWith(preset, { Single: { Light: "OutputModeCycle" } });
    expect(writer.applyRules).toHaveBeenCalledWith(lightingKeyRules(preset));
  });

  it("does not write lighting if the binding fails", async () => {
    const writer = {
      setKey: vi.fn(async () => ({ ok: false as const, message: "locked" })),
      applyRules: vi.fn(),
    };
    expect(await writeLightingKeyPreset(writer, [], preset, 3)).toEqual({ ok: false, message: "locked" });
    expect(writer.applyRules).not.toHaveBeenCalled();
  });

  it.each([false, true])("reports a partially installed preset when lighting fails (throws=%s)", async (throws) => {
    const writer = {
      setKey: vi.fn(async () => ({ ok: true as const })),
      applyRules: vi.fn(async () => {
        if (throws) throw new Error("disconnected");
        return { ok: false as const, message: "readback mismatch" };
      }),
    };
    const result = await writeLightingKeyPreset(writer, [], preset, 3);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("key action was written") });
  });
});

describe("installedLightingKeyKind", () => {
  it("reports the preset whose rules sit on the key and layer", () => {
    const preset = { kind: "effects" as const, layer: 2, row: 1, col: 1, led: 9 };
    const rules = replaceLightingKeyRules([], preset);
    expect(installedLightingKeyKind(rules, 9, 2)).toBe("effects");
    expect(installedLightingKeyKind(rules, 9, 1)).toBeNull();
    expect(installedLightingKeyKind(rules, 8, 2)).toBeNull();
    const cycled = replaceLightingKeyRules(rules, { ...preset, kind: "output-mode" });
    expect(installedLightingKeyKind(cycled, 9, 2)).toBe("output-mode");
  });
});
