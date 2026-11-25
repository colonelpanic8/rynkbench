// A layout file over what you want: the image you want after importing it,
// and what that changes or cannot hold, in words. Every part the file
// describes replaces the wanted one; a part it is silent on (`undefined`) is
// left alone, so an older file never clears what it predates. A part this
// keyboard cannot hold is reported as skipped rather than dropped. Pure.

import { macroTableSize } from "../model/macros";
import { sameValue } from "../model/deep-equal";
import { normalizePointingConfig, pointingConfigsEqual } from "../model/pointing";
import { profileSlots } from "../sync/read";
import type { KeyboardImage } from "../sync/image";
import { ruleFromWire } from "../session/lighting-rules";
import type { WorkbenchState } from "../model/workbench-state";
import type { DeviceCapabilities, LightingSceneCell } from "../vendor/rynk-wasm/rynk_wasm";
import type { RuntimeSnapshot } from "./document";

export interface ImportedLayout {
  /** What you want once the file is imported. */
  image: KeyboardImage;
  changedKeys: number;
  /** What the file changes besides keys, in writing order. */
  applied: string[];
  /** What the file asked for that this keyboard cannot hold. Reported rather
   *  than dropped: silence would read as success. */
  skipped: string[];
}

/** The keyboard's facts an import is checked against. */
export interface LayoutLimits {
  caps: Pick<DeviceCapabilities, "max_macros" | "macro_space_size" | "max_morses" | "max_combos" | "max_forks">;
  state: Pick<
    WorkbenchState,
    "morseProfileCapacity" | "morseHoldTriggerPositionCapacity" | "autoMouseLayerCapacity" | "lightingOutputMode" | "lightingControls"
  >;
  /** Why the pointing configuration could not be read, when it could not. */
  pointingUnread?: string;
}

