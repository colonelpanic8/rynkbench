import { describe, expect, it } from "vitest";
import type { PointingConfig } from "../vendor/rynk-wasm/rynk_wasm";
import {
  POINTING_DEVICE_CAPACITY,
  POINTING_OVERRIDE_CAPACITY,
  activePointingDevices,
  activePointingOverrides,
  addPointingDevice,
  defaultPointingMode,
  normalizePointingConfig,
  pointingConfigsEqual,
  pointingModeKind,
  removePointingDevice,
  removePointingOverride,
  setPointingOverride,
  updatePointingDeviceMode,
  validatePointingConfig,
} from "./pointing";

const empty = (): PointingConfig => ({
  revision: 3,
  device_count: 0,
  devices: [],
  override_count: 0,
  overrides: [],
});

describe("pointing configuration helpers", () => {
  it("constructs every protocol mode with its firmware default", () => {
    const kinds = [
      "Cursor",
      "Scroll",
      "Sniper",
      "Caret",
      "Drag",
      "Press",
      "Keypad",
      "CursorRemap",
    ] as const;
    expect(kinds.map((kind) => pointingModeKind(defaultPointingMode(kind)))).toEqual(kinds);
    expect(defaultPointingMode("Press")).toEqual({
      Press: {
        cursor: { multiplier_x: 1, multiplier_y: 1, invert_x: false, invert_y: false },
        holds: 1,
      },
    });
    // Appended after Keypad on the wire, so a client that stops at Keypad
    // cannot decode a device using it — the bug this coverage guards.
    expect(defaultPointingMode("CursorRemap")).toEqual({
      CursorRemap: {
        cursor: { multiplier_x: 1, multiplier_y: 1, invert_x: false, invert_y: false },
        primary_button: 1,
      },
    });
  });

  it("normalizes active entries into the protocol's fixed-capacity arrays", () => {
    const normalized = normalizePointingConfig(empty());
    expect(normalized.devices).toHaveLength(POINTING_DEVICE_CAPACITY);
    expect(normalized.overrides).toHaveLength(POINTING_OVERRIDE_CAPACITY);
    expect(activePointingDevices(normalized)).toEqual([]);
    expect(activePointingOverrides(normalized)).toEqual([]);
  });

  it("adds unique base devices and updates their modes", () => {
    let config = addPointingDevice(empty(), 1);
    config = addPointingDevice(config, 3);
    config = updatePointingDeviceMode(config, 3, defaultPointingMode("Scroll"));
    expect(activePointingDevices(config)).toEqual([
      { device_id: 1, mode: defaultPointingMode("Cursor") },
      { device_id: 3, mode: defaultPointingMode("Scroll") },
    ]);
    expect(() => addPointingDevice(config, 3)).toThrow("already configured");
  });

  it("copies the base mode into a new layer override and replaces duplicate pairs", () => {
    let config = addPointingDevice(empty(), 2);
    config = updatePointingDeviceMode(config, 2, defaultPointingMode("Sniper"));
    config = setPointingOverride(config, 4, 2);
    expect(activePointingOverrides(config)).toEqual([
      { layer: 4, device_id: 2, mode: defaultPointingMode("Sniper") },
    ]);

    config = setPointingOverride(config, 4, 2, defaultPointingMode("Press"));
    expect(activePointingOverrides(config)).toEqual([
      { layer: 4, device_id: 2, mode: defaultPointingMode("Press") },
    ]);
  });

  it("compacts removals and cascades device deletion to its overrides", () => {
    let config = addPointingDevice(empty(), 0);
    config = addPointingDevice(config, 1);
    config = setPointingOverride(config, 1, 0);
    config = setPointingOverride(config, 2, 1);
    config = removePointingOverride(config, 1, 0);
    expect(activePointingOverrides(config).map((entry) => entry.device_id)).toEqual([1]);
    config = removePointingDevice(config, 1);
    expect(activePointingDevices(config).map((device) => device.device_id)).toEqual([0]);
    expect(activePointingOverrides(config)).toEqual([]);
    expect(config.devices).toHaveLength(POINTING_DEVICE_CAPACITY);
    expect(config.overrides).toHaveLength(POINTING_OVERRIDE_CAPACITY);
  });

  it("compares active configuration by value while ignoring revision and padding", () => {
    const short = addPointingDevice(empty(), 0);
    const repinned = { ...short, revision: 22 };
    expect(pointingConfigsEqual(short, repinned)).toBe(true);
    expect(
      pointingConfigsEqual(short, updatePointingDeviceMode(repinned, 0, defaultPointingMode("Drag"))),
    ).toBe(false);
  });

  it("enforces device and override capacities", () => {
    let devices = empty();
    for (let id = 0; id < POINTING_DEVICE_CAPACITY; id += 1) {
      devices = addPointingDevice(devices, id);
    }
    expect(() => addPointingDevice(devices, 99)).toThrow("at most 4 devices");

    let overrides = devices;
    for (let layer = 0; layer < POINTING_OVERRIDE_CAPACITY; layer += 1) {
      overrides = setPointingOverride(overrides, layer, 0);
    }
    expect(() => setPointingOverride(overrides, POINTING_OVERRIDE_CAPACITY, 1)).toThrow(
      "at most 16 overrides",
    );
  });

  it("rejects malformed identities before normalization", () => {
    const duplicateDevices: PointingConfig = {
      ...empty(),
      device_count: 2,
      devices: [
        { device_id: 7, mode: defaultPointingMode("Cursor") },
        { device_id: 7, mode: defaultPointingMode("Scroll") },
      ],
    };
    expect(() => validatePointingConfig(duplicateDevices)).toThrow("configured more than once");

    const missingDevice: PointingConfig = {
      ...empty(),
      override_count: 1,
      overrides: [{ layer: 2, device_id: 9, mode: defaultPointingMode("Press") }],
    };
    expect(() => normalizePointingConfig(missingDevice)).toThrow("unconfigured device 9");

    expect(() => addPointingDevice(empty(), 256)).toThrow("0 to 255");
    expect(() => setPointingOverride(addPointingDevice(empty(), 1), -1, 1)).toThrow(
      "0 to 255",
    );
  });
});
