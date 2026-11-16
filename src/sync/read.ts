// Reading what a keyboard stores, as one image (ADR 0012). Reading costs no
// flash, so every write is planned against a fresh read, never a kept copy.

import type { LightingMutableState, LightingState, MorseProfileEntry } from "../vendor/rynk-wasm/rynk_wasm";
import type { RynkSession } from "../session/types";
import type { KeyboardImage } from "./image";

/** Which parts this keyboard has. The workbench's io features fit this shape. */
export interface ImageFeatures {
  scenesSupported: boolean;
  conditionalScenesSupported: boolean;
  pointingSupported: boolean;
  lightingOutputSupported: boolean;
  /** The firmware keeps layer names and which layer slots are used. */
  layerMetadata?: boolean;
  /** Read the macro region too (it is written as one item). */
  macros?: boolean;
  /** The optional parts to read too (ADR 0018); see `partsOf`. */
  behavior?: boolean;
  morseProfiles?: boolean;
  holdTriggerPositions?: boolean;
  layerPolicy?: boolean;
  lightingState?: boolean;
  extension?: boolean;
  extensionOverlay?: boolean;
  /** The effects whose parameters to read. */
  paramEffects?: number[];
}

/** Which optional parts an image holds, so a read can hold the same. */
export function partsOf(image: KeyboardImage): Partial<ImageFeatures> {
  return {
    layerMetadata: image.metadata.length > 0,
    macros: image.macroOps !== undefined,
    behavior: image.behavior !== undefined,
    morseProfiles: image.morseProfiles !== undefined,
    holdTriggerPositions: image.holdTriggerPositions !== undefined,
    layerPolicy: image.layerPolicy !== undefined,
    lightingState: image.lightingState !== undefined,
    extension: image.extension !== undefined,
    extensionOverlay: image.extensionOverlay !== undefined,
    paramEffects: Object.keys(image.effectParams ?? {}).map(Number),
  };
}

/** The optional parts, each read only when asked for. */
async function readSettings(session: RynkSession, features: ImageFeatures): Promise<Partial<KeyboardImage>> {
  const when = <T,>(wanted: boolean | undefined, read: () => Promise<T>) => (wanted ? read() : Promise.resolve(undefined));
  const [behavior, profiles, holdTriggers, sceneStatus, lighting, extension, layers, params] = await Promise.all([
    when(features.behavior, () => session.behavior.get()),
    when(features.morseProfiles, () => session.behavior.profiles()),
    when(features.holdTriggerPositions, () => session.behavior.holdTriggerPositions()),
    when(features.layerPolicy, () => session.lighting.scenes.sceneStatus()),
    when(features.lightingState, () => session.lighting.state()),
    when(features.extension, () => session.lighting.extension()),
    when(features.extensionOverlay, () => session.lighting.extensionLayers()),
    Promise.all((features.paramEffects ?? []).map(async (effect) => [effect, (await session.lighting.extensionParams(effect)).map((param) => param.value)] as const)),
  ]);
  const parts: Partial<KeyboardImage> = {};
  if (behavior) parts.behavior = behavior;
  if (profiles) parts.morseProfiles = profileSlots(profiles.capacity, profiles.entries);
  if (holdTriggers) parts.holdTriggerPositions = holdTriggers.positions;
  if (sceneStatus) parts.layerPolicy = sceneStatus.policy;
  if (lighting) parts.lightingState = mutableLighting(lighting);
  if (extension) parts.extension = extension.state;
  if (layers) parts.extensionOverlay = layers.overlay ?? null;
  if (params.length > 0) parts.effectParams = Object.fromEntries(params);
  return parts;
}

/** Profiles by slot, null where a slot is empty. */
export function profileSlots(capacity: number, entries: readonly MorseProfileEntry[]): (MorseProfileEntry | null)[] {
  const slots: (MorseProfileEntry | null)[] = Array.from({ length: capacity }, () => null);
  for (const entry of entries) slots[entry.index] = entry;
  return slots;
}

/** The part of the lighting state a write sets. */
export function mutableLighting(state: LightingState): LightingMutableState {
  return { output_enabled: state.output_enabled, output_brightness: state.output_brightness, background: { ...state.background } };
}

/** A read image, with the layer state the layer rules need. */
export interface ReadImage extends KeyboardImage {
  activeLayers: number[];
  /** False only on old firmware without the full layer state. */
  layerStateComplete: boolean;
}

const none = <T,>(): Promise<T[]> => Promise.resolve([]);

export async function readImage(session: RynkSession, features: ImageFeatures): Promise<ReadImage> {
  const caps = await session.device.capabilities();
  const each = <T,>(count: number, read: (index: number) => Promise<T>) =>
    Promise.all(Array.from({ length: count }, (_, index) => read(index)));
  const [metadata, layerKeymaps, layerState, combos, morse, forks, behaviorOptions, autoMouse, pointing, macroOps] =
    await Promise.all([
      features.layerMetadata ? each(caps.num_layers, (layer) => session.keymap.getLayerMetadata(layer)) : none<never>(),
      session.keymap.readAll(),
      session.keymap.layerState(),
      caps.max_combos > 0 ? session.combos.readAll() : none<never>(),
      caps.max_morse > 0 ? session.morse.readAll() : none<never>(),
      caps.max_forks > 0 ? session.forks.readAll() : none<never>(),
      session.behavior.options(),
      session.behavior.autoMouseLayers(),
      features.pointingSupported ? session.pointing.get() : Promise.resolve(null),
      features.macros ? session.macros.read() : Promise.resolve(undefined),
    ]);
  const encoders = await each(caps.num_layers, (layer) =>
    each(caps.num_encoders, (encoder) => session.keymap.getEncoder(encoder, layer)),
  );
  const [scenes, runtimeConditionalScenes, outputMode, settings] = await Promise.all([
    features.scenesSupported ? session.lighting.scenes.readScenes() : none<never>(),
    features.conditionalScenesSupported ? session.lighting.conditionalScenes.read() : none<never>(),
    features.lightingOutputSupported ? session.lighting.outputMode() : Promise.resolve(null),
    readSettings(session, features),
  ]);
  const layers = Array.from({ length: caps.num_layers }, (_, layer) => {
    const found = layerKeymaps.find((candidate) => candidate.layer === layer);
    if (!found) throw new Error(`keymap read omitted layer ${layer}`);
    return found.actions;
  });
  return {
    metadata,
    layers,
    encoders,
    defaultLayer: layerState.defaultLayer,
    activeLayers: layerState.activeLayers,
    layerStateComplete: layerState.complete,
    combos,
    morse,
    forks,
    ...(macroOps ? { macroOps } : {}),
    behaviorOptions,
    autoMouseLayers: autoMouse.configs,
    scenes,
    runtimeConditionalScenes,
    wakeLayers: outputMode?.wake_layers ?? 0,
    pointing,
    ...settings,
  };
}
