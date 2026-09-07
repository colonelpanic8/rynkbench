import { describe, expect, it, vi } from "vitest";
import type { BatteryStatus, ConnectionStatus, KeyAction } from "../../vendor/rynk-wasm/rynk_wasm";
import { GLOVE80_COLS, GLOVE80_GRID } from "../../model/boards/glove80";
import { firmwarePreviewCells } from "./firmwareRules";
import {
  STOCK_LEFT_BATTERY_KEYS,
  STOCK_RIGHT_BATTERY_KEYS,
  installStockMagicLayerRules,
  sceneTableWithStockMagicLayer,
  stockMagicIndicatorKeys,
  stockMagicLayerGrid,
  stockMagicLayerRules,
  writeStockMagicLayer,
} from "./stockMagicLayer";
import { batteryBarRules } from "./statusPresets";

const at = (grid: KeyAction[], row: number, col: number) => grid[row * GLOVE80_COLS + col];
const solid = (r: number, g: number, b: number) => ({ Solid: { color: { r, g, b } } });
const battery = (level: number, charge_state: "Charging" | "Discharging" = "Discharging"): BatteryStatus =>
  ({ Available: { level, charge_state } }) as BatteryStatus;

const boardKeys = GLOVE80_GRID.flatMap((logical, grid) =>
  logical === null ? [] : [{ row: Math.floor(grid / GLOVE80_COLS), col: grid % GLOVE80_COLS }],
);

describe("stock Magic layer bindings", () => {
  it("places the factory ZMK bindings and leaves the rest unbound", () => {
    const grid = stockMagicLayerGrid(4);

    expect(at(grid, 3, 6)).toEqual({ Single: { User: 0 } });
    expect(at(grid, 4, 6)).toEqual({ Single: { User: 1 } });
    expect(at(grid, 0, 6)).toEqual({ Single: { User: 2 } });
    expect(at(grid, 1, 6)).toEqual({ Single: { User: 3 } });
    expect(at(grid, 5, 6)).toEqual({ Single: { KeyboardControl: "OutputUsb" } });
    expect(at(grid, 0, 0)).toEqual({ Single: { User: 6 } });
    expect(at(grid, 3, 0)).toEqual({ Single: { KeyboardControl: "Bootloader" } });
    expect(at(grid, 3, 13)).toEqual({ Single: { User: 12 } });
    expect(at(grid, 4, 0)).toEqual({ Single: { KeyboardControl: "Reboot" } });
    expect(at(grid, 4, 13)).toEqual({ Single: { KeyboardControl: "Reboot" } });
    expect([1, 2, 3, 4, 5].map((col) => at(grid, 2, col))).toEqual(
      ["RgbSpi", "RgbSai", "RgbHui", "BacklightUp", "RgbTog"].map((action) => ({ Single: { Light: action } })),
    );
    expect([1, 2, 3, 4, 5].map((col) => at(grid, 3, col))).toEqual(
      ["RgbSpd", "RgbSad", "RgbHud", "BacklightDown", "RgbModeForward"].map((action) => ({ Single: { Light: action } })),
    );
    expect(grid.filter((action) => action !== "No")).toHaveLength(20);
  });

  it("follows the firmware's slot count for the profile keys and clear-bond id", () => {
    const grid = stockMagicLayerGrid(3);
    expect(at(grid, 1, 6)).toBe("No");
    expect(at(grid, 0, 0)).toEqual({ Single: { User: 5 } });
  });
});

