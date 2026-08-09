import type { ExtensionCatalog, RuntimeSnapshot } from "../../config/document";
import type { RynkSession } from "../types";
import { memorySession, type BoardSpec } from "../mock/board";
import { glove80Board } from "../mock/glove80";

const NEW_CONFIG_LAYERS = 6;

function defaultLayers(): RuntimeSnapshot["layers"] {
  const base = structuredClone(glove80Board.defaultLayers[0]);
  const transparent = structuredClone(glove80Board.defaultLayers[1]);
  return [base, ...Array.from({ length: NEW_CONFIG_LAYERS - 1 }, () => structuredClone(transparent))];
}

/** Catalog compiled into the offline Glove80 template, used to parse names before a session exists. */
export function offlineGlove80Catalog(): ExtensionCatalog {
  const pack = glove80Board.extensionEffects;
  if (!pack) return { effects: [], palettes: [], params: [] };
  return {
    effects: [...pack.effects],
    palettes: [...pack.palettes],
    params: Object.entries(pack.params ?? {}).map(([effect, params]) => ({
      effect: Number(effect),
      name: pack.effects[Number(effect)],
      params: params.map((param) => ({ ...param, value: param.default })),
    })),
  };
}

/** Build a Glove80-shaped editing surface from a parsed configuration snapshot. */
export function offlineGlove80Board(snapshot?: RuntimeSnapshot): BoardSpec {
  const layers = structuredClone(snapshot?.layers ?? defaultLayers());
  const behaviors = snapshot?.behaviors;
  const lighting = snapshot?.lighting;
  const extensionEffects = structuredClone(glove80Board.extensionEffects!);
  for (const write of lighting?.effect_params ?? []) {
    const param = extensionEffects.params?.[write.effect]?.[write.index];
    if (param) param.default = write.value;
  }

  return {
    ...glove80Board,
    title: "Glove80 configuration",
    description: "Local configuration workspace — no keyboard connection.",
    info: {
      ...glove80Board.info,
      product_name: "Glove80 configuration",
      serial_number: "OFFLINE",
    },
    build: { label: "Offline configuration workspace" },
    capabilities: {
      ...glove80Board.capabilities,
      num_layers: layers.length,
    },
    connection: {
      usb: "Disabled",
      ble: { profile: 0, state: "Inactive" },
      preferred: "Usb",
    },
    defaultLayers: layers,
    defaultEncoders: Array.from({ length: layers.length }, () => []),
    initialDefaultLayer: snapshot?.default_layer ?? 0,
    initialActiveLayers: [snapshot?.default_layer ?? 0],
    battery: "Unavailable",
    peripheralBattery: "Unavailable",
    brightness: lighting?.brightness ?? 255,
    background:
      structuredClone(lighting?.background) ?? {
        enabled: false,
        hue: 0,
        saturation: 0,
        value: 0,
        speed: 128,
        mode: "Solid",
      },
    behavior: structuredClone(behaviors?.config ?? glove80Board.behavior),
    behaviorOptions: structuredClone(behaviors?.options ?? glove80Board.behaviorOptions),
    morseProfileCount: Math.max(
      16,
      ...(behaviors?.morse_profiles ?? []).map((entry) => entry.index + 1),
    ),
    seedMorseProfiles: structuredClone(behaviors?.morse_profiles ?? []),
    holdTriggerPositionCapacity: Math.max(64, behaviors?.hold_trigger_positions?.length ?? 0),
    seedHoldTriggerPositions: structuredClone(behaviors?.hold_trigger_positions ?? []),
    autoMouseLayerCapacity: Math.max(16, behaviors?.auto_mouse_layers?.length ?? 0),
    seedAutoMouseLayers: structuredClone(behaviors?.auto_mouse_layers ?? []),
    seedCombos: structuredClone(behaviors?.combos ?? []),
    seedMorse: structuredClone(behaviors?.morses ?? []),
    seedForks: structuredClone(behaviors?.forks ?? []),
    seedMacros: structuredClone(behaviors?.macros ?? []),
    seedScenes: structuredClone(lighting?.scenes ?? []),
    sceneCapacity: Math.max(256, lighting?.scenes.length ?? 0),
    compiledScenes: [],
    compiledScenePolicy: "EffectiveOnly",
    initialLayerPolicy: lighting?.scene_policy ?? "EffectiveOnly",
    conditionalScenes: [],
    lightingControls: { output_toggle_user_action: undefined, wake_layers: 0 },
    runtimeConditionalCapacity: Math.max(64, lighting?.conditional_scenes?.length ?? 0),
    runtimeConditionalPredicates: true,
    seedRuntimeConditionalScenes: structuredClone(lighting?.conditional_scenes ?? []),
    lightingOutputMode: {
      ...structuredClone(glove80Board.lightingOutputMode!),
      mode: lighting?.output_mode ?? "PoweredOnly",
      powered: false,
      wake_active: false,
      effective_enabled: true,
    },
    extensionEffects: {
      ...extensionEffects,
      initial: structuredClone(lighting?.effects ?? extensionEffects.initial),
      overlay: lighting?.overlay,
    },
  };
}

export function openOfflineGlove80(snapshot?: RuntimeSnapshot): RynkSession {
  return memorySession(offlineGlove80Board(snapshot), "offline");
}
