import { describe, expect, it } from "vitest";
import { pickName, pickTakes, planPick, type KeyPick, type PickedKey } from "./key-pick";

const key = (ledId: number, x: number, y: number): PickedKey => ({ row: y, col: x, ledId, x, y });

describe("picking a connection key", () => {
  const pick: KeyPick = { kind: "connection", layer: 2, connection: { type: "ble", slot: 1 } };

  it("takes one key and installs the profile's action and light on it", () => {
    expect(pickTakes(pick)).toBe("one");
    expect(pickName(pick)).toBe("Bluetooth 2 key");
    expect(pickName({ ...pick, connection: { type: "usb" } })).toBe("USB key");
    expect(planPick(pick, [key(7, 3, 1)])).toEqual({
      ok: true,
      name: "set_connection_key",
      input: { layer: 2, row: 1, col: 3, led: 7, kind: { type: "ble", slot: 1 } },
    });
  });

  it("waits for its key", () => {
    expect(planPick(pick, [])).toEqual({ ok: false, problem: "Choose its key first" });
    expect(planPick(pick, [key(7, 3, 1), key(8, 4, 1)])).toMatchObject({ ok: false });
  });
});

describe("picking a battery bar", () => {
  const pick: KeyPick = { kind: "battery", layer: 2, node: 1, order: "auto", style: "bands" };
  // A column chosen from the middle outwards.
  const column = [key(12, 0, 2), key(11, 0, 1), key(13, 0, 3), key(10, 0, 0)];

  it("takes several keys and fills them upwards for a column, or as told", () => {
    expect(pickTakes(pick)).toBe("many");
    expect(planPick(pick, column)).toEqual({
      ok: true,
      name: "set_battery_bar",
      input: { layer: 2, node: 1, leds: [13, 12, 11, 10], style: "bands" },
    });
    expect(planPick({ ...pick, order: "selection" }, column)).toMatchObject({ input: { leds: [12, 11, 13, 10] } });
    expect(planPick({ ...pick, order: "top-down" }, column)).toMatchObject({ input: { leds: [10, 11, 12, 13] } });
  });

  it("says how many keys a bar is while too few or too many are chosen", () => {
    expect(planPick(pick, column.slice(0, 2))).toEqual({ ok: false, problem: "A battery bar is 3 to 8 keys: 2 chosen" });
    const nine = Array.from({ length: 9 }, (_, index) => key(index, index, 0));
    expect(planPick(pick, nine)).toEqual({ ok: false, problem: "A battery bar is 3 to 8 keys: 9 chosen" });
  });
});
