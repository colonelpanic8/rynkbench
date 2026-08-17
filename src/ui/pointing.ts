import type {
  CaretConfig,
  CursorConfig,
  PointingConfig,
  PointingDeviceConfig,
  PointingLayerOverride,
  PointingMode,
} from "../vendor/rynk-wasm/rynk_wasm";

export const POINTING_DEVICE_CAPACITY = 4;
export const POINTING_OVERRIDE_CAPACITY = 16;
export const POINTING_MODE_KEYPAD = 1 << 0;

export type PointingModeKind = "Cursor" | "Scroll" | "Sniper" | "Caret" | "Drag" | "Press" | "Keypad";

const CURSOR_DEFAULT: CursorConfig = {
  multiplier_x: 1,
  multiplier_y: 1,
  invert_x: false,
  invert_y: false,
};

const CARET_DEFAULT: CaretConfig = {
  disable_x: false,
  disable_y: false,
  invert_x: false,
  invert_y: false,
  threshold: 100,
  keycode_up: "Up",
  keycode_down: "Down",
  keycode_left: "Left",
  keycode_right: "Right",
};

export function defaultPointingMode(kind: PointingModeKind): PointingMode {
  switch (kind) {
    case "Cursor":
      return { Cursor: structuredClone(CURSOR_DEFAULT) };
    case "Scroll":
      return {
        Scroll: {
          multiplier_x: 1,
          divisor_x: 8,
          multiplier_y: 1,
          divisor_y: 8,
          invert_x: false,
          invert_y: false,
        },
      };
    case "Sniper":
      return { Sniper: { multiplier: 1, divisor: 4, invert_x: false, invert_y: false } };
    case "Caret":
      return { Caret: structuredClone(CARET_DEFAULT) };
    case "Drag":
      return { Drag: { cursor: structuredClone(CURSOR_DEFAULT), toggled_by: 1, latches: 1 } };
    case "Press":
      return { Press: { cursor: structuredClone(CURSOR_DEFAULT), holds: 1 } };
    case "Keypad":
      return {
        Keypad: {
          disable_x: false,
          disable_y: false,
          invert_x: false,
          invert_y: false,
          threshold_x: 100,
          threshold_y: 100,
          keycode_up: "Up",
          keycode_down: "Down",
          keycode_left: "Left",
          keycode_right: "Right",
          keycode_tap: "No",
        },
      };
  }
}

export function pointingModeKind(mode: PointingMode): PointingModeKind {
  if ("Cursor" in mode) return "Cursor";
  if ("Scroll" in mode) return "Scroll";
  if ("Sniper" in mode) return "Sniper";
  if ("Caret" in mode) return "Caret";
  if ("Drag" in mode) return "Drag";
  if ("Press" in mode) return "Press";
  return "Keypad";
}

export function activePointingDevices(config: PointingConfig): PointingDeviceConfig[] {
  return config.devices.slice(0, Math.min(config.device_count, POINTING_DEVICE_CAPACITY));
}

export function activePointingOverrides(config: PointingConfig): PointingLayerOverride[] {
  return config.overrides.slice(0, Math.min(config.override_count, POINTING_OVERRIDE_CAPACITY));
}

export function validatePointingConfig(config: PointingConfig): void {
  if (!Number.isInteger(config.device_count) || config.device_count < 0) {
    throw new Error("Pointing device count must be a non-negative integer.");
  }
  if (config.device_count > POINTING_DEVICE_CAPACITY) {
    throw new Error(`Pointing configuration supports at most ${POINTING_DEVICE_CAPACITY} devices.`);
  }
  if (config.devices.length < config.device_count) {
    throw new Error("Pointing device count exceeds the supplied device entries.");
  }
  if (!Number.isInteger(config.override_count) || config.override_count < 0) {
    throw new Error("Pointing override count must be a non-negative integer.");
  }
  if (config.override_count > POINTING_OVERRIDE_CAPACITY) {
    throw new Error(`Pointing configuration supports at most ${POINTING_OVERRIDE_CAPACITY} overrides.`);
  }
  if (config.overrides.length < config.override_count) {
    throw new Error("Pointing override count exceeds the supplied override entries.");
  }

  const devices = activePointingDevices(config);
  const deviceIds = new Set<number>();
  for (const device of devices) {
    if (!Number.isInteger(device.device_id) || device.device_id < 0 || device.device_id > 255) {
      throw new Error("Device ID must be an integer from 0 to 255.");
    }
    if (deviceIds.has(device.device_id)) {
      throw new Error(`Device ${device.device_id} is configured more than once.`);
    }
    deviceIds.add(device.device_id);
  }

  const overrideKeys = new Set<string>();
  for (const entry of activePointingOverrides(config)) {
    if (!Number.isInteger(entry.layer) || entry.layer < 0 || entry.layer > 255) {
      throw new Error("Override layer must be an integer from 0 to 255.");
    }
    if (!deviceIds.has(entry.device_id)) {
      throw new Error(`Override targets unconfigured device ${entry.device_id}.`);
    }
    const key = `${entry.layer}:${entry.device_id}`;
    if (overrideKeys.has(key)) {
      throw new Error(`Layer ${entry.layer} has more than one override for device ${entry.device_id}.`);
    }
    overrideKeys.add(key);
  }
}

