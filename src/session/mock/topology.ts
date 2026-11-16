// A simulated board's lighting topology, built from its list of lights.

import type {
  LightingLed,
  LightingLedId,
  LightingPhysicalKey,
  LightingRoute,
  LightingZone,
  LightingZoneId,
} from "../../vendor/rynk-wasm/rynk_wasm";
import type { LightingTopology } from "../types";

/** One simulated light: identity, matrix key, geometry, wiring, zones. */
export interface SimLed {
  id: LightingLedId;
  row: number;
  col: number;
  x: number;
  y: number;
  node: number;
  physicalIndex: number;
  zoneIds: LightingZoneId[];
}

export function buildTopology(
  revision: number,
  zones: LightingZone[],
  simLeds: SimLed[],
): LightingTopology {
  const zoneMemberships: LightingZoneId[] = [];
  const leds: LightingLed[] = [];
  const physicalKeys: LightingPhysicalKey[] = [];
  const routes: LightingRoute[] = [];
  for (const led of simLeds) {
    const zone_start = zoneMemberships.length;
    zoneMemberships.push(...led.zoneIds);
    leds.push({
      id: led.id,
      key: { row: led.row, col: led.col },
      position: { x: led.x, y: led.y, z: 0 },
      zone_start,
      zone_len: led.zoneIds.length,
    });
    physicalKeys.push({
      matrix: { row: led.row, col: led.col },
      center: { x: led.x, y: led.y, z: 0 },
      size: { width: 1, height: 1 },
      rotation: 0,
    });
    routes.push({ led_id: led.id, node: led.node, output: 0, physical_index: led.physicalIndex });
  }
  const keys = simLeds.map((led) => ({ row: led.row, col: led.col }));
  return { revision, keys, physicalKeys, leds, routes, zones, zoneMemberships };
}