describe("stock Magic layer indicators", () => {
  const rules = stockMagicLayerRules(2, 6, 4);
  const preview = (extra: Partial<Parameters<typeof firmwarePreviewCells>[3]>) =>
    firmwarePreviewCells([], [], rules, {
      activeLayers: new Set([0, 2]),
      batteries: new Map(),
      outputMode: undefined,
      ...extra,
    });

  it("uses the devicetree LED map on the left half", () => {
    const leds = stockMagicIndicatorKeys().map((key) => key.led);
    expect(new Set(leds).size).toBe(leds.length);
    expect(leds.every((led) => led < 40)).toBe(true);
    expect(rules).toHaveLength(5 + 2 * 15 + 4 * 4 + 3);
  });

  it("shows active layers in magenta, except the always-active default", () => {
    const cells = preview({ activeLayers: new Set([0, 2, 3]) });
    expect(cells.get(35)).toBeUndefined();
    expect(cells.get(23)?.effect).toEqual(solid(255, 0, 255));
    expect(cells.get(17)?.effect).toEqual(solid(255, 0, 255));
    expect(cells.get(29)).toBeUndefined();
  });

  it("fills each half's bar like the stock firmware", () => {
    const lit = (level: number, charging = false) => {
      const cells = preview({
        batteries: new Map([[0, battery(level, charging ? "Charging" : "Discharging")]]),
      });
      return STOCK_LEFT_BATTERY_KEYS.flatMap(({ led }) => (cells.has(led) ? [cells.get(led)!.effect] : []));
    };
    expect(lit(100)).toEqual(Array(6).fill(solid(0, 255, 0)));
    expect(lit(55)).toEqual(Array(3).fill(solid(0, 255, 0)));
    expect(lit(25)).toEqual(Array(2).fill(solid(255, 255, 0)));
    expect(lit(5)).toEqual([solid(255, 0, 0)]);
    expect(lit(0)).toEqual([solid(255, 0, 0)]);
    expect(lit(5, true)).toEqual(Array(6).fill(solid(0, 255, 0)));
    const right = preview({ batteries: new Map([[1, battery(70)]]) });
    expect(STOCK_RIGHT_BATTERY_KEYS.filter(({ led }) => right.has(led))).toHaveLength(4);
  });

  it("colors profile and USB keys by pairing, connection, and output", () => {
    const connection = (ble: ConnectionStatus["ble"], usb: ConnectionStatus["usb"], preferred: "Usb" | "Ble" = "Ble") =>
      ({ ble, usb, preferred }) as ConnectionStatus;
    const unpaired = preview({ bondedSlots: new Set([1]), connection: connection({ profile: 1, state: "Connected" }, "Enabled") });
    expect(unpaired.get(3)?.effect).toEqual(solid(107, 31, 206));
    expect(unpaired.get(4)?.effect).toEqual(solid(255, 255, 255));
    expect(unpaired.get(5)?.effect).toEqual(solid(107, 31, 206));

    const usbTyping = preview({ bondedSlots: new Set([0]), connection: connection({ profile: 0, state: "Connected" }, "Configured", "Usb") });
    expect(usbTyping.get(3)?.effect).toEqual(solid(0, 255, 104));
    expect(usbTyping.get(5)?.effect).toEqual(solid(255, 255, 255));

    const idle = preview({ bondedSlots: new Set([0]), connection: connection({ profile: 1, state: "Advertising" }, "Configured", "Ble") });
    expect(idle.get(3)?.effect).toEqual(solid(255, 0, 0));
    expect(idle.get(5)?.effect).toEqual(solid(255, 255, 255));
  });

  it("replaces its own rules and keeps other layers' rules on the same keys", () => {
    const gamesW = batteryBarRules({ layer: 3, node: 0, leds: [24, 18, 12] })[0];
    const magicStray = batteryBarRules({ layer: 2, node: 1, leds: [24, 18, 12] })[0];
    const elsewhere = batteryBarRules({ layer: 2, node: 0, leds: [39, 38, 37] })[0];
    const once = installStockMagicLayerRules([gamesW, magicStray, elsewhere], 2, 6, 4);
    const twice = installStockMagicLayerRules(once, 2, 6, 4);

    expect(once.slice(0, 2)).toEqual([gamesW, elsewhere]);
    expect(once).toHaveLength(2 + rules.length);
    expect(twice).toEqual(once);
  });

  it("darkens only the left half and only its own layer's scene", () => {
    const other = { layer: 3, led_id: 24, effect: solid(160, 0, 0) };
    const stale = { layer: 2, led_id: 70, effect: solid(1, 2, 3) };
    const scenes = sceneTableWithStockMagicLayer([other, stale], 2);
    expect(scenes[0]).toEqual(other);
    expect(scenes).toHaveLength(41);
    expect(scenes.slice(1).every((cell) => cell.layer === 2 && cell.led_id < 40)).toBe(true);
    expect(scenes.slice(1).every((cell) => JSON.stringify(cell.effect) === JSON.stringify(solid(0, 0, 0)))).toBe(true);
  });
});