function emptyDevice(): PointingDeviceConfig {
  return { device_id: 0, mode: defaultPointingMode("Cursor") };
}

function emptyOverride(): PointingLayerOverride {
  return { layer: 0, device_id: 0, mode: defaultPointingMode("Cursor") };
}

function rebuildPointingConfig(
  config: PointingConfig,
  devices: PointingDeviceConfig[],
  overrides: PointingLayerOverride[],
): PointingConfig {
  if (devices.length > POINTING_DEVICE_CAPACITY) {
    throw new Error(`Pointing configuration supports at most ${POINTING_DEVICE_CAPACITY} devices.`);
  }
  if (overrides.length > POINTING_OVERRIDE_CAPACITY) {
    throw new Error(`Pointing configuration supports at most ${POINTING_OVERRIDE_CAPACITY} overrides.`);
  }

  return {
    revision: config.revision,
    device_count: devices.length,
    devices: [
      ...structuredClone(devices),
      ...Array.from({ length: POINTING_DEVICE_CAPACITY - devices.length }, emptyDevice),
    ],
    override_count: overrides.length,
    overrides: [
      ...structuredClone(overrides),
      ...Array.from({ length: POINTING_OVERRIDE_CAPACITY - overrides.length }, emptyOverride),
    ],
  };
}

export function normalizePointingConfig(config: PointingConfig): PointingConfig {
  validatePointingConfig(config);
  return rebuildPointingConfig(
    config,
    activePointingDevices(config),
    activePointingOverrides(config),
  );
}

export function pointingConfigsEqual(a: PointingConfig | null, b: PointingConfig | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify({
    devices: activePointingDevices(a),
    overrides: activePointingOverrides(a),
  }) === JSON.stringify({
    devices: activePointingDevices(b),
    overrides: activePointingOverrides(b),
  });
}

export function addPointingDevice(config: PointingConfig, deviceId: number): PointingConfig {
  if (!Number.isInteger(deviceId) || deviceId < 0 || deviceId > 255) {
    throw new Error("Device ID must be an integer from 0 to 255.");
  }
  const devices = activePointingDevices(config);
  if (devices.some((device) => device.device_id === deviceId)) {
    throw new Error(`Device ${deviceId} is already configured.`);
  }
  return rebuildPointingConfig(
    config,
    [...devices, { device_id: deviceId, mode: defaultPointingMode("Cursor") }],
    activePointingOverrides(config),
  );
}

export function updatePointingDeviceMode(
  config: PointingConfig,
  deviceId: number,
  mode: PointingMode,
): PointingConfig {
  const devices = activePointingDevices(config);
  if (!devices.some((device) => device.device_id === deviceId)) {
    throw new Error(`Device ${deviceId} is not configured.`);
  }
  return rebuildPointingConfig(
    config,
    devices.map((device) =>
      device.device_id === deviceId ? { ...device, mode: structuredClone(mode) } : device,
    ),
    activePointingOverrides(config),
  );
}

export function removePointingDevice(config: PointingConfig, deviceId: number): PointingConfig {
  const devices = activePointingDevices(config).filter((device) => device.device_id !== deviceId);
  if (devices.length === config.device_count) throw new Error(`Device ${deviceId} is not configured.`);
  return rebuildPointingConfig(
    config,
    devices,
    activePointingOverrides(config).filter((entry) => entry.device_id !== deviceId),
  );
}

export function setPointingOverride(
  config: PointingConfig,
  layer: number,
  deviceId: number,
  mode?: PointingMode,
): PointingConfig {
  const devices = activePointingDevices(config);
  const device = devices.find((candidate) => candidate.device_id === deviceId);
  if (!device) throw new Error(`Configure device ${deviceId} before adding an override.`);
  if (!Number.isInteger(layer) || layer < 0 || layer > 255) {
    throw new Error("Layer must be an integer from 0 to 255.");
  }

  const overrides = activePointingOverrides(config);
  const existing = overrides.findIndex(
    (entry) => entry.layer === layer && entry.device_id === deviceId,
  );
  const next: PointingLayerOverride = {
    layer,
    device_id: deviceId,
    mode: structuredClone(mode ?? device.mode),
  };
  const updated = overrides.slice();
  if (existing >= 0) updated[existing] = next;
  else updated.push(next);
  return rebuildPointingConfig(config, devices, updated);
}

export function removePointingOverride(
  config: PointingConfig,
  layer: number,
  deviceId: number,
): PointingConfig {
  return rebuildPointingConfig(
    config,
    activePointingDevices(config),
    activePointingOverrides(config).filter(
      (entry) => entry.layer !== layer || entry.device_id !== deviceId,
    ),
  );
}
