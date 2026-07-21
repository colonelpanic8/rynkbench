import { describe, expect, it } from "vitest";
import type { Combo, Morse, TopicEvent } from "../../vendor/rynk-wasm/rynk_wasm";
import type { RynkSession } from "../types";
import { buildKeyboardModel } from "../../model/keyboard";
import { enrichmentFor } from "../../model/boards";
import { mockProviders } from "./index";
import { glove80Board } from "./glove80";
import { ortho60Board } from "./ortho60";
import { mockProvider, type BoardSpec } from "./board";

const boards: Array<[string, BoardSpec]> = [
  ["Glove80", glove80Board],
  ["Ortho 60", ortho60Board],
];

async function withSession(
  spec: BoardSpec,
  run: (session: RynkSession) => Promise<void>,
): Promise<void> {
  const session = await mockProvider(spec).connect();
  try {
    await run(session);
  } finally {
    await session.close();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.each(boards)("%s topology", (_name, spec) => {
  const { topology, capabilities, layout } = spec;

  it("keeps every LED zone span inside the membership table, over known zones", () => {
    const zoneIds = new Set(topology.zones.map((zone) => zone.id));
    for (const led of topology.leds) {
      expect(led.zone_start + led.zone_len).toBeLessThanOrEqual(topology.zoneMemberships.length);
      for (const member of topology.zoneMemberships.slice(led.zone_start, led.zone_start + led.zone_len)) {
        expect(zoneIds.has(member)).toBe(true);
      }
    }
  });

  it("routes every LED exactly once, with unique wiring per node/output", () => {
    const ledIds = new Set(topology.leds.map((led) => led.id));
    expect(new Set(topology.routes.map((route) => route.led_id)).size).toBe(topology.routes.length);
    const wiring = new Set<string>();
    for (const route of topology.routes) {
      expect(ledIds.has(route.led_id)).toBe(true);
      const slot = `${route.node}/${route.output}/${route.physical_index}`;
      expect(wiring.has(slot)).toBe(false);
      wiring.add(slot);
    }
  });

  it("keeps matrix positions within capabilities dims", () => {
    const check = (row: number, col: number) => {
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(capabilities.num_rows);
      expect(col).toBeGreaterThanOrEqual(0);
      expect(col).toBeLessThan(capabilities.num_cols);
    };
    for (const led of topology.leds) {
      expect(led.key).toBeDefined();
      check(led.key!.row, led.key!.col);
    }
    for (const physical of topology.physicalKeys) check(physical.matrix.row, physical.matrix.col);
  });

  it("gives every layout key a unique matrix position, backed by an LED", () => {
    const variant = layout.variants[layout.default_variant];
    const seen = new Set<string>();
    const ledAt = new Set(topology.leds.map((led) => `${led.key!.row},${led.key!.col}`));
    for (const key of variant.keys) {
      const at = `${key.row},${key.col}`;
      expect(seen.has(at)).toBe(false);
      seen.add(at);
      expect(ledAt.has(at)).toBe(true);
    }
    expect(variant.keys.length).toBe(topology.leds.length);
  });

  it("reports lighting capabilities consistent with the topology", async () => {
    await withSession(spec, async (session) => {
      const caps = await session.lighting.capabilities();
      expect(caps.led_count).toBe(topology.leds.length);
      expect(caps.route_count).toBe(topology.routes.length);
      expect(caps.zone_count).toBe(topology.zones.length);
      expect(caps.zone_membership_count).toBe(topology.zoneMemberships.length);
      expect(caps.topology_revision).toBe(topology.revision);
    });
  });
});

describe("keymap", () => {
  it("round-trips setKey through readAll", async () => {
    await withSession(glove80Board, async (session) => {
      const caps = await session.device.capabilities();
      const before = await session.keymap.readAll();
      expect(before).toHaveLength(caps.num_layers);
      for (const layer of before) expect(layer.actions).toHaveLength(caps.num_rows * caps.num_cols);
      expect(before[0].actions[2 * caps.num_cols + 1]).toEqual({ Single: { Key: { Hid: "Q" } } });
      expect(before[1].actions[2 * caps.num_cols + 1]).toBe("Transparent");

      await session.keymap.setKey(0, 2, 1, { Single: { Key: { Hid: "X" } } });
      const after = await session.keymap.readAll();
      expect(after[0].actions[2 * caps.num_cols + 1]).toEqual({ Single: { Key: { Hid: "X" } } });
      // Other layers untouched.
      expect(after[1].actions[2 * caps.num_cols + 1]).toBe("Transparent");
    });
  });

  it("rejects out-of-range writes", async () => {
    await withSession(ortho60Board, async (session) => {
      await expect(session.keymap.setKey(0, 5, 0, "No")).rejects.toThrow(/out of range/);
      await expect(session.keymap.setKey(9, 0, 0, "No")).rejects.toThrow(/out of range/);
    });
  });

  it("round-trips encoder actions on the Ortho 60", async () => {
    await withSession(ortho60Board, async (session) => {
      const initial = await session.keymap.getEncoder(0, 0);
      expect(initial.clockwise).toEqual({ Single: { Key: { Hid: "AudioVolUp" } } });
      const next = { clockwise: { Single: { Key: { Hid: "BrightnessUp" } } }, counter_clockwise: { Single: { Key: { Hid: "BrightnessDown" } } } } as const;
      await session.keymap.setEncoder(0, 0, next);
      expect(await session.keymap.getEncoder(0, 0)).toEqual(next);
      // The Glove80 has none.
      const glove = await mockProvider(glove80Board).connect();
      await expect(glove.keymap.getEncoder(0, 0)).rejects.toThrow(/out of range/);
      await glove.close();
    });
  });

  it("pushes LayerChange when the default layer changes", async () => {
    await withSession(ortho60Board, async (session) => {
      const events: TopicEvent[] = [];
      session.onTopic((event) => events.push(event));
      expect(await session.keymap.defaultLayer()).toBe(0);
      await session.keymap.setDefaultLayer(1);
      expect(await session.keymap.defaultLayer()).toBe(1);
      expect(await session.keymap.currentLayer()).toBe(1);
      expect(await session.keymap.layerState()).toEqual({
        defaultLayer: 1,
        activeLayers: [1],
        complete: true,
      });
      expect(events).toContainEqual({ LayerChange: 1 });
    });
  });
});

describe("lighting overlay", () => {
  const cellFor = (led_id: number, ttl_ms?: number) => ({
    led_id,
    effect: { Solid: { color: { r: 255, g: 64, b: 0 } } },
    ttl_ms,
  });

  it("round-trips replace/read/clear with revision bumps and pushes", async () => {
    await withSession(glove80Board, async (session) => {
      const events: TopicEvent[] = [];
      session.onTopic((event) => events.push(event));

      const initial = await session.lighting.state();
      expect(initial.overlay_len).toBe(0);
      expect(initial.background.enabled).toBe(true);

      const replaced = await session.lighting.replaceOverlay([cellFor(0), cellFor(41)]);
      expect(replaced.overlay_len).toBe(2);
      expect(replaced.revision).toBeGreaterThan(initial.revision);

      const readBack = await session.lighting.readOverlay();
      expect(readBack.map((cell) => cell.led_id).sort((a, b) => a - b)).toEqual([0, 41]);
      expect(readBack[0].effect).toEqual(cellFor(0).effect);

      const cleared = await session.lighting.clearOverlay();
      expect(cleared.overlay_len).toBe(0);
      expect(cleared.revision).toBeGreaterThan(replaced.revision);
      expect(await session.lighting.readOverlay()).toEqual([]);

      expect(events.filter((event) => "LightingChange" in event).length).toBe(2);
    });
  });

  it("rejects unknown LEDs and zero TTLs", async () => {
    await withSession(ortho60Board, async (session) => {
      await expect(session.lighting.replaceOverlay([cellFor(999)])).rejects.toThrow(/unknown LED/);
      await expect(session.lighting.replaceOverlay([cellFor(0, 0)])).rejects.toThrow(/TTL/);
    });
  });

  it("expires TTL cells and announces the change", async () => {
    await withSession(ortho60Board, async (session) => {
      const events: TopicEvent[] = [];
      session.onTopic((event) => events.push(event));
      const replaced = await session.lighting.replaceOverlay([cellFor(3, 30), cellFor(4)]);
      expect(replaced.overlay_len).toBe(2);
      await sleep(120);
      const remaining = await session.lighting.readOverlay();
      expect(remaining.map((cell) => cell.led_id)).toEqual([4]);
      expect((await session.lighting.state()).overlay_len).toBe(1);
      expect(events.filter((event) => "LightingChange" in event).length).toBe(2);
    });
  });
});

describe("lighting scenes", () => {
  const sceneCell = (layer: number, led_id: number) => ({
    layer,
    led_id,
    effect: { Solid: { color: { r: 0, g: 128, b: 255 } } },
  });

  it("reports status and the seeded number-row scene on the Glove80", async () => {
    await withSession(glove80Board, async (session) => {
      const status = await session.lighting.scenes.sceneStatus();
      expect(status.capacity).toBe(256);
      expect(status.policy).toBe("EffectiveOnly");
      expect(status.chunk_capacity).toBeGreaterThan(0);
      const cells = await session.lighting.scenes.readScenes();
      expect(cells).toHaveLength(status.scene_len);
      expect(cells.length).toBe(10);
      expect(cells.every((cell) => cell.layer === 1)).toBe(true);
      // Advertised via the LAYER_SCENES feature bit too.
      expect((await session.lighting.capabilities()).features & (1 << 6)).not.toBe(0);
    });
  });

  it("reports immutable compiled defaults separately from runtime scenes", async () => {
    await withSession(glove80Board, async (session) => {
      const status = await session.lighting.scenes.compiledStatus();
      const cells = await session.lighting.scenes.readCompiledScenes();
      expect(status.topology_revision).toBe(glove80Board.topology.revision);
      expect(status.scene_len).toBe(cells.length);
      expect(status.policy).toBe("EffectiveOnly");
      expect(cells).toContainEqual({
        layer: 0,
        led_id: 0,
        effect: { Solid: { color: { r: 0, g: 0, b: 255 } } },
      });
      expect((await session.lighting.capabilities()).features & (1 << 8)).not.toBe(0);
      expect((await session.lighting.scenes.readScenes()).some((cell) => cell.led_id === 0)).toBe(
        false,
      );
    });
  });

  it("round-trips replaceScenes with a revision bump and a LightingChange push", async () => {
    await withSession(glove80Board, async (session) => {
      const events: TopicEvent[] = [];
      session.onTopic((event) => events.push(event));
      const before = await session.lighting.scenes.sceneStatus();
      const next = [sceneCell(0, 0), sceneCell(2, 41)];
      const state = await session.lighting.scenes.replaceScenes(next);
      expect(state.revision).toBeGreaterThan(before.revision);
      const readBack = await session.lighting.scenes.readScenes();
      expect(readBack).toHaveLength(2);
      expect(readBack).toContainEqual(next[0]);
      expect(readBack).toContainEqual(next[1]);
      expect((await session.lighting.scenes.sceneStatus()).scene_len).toBe(2);
      expect(events.filter((event) => "LightingChange" in event).length).toBe(1);
    });
  });

  it("round-trips the layer policy with a revision bump", async () => {
    await withSession(glove80Board, async (session) => {
      const before = await session.lighting.scenes.sceneStatus();
      const state = await session.lighting.scenes.setLayerPolicy("ActiveStack");
      expect(state.revision).toBeGreaterThan(before.revision);
      expect((await session.lighting.scenes.sceneStatus()).policy).toBe("ActiveStack");
    });
  });

  it("rejects unknown layers, unknown LEDs, and over-capacity tables untouched", async () => {
    await withSession(glove80Board, async (session) => {
      const caps = await session.device.capabilities();
      await expect(
        session.lighting.scenes.replaceScenes([sceneCell(caps.num_layers, 0)]),
      ).rejects.toThrow(/layer .* out of range/);
      await expect(session.lighting.scenes.replaceScenes([sceneCell(0, 999)])).rejects.toThrow(
        /unknown LED/,
      );
      const status = await session.lighting.scenes.sceneStatus();
      const tooMany = Array.from({ length: status.capacity + 1 }, () => sceneCell(0, 0));
      await expect(session.lighting.scenes.replaceScenes(tooMany)).rejects.toThrow(/capacity/);
      // Failed writes leave the seeded table intact.
      expect((await session.lighting.scenes.readScenes()).length).toBe(10);
    });
  });

  it("rejects every scene op on the pre-scene Ortho 60", async () => {
    await withSession(ortho60Board, async (session) => {
      expect((await session.lighting.capabilities()).features & (1 << 6)).toBe(0);
      await expect(session.lighting.scenes.sceneStatus()).rejects.toThrow(/does not support/);
      await expect(session.lighting.scenes.readScenes()).rejects.toThrow(/does not support/);
      await expect(session.lighting.scenes.replaceScenes([])).rejects.toThrow(/does not support/);
      await expect(session.lighting.scenes.setLayerPolicy("ActiveStack")).rejects.toThrow(
        /does not support/,
      );
      await expect(session.lighting.scenes.compiledStatus()).rejects.toThrow(/does not support/);
      await expect(session.lighting.scenes.readCompiledScenes()).rejects.toThrow(/does not support/);
    });
  });
});

describe("lighting state", () => {
  it("applies setState with a revision bump and a LightingChange push", async () => {
    await withSession(glove80Board, async (session) => {
      const events: TopicEvent[] = [];
      session.onTopic((event) => events.push(event));
      const before = await session.lighting.state();
      const next = {
        output_enabled: false,
        output_brightness: 42,
        background: { enabled: false, hue: 10, saturation: 20, value: 30, speed: 5, mode: "Breathe" },
      } as const;
      const applied = await session.lighting.setState(next);
      expect(applied.revision).toBeGreaterThan(before.revision);
      expect(applied.output_enabled).toBe(false);
      expect(applied.output_brightness).toBe(42);
      expect(applied.background).toEqual(next.background);
      expect(await session.lighting.state()).toEqual(applied);
      expect(events.filter((event) => "LightingChange" in event).length).toBe(1);
    });
  });
});

describe("combo slots", () => {
  it("sizes the table from capabilities, seeds J+K → Escape, leaves the rest empty", async () => {
    await withSession(glove80Board, async (session) => {
      const caps = await session.device.capabilities();
      const combos = await session.combos.readAll();
      expect(combos).toHaveLength(caps.max_combos);
      expect(combos[0]).toEqual({
        actions: [{ Single: { Key: { Hid: "J" } } }, { Single: { Key: { Hid: "K" } } }],
        output: { Single: { Key: { Hid: "Escape" } } },
        layer: undefined,
      });
      for (const combo of combos.slice(1)) {
        expect(combo.output).toBe("No");
        expect(combo.actions).toEqual([]);
      }
    });
  });

  it("round-trips a slot write and enforces slot/key bounds", async () => {
    await withSession(ortho60Board, async (session) => {
      const caps = await session.device.capabilities();
      expect((await session.combos.readAll()).every((combo) => combo.output === "No")).toBe(true);
      const combo: Combo = {
        actions: [{ Single: { Key: { Hid: "D" } } }, { Single: { Key: { Hid: "F" } } }],
        output: { Single: { Key: { Hid: "Tab" } } },
        layer: 0,
      };
      await session.combos.set(1, combo);
      expect((await session.combos.readAll())[1]).toEqual(combo);
      await expect(session.combos.set(caps.max_combos, combo)).rejects.toThrow(/out of range/);
      await expect(session.combos.set(-1, combo)).rejects.toThrow(/out of range/);
      const tooWide = {
        ...combo,
        actions: Array.from({ length: caps.max_combo_keys + 1 }, () => "No" as const),
      };
      await expect(session.combos.set(0, tooWide)).rejects.toThrow(/max/);
    });
  });
});

describe("morse slots", () => {
  it("seeds one Glove80 slot and reports the rest with empty action lists", async () => {
    await withSession(glove80Board, async (session) => {
      const caps = await session.device.capabilities();
      const morse = await session.morse.readAll();
      expect(morse).toHaveLength(caps.max_morse);
      expect(morse[0].actions).toEqual([
        [0b10, { Key: { Hid: "Escape" } }],
        [0b11, { LayerOn: 1 }],
      ]);
      expect(morse[0].profile.mode).toBe("Normal");
      for (const slot of morse.slice(1)) expect(slot.actions).toEqual([]);
    });
  });

  it("round-trips a slot write and enforces slot/pattern bounds", async () => {
    await withSession(ortho60Board, async (session) => {
      const caps = await session.device.capabilities();
      for (const slot of await session.morse.readAll()) expect(slot.actions).toEqual([]);
      const morse: Morse = {
        profile: {
          unilateral_tap: true,
          enable_flow_tap: undefined,
          mode: "PermissiveHold",
          hold_timeout_ms: 180,
          gap_timeout_ms: undefined,
        },
        actions: [[0b10, { Key: { Hid: "A" } }]],
      };
      await session.morse.set(2, morse);
      expect((await session.morse.readAll())[2]).toEqual(morse);
      await expect(session.morse.set(caps.max_morse, morse)).rejects.toThrow(/out of range/);
      const tooMany = {
        ...morse,
        actions: Array.from(
          { length: caps.max_patterns_per_key + 1 },
          (_, i): [number, "No"] => [0b10 + i, "No"],
        ),
      };
      await expect(session.morse.set(0, tooMany)).rejects.toThrow(/max/);
    });
  });
});

describe("fork slots", () => {
  it("seeds the shifted-Dot fork on the Glove80, empty triggers elsewhere", async () => {
    await withSession(glove80Board, async (session) => {
      const caps = await session.device.capabilities();
      const forks = await session.forks.readAll();
      expect(forks).toHaveLength(caps.max_forks);
      expect(forks[0].trigger).toEqual({ Single: { Key: { Hid: "Dot" } } });
      expect(forks[0].positive_output).toEqual({ Single: { Key: { Hid: "Semicolon" } } });
      expect(forks[0].match_any.modifiers.left_shift).toBe(true);
      for (const fork of forks.slice(1)) expect(fork.trigger).toBe("No");
    });
  });

  it("round-trips a slot write and enforces slot bounds", async () => {
    await withSession(ortho60Board, async (session) => {
      const caps = await session.device.capabilities();
      const [empty] = await session.forks.readAll();
      expect(empty.trigger).toBe("No");
      const fork = {
        ...empty,
        trigger: { Single: { Key: { Hid: "Comma" } } },
        negative_output: { Single: { Key: { Hid: "Comma" } } },
        positive_output: { Single: { Key: { Hid: "Grave" } } },
      } as const;
      await session.forks.set(3, fork);
      expect((await session.forks.readAll())[3]).toEqual(fork);
      await expect(session.forks.set(caps.max_forks, fork)).rejects.toThrow(/out of range/);
    });
  });
});

describe("macros", () => {
  it("exposes a zeroed region sized by capabilities and round-trips writes", async () => {
    await withSession(glove80Board, async (session) => {
      const caps = await session.device.capabilities();
      const initial = await session.macros.read();
      expect(initial).toHaveLength(caps.macro_space_size);
      expect(initial.every((byte) => byte === 0)).toBe(true);
      const data = Uint8Array.from([1, 2, 3, 250]);
      await session.macros.write(data);
      const readBack = await session.macros.read();
      expect([...readBack.slice(0, 4)]).toEqual([1, 2, 3, 250]);
      expect(readBack.slice(4).every((byte) => byte === 0)).toBe(true);
    });
  });

  it("rejects writes past the macro region", async () => {
    await withSession(ortho60Board, async (session) => {
      const caps = await session.device.capabilities();
      await expect(
        session.macros.write(new Uint8Array(caps.macro_space_size + 1)),
      ).rejects.toThrow(/capacity/);
      // A full-capacity write is fine.
      await session.macros.write(new Uint8Array(caps.macro_space_size).fill(7));
      expect((await session.macros.read()).every((byte) => byte === 7)).toBe(true);
    });
  });
});

describe("behavior", () => {
  it("serves defaults and round-trips a set", async () => {
    await withSession(glove80Board, async (session) => {
      expect(await session.behavior.get()).toEqual({
        combo_timeout_ms: 50,
        oneshot_timeout_ms: 1000,
        tap_interval_ms: 200,
        tap_capslock_interval_ms: 350,
      });
      const next = {
        combo_timeout_ms: 75,
        oneshot_timeout_ms: 1500,
        tap_interval_ms: 190,
        tap_capslock_interval_ms: 400,
      };
      await session.behavior.set(next);
      expect(await session.behavior.get()).toEqual(next);
    });
  });
});

describe.each(boards)("%s device status", (_name, spec) => {
  it("sizes the matrix bitmap to rows × ceil(cols/8) bytes", async () => {
    await withSession(spec, async (session) => {
      const caps = await session.device.capabilities();
      const state = await session.device.matrixState();
      expect(state.pressed_bitmap).toHaveLength(caps.num_rows * Math.ceil(caps.num_cols / 8));
    });
  });

  it("reports an LED indicator", async () => {
    await withSession(spec, async (session) => {
      const indicator = await session.device.ledIndicator();
      expect(typeof indicator.caps_lock).toBe("boolean");
      expect(typeof indicator.num_lock).toBe("boolean");
    });
  });
});

describe("BLE and peripherals", () => {
  it("validates profile slots against num_ble_profiles", async () => {
    await withSession(glove80Board, async (session) => {
      const caps = await session.device.capabilities();
      expect(caps.ble_enabled).toBe(true);
      expect(await session.device.bleStatus()).toEqual({ profile: 0, state: "Connected" });
      await session.device.clearBleProfile(caps.num_ble_profiles - 1);
      await expect(session.device.clearBleProfile(caps.num_ble_profiles)).rejects.toThrow(/out of range/);
      await expect(session.device.clearBleProfile(-1)).rejects.toThrow(/out of range/);
    });
  });

  it("rejects every profile slot on the wired-only Ortho 60", async () => {
    await withSession(ortho60Board, async (session) => {
      expect((await session.device.capabilities()).ble_enabled).toBe(false);
      await expect(session.device.clearBleProfile(0)).rejects.toThrow(/out of range/);
    });
  });

  it("reports the Glove80's right half and rejects unknown peripherals", async () => {
    await withSession(glove80Board, async (session) => {
      const status = await session.device.peripheralStatus(0);
      expect(status.connected).toBe(true);
      expect(status.battery).not.toBe("Unavailable");
      await expect(session.device.peripheralStatus(1)).rejects.toThrow(/out of range/);
    });
  });

  it("has no peripherals on the Ortho 60", async () => {
    await withSession(ortho60Board, async (session) => {
      await expect(session.device.peripheralStatus(0)).rejects.toThrow(/out of range/);
    });
  });
});

describe("keyboard model assembly", () => {
  it("builds an enriched Glove80 model", async () => {
    await withSession(glove80Board, async (session) => {
      const [layout, topology, info] = await Promise.all([
        session.device.layout(),
        session.lighting.topology(),
        session.device.info(),
      ]);
      const model = buildKeyboardModel(layout, topology, { enrichment: enrichmentFor(info) });
      expect(model.name).toBe("Glove80");
      expect(model.keys).toHaveLength(80);
      expect(model.zones.map((zone) => zone.name)).toEqual(["left-half", "right-half", "thumbs"]);
      for (const key of model.keys) {
        expect(key.ledId).toBeDefined();
        expect(key.zoneIds.length).toBeGreaterThan(0);
        expect(key.label).toBeDefined();
      }
      const q = model.keys.find((key) => key.row === 2 && key.col === 1);
      expect(q?.label).toBe("Q");
      const thumbZones = model.keys.find((key) => key.row === 0 && key.col === 6)?.zoneIds;
      expect(thumbZones).toContain(2);
    });
  });

  it("builds the Ortho 60 model from device data alone", async () => {
    await withSession(ortho60Board, async (session) => {
      const [layout, topology, info] = await Promise.all([
        session.device.layout(),
        session.lighting.topology(),
        session.device.info(),
      ]);
      expect(enrichmentFor(info)).toBeUndefined();
      const model = buildKeyboardModel(layout, topology, { enrichment: enrichmentFor(info) });
      expect(model.name).toBe("Ortho 60");
      expect(model.keys).toHaveLength(60);
      expect(model.encoders).toHaveLength(1);
      expect(model.bounds.maxX - model.bounds.minX).toBe(12);
      for (const key of model.keys) expect(key.ledId).toBeDefined();
    });
  });
});

describe("providers", () => {
  it("surfaces both demo boards as available mock providers", async () => {
    expect(mockProviders).toHaveLength(2);
    for (const provider of mockProviders) {
      expect(provider.kind).toBe("mock");
      expect(provider.available()).toBe(true);
    }
    const session = await mockProviders[0].connect();
    expect(session.kind).toBe("mock");
    expect(session.label).toBe("Glove80");
    await session.close();
  });

  it("gives each connection independent state", async () => {
    const first = await mockProviders[1].connect();
    const second = await mockProviders[1].connect();
    try {
      await first.keymap.setKey(0, 0, 0, "No");
      const untouched = await second.keymap.readAll();
      expect(untouched[0].actions[0]).toEqual({ Single: { Key: { Hid: "Grave" } } });
      // Advanced-config tables are per-connection too.
      await first.combos.set(0, { actions: [], output: { Single: { Key: { Hid: "A" } } }, layer: undefined });
      await first.macros.write(Uint8Array.of(9));
      expect((await second.combos.readAll())[0].output).toBe("No");
      expect((await second.macros.read())[0]).toBe(0);
    } finally {
      await first.close();
      await second.close();
    }
  });
});