interface Build {
  image: KeyboardImage;
  applied: string[];
  skipped: string[];
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

export function layoutOnto(snapshot: RuntimeSnapshot, want: KeyboardImage, limits: LayoutLimits): ImportedLayout {
  const build: Build = { image: want, applied: [], skipped: [] };
  behaviorsOnto(build, snapshot, limits);
  pointingOnto(build, snapshot, limits);
  const changedKeys = keysOnto(build, snapshot);
  namesOnto(build, snapshot);
  lightingOnto(build, snapshot, limits);
  return { ...build, changedKeys };
}

/** Sets a part when it differs; true when it did. */
function set<K extends keyof KeyboardImage>(build: Build, part: K, value: KeyboardImage[K]): boolean {
  if (sameValue(build.image[part], value)) return false;
  build.image = { ...build.image, [part]: value };
  return true;
}

/** The tables a keymap cell addresses by index. A table too large for the
 *  firmware is skipped whole: a truncated morse table is a keymap full of cells
 *  resolving to the wrong behavior. */
function behaviorsOnto(build: Build, snapshot: RuntimeSnapshot, { caps, state }: LayoutLimits): void {
  const { applied, skipped } = build;
  // A document parsed by an older wasm build carries no `behaviors` at all.
  const { config, options, morse_profiles, hold_trigger_positions, auto_mouse_layers, morses, combos, forks, macros } =
    snapshot.behaviors ?? {};

  if (config !== undefined) {
    if (build.image.behavior === undefined) skipped.push("global behavior timing (unsupported by this keyboard)");
    else if (set(build, "behavior", config)) applied.push("global behavior timing");
  }
  if (options !== undefined && set(build, "behaviorOptions", options)) applied.push("behavior options");

  if (morse_profiles !== undefined) {
    const invalid = morse_profiles.find((entry) => entry.index >= state.morseProfileCapacity);
    const before = build.image.morseProfiles;
    if (invalid !== undefined) {
      skipped.push(`morse profiles (slot ${invalid.index}; this keyboard holds ${state.morseProfileCapacity} slots)`);
    } else if (before !== undefined) {
      const slots = profileSlots(state.morseProfileCapacity, morse_profiles);
      const changed = slots.filter((entry, index) => !sameValue(before[index] ?? null, entry)).length;
      if (changed > 0) {
        build.image = { ...build.image, morseProfiles: slots };
        applied.push(plural(changed, "morse profile"));
      }
    }
  }

  if (hold_trigger_positions !== undefined) {
    const capacity = state.morseHoldTriggerPositionCapacity;
    const invalid = hold_trigger_positions.find(
      (position) => position.profile !== 255 && position.profile >= state.morseProfileCapacity,
    );
    if (capacity === null || build.image.holdTriggerPositions === undefined) {
      skipped.push("morse hold trigger positions (unsupported by this keyboard)");
    } else if (hold_trigger_positions.length > capacity) {
      skipped.push(`morse hold trigger positions (${hold_trigger_positions.length}; this keyboard holds ${capacity})`);
    } else if (invalid !== undefined) {
      skipped.push(
        `morse hold trigger positions (profile ${invalid.profile}; this keyboard holds ${state.morseProfileCapacity} profile slots)`,
      );
    } else if (set(build, "holdTriggerPositions", hold_trigger_positions)) {
      applied.push(plural(hold_trigger_positions.length, "morse hold trigger position"));
    }
  }

  if (auto_mouse_layers !== undefined) {
    if (auto_mouse_layers.length > state.autoMouseLayerCapacity) {
      skipped.push(`auto-mouse layers (${auto_mouse_layers.length}; this keyboard holds ${state.autoMouseLayerCapacity})`);
    } else if (set(build, "autoMouseLayers", auto_mouse_layers)) {
      applied.push(plural(auto_mouse_layers.length, "auto-mouse layer"));
    }
  }

  if (macros !== undefined) {
    const size = macroTableSize(macros, caps.max_macros);
    if (macros.length > caps.max_macros || size > caps.macro_space_size) {
      skipped.push(`macros (${size} B; this keyboard holds ${caps.macro_space_size} B)`);
    } else if (build.image.macroOps === undefined) {
      skipped.push("macros (not read from this keyboard)");
    } else if (set(build, "macroOps", structuredClone(macros))) {
      applied.push(`${macros.length} macro slots`);
    }
  }

  const table = <T extends "morse" | "combos" | "forks">(kind: T, wanted: KeyboardImage[T] | undefined, capacity: number, noun: string) => {
    if (wanted === undefined) return;
    if (wanted.length > capacity) {
      skipped.push(`${noun} (${wanted.length}; this keyboard holds ${capacity})`);
      return;
    }
    const next = [...build.image[kind]] as unknown[];
    let changed = 0;
    wanted.forEach((value, index) => {
      if (sameValue(next[index], value)) return;
      next[index] = value;
      changed += 1;
    });
    if (changed === 0) return;
    build.image = { ...build.image, [kind]: next };
    applied.push(`${changed} ${noun} slot${changed === 1 ? "" : "s"}`);
  };
  table("morse", morses, caps.max_morses, "morse");
  table("combos", combos, caps.max_combos, "combo");
  table("forks", forks, caps.max_forks, "fork");
}

function pointingOnto(build: Build, snapshot: RuntimeSnapshot, { pointingUnread }: LayoutLimits): void {
  const desired = snapshot.pointing;
  if (desired === undefined) return;
  const live = build.image.pointing;
  if (live === null) {
    build.skipped.push(`pointing configuration (${pointingUnread ?? "unsupported by this keyboard"})`);
    return;
  }
  const request = normalizePointingConfig({ ...structuredClone(desired), revision: live.revision });
  if (pointingConfigsEqual(request, live)) return;
  build.image = { ...build.image, pointing: request };
  build.applied.push("pointing configuration");
}

/** The file's layers over the wanted ones; layers it does not list are left alone. */
function keysOnto(build: Build, snapshot: RuntimeSnapshot): number {
  let changed = 0;
  const layers = build.image.layers.map((cells, layer) => {
    const file = snapshot.layers[layer];
    if (!file) return cells;
    const differing = file.filter((action, offset) => !sameValue(cells[offset], action)).length;
    changed += differing;
    return differing > 0 ? structuredClone(file) : cells;
  });
  build.image = { ...build.image, layers, defaultLayer: snapshot.default_layer };
  return changed;
}

/** Occupies and labels the layer slots the file names; slots it does not list
 *  keep their metadata, as their keys are left alone. */
function namesOnto(build: Build, snapshot: RuntimeSnapshot): void {
  const wanted = snapshot.layer_names;
  if (wanted === undefined) return;
  if (build.image.metadata.length === 0) {
    build.skipped.push("layer names (this keyboard does not store layer metadata)");
    return;
  }
  const metadata = [...build.image.metadata];
  let changed = 0;
  wanted.forEach((value, layer) => {
    if (layer >= metadata.length || sameValue(metadata[layer], value)) return;
    metadata[layer] = value;
    changed += 1;
  });
  if (changed === 0) return;
  build.image = { ...build.image, metadata };
  build.applied.push(plural(changed, "layer name"));
}

const byLayerAndLed = (scenes: readonly LightingSceneCell[]) =>
  [...scenes].sort((a, b) => a.layer - b.layer || a.led_id - b.led_id);

/** The lighting a file carries. A MoErgo backup carries none; a `glove80.toml`
 *  describes the whole managed lighting state. */
function lightingOnto(build: Build, snapshot: RuntimeSnapshot, { state }: LayoutLimits): void {
  const desired = snapshot.lighting;
  if (!desired) return;
  const { applied, skipped } = build;

  const live = build.image.lightingState;
  if (live && (desired.brightness !== live.output_brightness || !sameValue(desired.background, live.background))) {
    build.image = {
      ...build.image,
      lightingState: { output_enabled: live.output_enabled, output_brightness: desired.brightness, background: desired.background },
    };
    applied.push("background");
  }

  // The three-state output policy is the keyboard's own: it is cycled from the
  // Magic layer, and nothing writes it.
  if (state.lightingOutputMode !== null && desired.output_mode !== state.lightingOutputMode.mode) {
    skipped.push(`output mode (${desired.output_mode}; set it from the keyboard)`);
  }

  const wakeLayers = desired.wake_layers.reduce((mask, layer) => mask + 2 ** layer, 0);
  if (state.lightingOutputMode === null) {
    if (wakeLayers !== state.lightingControls.wake_layers) {
      skipped.push("Magic layers (this keyboard does not support runtime wake-layer policy)");
    }
  } else if (set(build, "wakeLayers", wakeLayers)) {
    applied.push(plural(desired.wake_layers.length, "Magic layer"));
  }

  if (build.image.layerPolicy !== undefined && set(build, "layerPolicy", desired.scene_policy)) applied.push("scene policy");

  if (!sameValue(byLayerAndLed(desired.scenes), byLayerAndLed(build.image.scenes))) {
    build.image = { ...build.image, scenes: desired.scenes };
    applied.push(plural(desired.scenes.length, "scene cell"));
  }

  const rules = desired.conditional_scenes?.map(ruleFromWire);
  if (rules !== undefined && set(build, "runtimeConditionalScenes", rules)) applied.push(plural(rules.length, "conditional rule"));

  effectOnto(build, desired);
}

function effectOnto(build: Build, desired: NonNullable<RuntimeSnapshot["lighting"]>): void {
  if (!desired.effects || build.image.extension === undefined) return;
  let changed = set(build, "extension", desired.effects);
  if (build.image.extensionOverlay !== undefined) changed = set(build, "extensionOverlay", desired.overlay ?? null) || changed;

  let params = 0;
  for (const { effect, index, value } of desired.effect_params) {
    const values = build.image.effectParams?.[effect];
    if (values?.[index] === undefined) {
      build.skipped.push(`effect ${effect} parameter ${index} (this keyboard has no such parameter)`);
      continue;
    }
    if (values[index] === value) continue;
    build.image = { ...build.image, effectParams: { ...build.image.effectParams, [effect]: values.map((old, i) => (i === index ? value : old)) } };
    params += 1;
  }
  if (changed || params > 0) build.applied.push("effect");
  if (params > 0) build.applied.push(plural(params, "effect parameter"));
}
