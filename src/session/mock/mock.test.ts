import { describe, expect, it } from "vitest";
import type { TopicEvent } from "../../vendor/rynk-wasm/rynk_wasm";
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
    await withSession(glove80Board, async (session) => {
      const events: TopicEvent[] = [];
      session.onTopic((event) => events.push(event));
      expect(await session.keymap.defaultLayer()).toBe(0);
      await session.keymap.setDefaultLayer(1);
      expect(await session.keymap.defaultLayer()).toBe(1);
      expect(await session.keymap.currentLayer()).toBe(1);
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
    } finally {
      await first.close();
      await second.close();
    }
  });
});