describe("writing the stock Magic layer", () => {
  const target = () => ({
    layer: 2,
    numLayers: 6,
    profiles: 4,
    keys: boardKeys,
    current: Array.from({ length: 84 }, () => "No" as KeyAction),
    rules: [],
    ruleCapacity: 64,
    scenes: [],
    sceneCapacity: 100,
    wakeLayers: 0,
  });

  it("writes only changed keys, then scene, rules, and wake designation", async () => {
    const calls: string[] = [];
    const current = target();
    current.current[3 * GLOVE80_COLS + 6] = { Single: { User: 0 } };
    const result = await writeStockMagicLayer(
      {
        async setKey(row, col) {
          calls.push(`key ${row},${col}`);
          return { ok: true };
        },
        async applyScenes(cells) {
          calls.push(`scenes ${cells.length}`);
          return { ok: true };
        },
        async applyRules(rules) {
          calls.push(`rules ${rules.length}`);
          return { ok: true };
        },
        async setWakeLayers(mask) {
          calls.push(`wake ${mask}`);
          return { ok: true };
        },
      },
      current,
    );

    expect(result).toEqual({ ok: true });
    expect(calls.filter((call) => call.startsWith("key"))).toHaveLength(19);
    expect(calls).not.toContain("key 3,6");
    expect(calls.slice(-3)).toEqual(["scenes 40", "rules 54", "wake 4"]);
  });

  it("skips the scene table and wake policy the firmware lacks", async () => {
    const applyScenes = vi.fn();
    const setWakeLayers = vi.fn();
    const result = await writeStockMagicLayer(
      {
        setKey: async () => ({ ok: true }),
        applyScenes,
        applyRules: async () => ({ ok: true }),
        setWakeLayers,
      },
      { ...target(), scenes: null, wakeLayers: null },
    );
    expect(result).toEqual({ ok: true });
    expect(applyScenes).not.toHaveBeenCalled();
    expect(setWakeLayers).not.toHaveBeenCalled();
  });

  it("refuses before writing when the rule table is too small", async () => {
    const setKey = vi.fn();
    const result = await writeStockMagicLayer(
      { setKey, applyScenes: vi.fn(), applyRules: vi.fn(), setWakeLayers: vi.fn() },
      { ...target(), ruleCapacity: 32 },
    );
    expect(result).toEqual({ ok: false, message: "This layout needs 54 rules; the keyboard holds 32." });
    expect(setKey).not.toHaveBeenCalled();
  });

  it("stops at a failed key and reports a later lighting failure as resumable", async () => {
    let writes = 0;
    const applyScenes = vi.fn();
    const keyFailure = await writeStockMagicLayer(
      {
        async setKey() {
          writes++;
          return writes === 2 ? { ok: false, message: "flash busy" } : { ok: true };
        },
        applyScenes,
        applyRules: vi.fn(),
        setWakeLayers: vi.fn(),
      },
      target(),
    );
    expect(keyFailure).toEqual({ ok: false, message: "flash busy" });
    expect(writes).toBe(2);
    expect(applyScenes).not.toHaveBeenCalled();

    const ruleFailure = await writeStockMagicLayer(
      {
        setKey: async () => ({ ok: true }),
        applyScenes: async () => ({ ok: true }),
        applyRules: async () => ({ ok: false, message: "read-back mismatch" }),
        setWakeLayers: vi.fn(),
      },
      target(),
    );
    expect(ruleFailure).toEqual({
      ok: false,
      message: "The keys were written, but installing the indicators failed: read-back mismatch. Retry to finish.",
    });
  });
});
