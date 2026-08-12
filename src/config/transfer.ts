// Moving a configuration document between a file and the keyboard.
//
// Every document is parsed and fully validated before a single write goes out,
// so a file that cannot be represented fails with the exact layer and key it
// failed on rather than leaving the keyboard half-written. Only differences are
// written: an import that matches the device is a no-op, which is what makes
// re-importing a file a safe way to check it.

import type { Dispatch } from "react";
import { boardForTarget, transferSnapshot } from "../model/boards/transfer";
import type { MoErgoBoard } from "../model/boards/transfer";
import type { RynkSession } from "../session/types";
import type { ConnectedBundle, WorkbenchAction, WorkbenchState } from "../ui/state";
import { errorMessage } from "../ui/state";
import type { ComboDefinition, Fork, Morse } from "../vendor/rynk-wasm/rynk_wasm";
import {
  parseDocument,
  renderDocument,
  snapshotFromState,
} from "./document";
import type { ConfigFormat, ExtensionCatalog, ImportNote, RuntimeSnapshot } from "./document";

export interface ImportResult {
  format: ConfigFormat;
  sourceBoard: MoErgoBoard;
  targetBoard: MoErgoBoard;
  converted: boolean;
  changedKeys: number;
  /** How the imported layout differs from its source document: format
   *  approximations plus source-board positions with no target counterpart. */
  notes: ImportNote[];
  /** What the document changed on the keyboard, in the order it was written. */
  applied: string[];
  /** What the document asked for that this seam has no way to write. Reported
   *  rather than dropped: silence would read as success. */
  skipped: string[];
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface ImportArgs {
  text: string;
  session: RynkSession;
  bundle: ConnectedBundle;
  state: WorkbenchState;
  dispatch: Dispatch<WorkbenchAction>;
  catalog: ExtensionCatalog;
}

export async function importDocument(args: ImportArgs): Promise<ImportResult> {
  const { text, session, bundle, state, dispatch, catalog } = args;
  boardForTarget(bundle.info.product_name, bundle.caps.num_rows, bundle.caps.num_cols);

  const { format, snapshot: sourceSnapshot, notes: parseNotes } = parseDocument(text, catalog);
  if (sourceSnapshot.layers.length > bundle.caps.num_layers) {
    throw new Error(
      `Layout has ${sourceSnapshot.layers.length} layers; this keyboard supports ${bundle.caps.num_layers}`,
    );
  }
  const converted = transferSnapshot(
    sourceSnapshot,
    bundle.caps.num_rows,
    bundle.caps.num_cols,
    snapshotFromState(state),
    bundle.model,
  );
  const snapshot = converted.snapshot;

  // Behaviors go first. A `TD(n)` or `TriggerMacro(n)` cell resolves through its
  // slot as soon as the key is written, so writing the keymap first would leave
  // those cells pointing at whatever the previous layout left behind.
  const behaviors = await writeBehaviors(snapshot, session, bundle, state, dispatch);
  const changedKeys = await writeChangedKeys(snapshot, session, bundle, state, dispatch);
  const lighting = await writeLighting(snapshot, session, state, dispatch);
  return {
    format,
    sourceBoard: converted.source,
    targetBoard: converted.target,
    converted: converted.converted,
    changedKeys,
    notes: [...parseNotes, ...converted.notes],
    applied: [...behaviors.applied, ...lighting.applied],
    skipped: [...behaviors.skipped, ...lighting.skipped],
  };
}

/** Write the tables a keymap cell addresses by index.
 *
 *  Each table is written only when the document describes it: `undefined` means
 *  the file is silent, and a file that predates these sections must leave what
 *  the keyboard holds alone rather than clearing it. A table too large for the
 *  firmware is reported instead of being written truncated, because a
 *  half-written morse table is a keymap full of cells resolving to the wrong
 *  behavior. */
async function writeBehaviors(
  snapshot: RuntimeSnapshot,
  session: RynkSession,
  bundle: ConnectedBundle,
  state: WorkbenchState,
  dispatch: Dispatch<WorkbenchAction>,
): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];
  // A document parsed by an older wasm build carries no `behaviors` at all,
  // which means the same thing as a document that describes none of the tables.
  const {
    config,
    options,
    morse_profiles,
    hold_trigger_positions,
    auto_mouse_layers,
    morses,
    combos,
    forks,
    macros,
  } = snapshot.behaviors ?? {};

  if (config !== undefined && !same(config, state.behavior)) {
    const prev = state.behavior;
    dispatch({ type: "behaviorWriteStart", config });
    try {
      await session.behavior.set(config);
      dispatch({ type: "behaviorWriteOk" });
      applied.push("global behavior timing");
    } catch (error) {
      dispatch({ type: "behaviorWriteErr", prev, message: errorMessage(error) });
      throw new Error(`Writing global behavior timing: ${errorMessage(error)}`);
    }
  }

  if (options !== undefined && !same(options, state.behaviorOptions)) {
    const prev = state.behaviorOptions;
    dispatch({ type: "behaviorOptionsWriteStart", options });
    try {
      await session.behavior.setOptions(options);
      dispatch({ type: "behaviorOptionsWriteOk" });
      applied.push("behavior options");
    } catch (error) {
      dispatch({ type: "behaviorOptionsWriteErr", prev, message: errorMessage(error) });
      throw new Error(`Writing behavior options: ${errorMessage(error)}`);
    }
  }

  if (morse_profiles !== undefined) {
    const invalidEntry = morse_profiles.find(
      (entry) => entry.index >= state.morseProfileCapacity,
    );
    if (invalidEntry !== undefined) {
      skipped.push(
        `morse profiles (slot ${invalidEntry.index}; this keyboard holds ${state.morseProfileCapacity} slots)`,
      );
    } else {
      let changed = 0;
      for (const entry of morse_profiles) {
        const prev =
          state.morseProfiles.find((candidate) => candidate.index === entry.index) ?? null;
        if (prev && same(entry, prev)) continue;
        dispatch({ type: "morseProfileWriteStart", entry });
        try {
          await session.behavior.setProfile(entry);
          dispatch({ type: "morseProfileWriteOk", index: entry.index });
          changed += 1;
        } catch (error) {
          dispatch({
            type: "morseProfileWriteErr",
            index: entry.index,
            prev,
            message: errorMessage(error),
          });
          throw new Error(`Writing morse profile ${entry.index}: ${errorMessage(error)}`);
        }
      }
      const desiredIndexes = new Set(morse_profiles.map((entry) => entry.index));
      for (const prev of state.morseProfiles.filter(
        (entry) => !desiredIndexes.has(entry.index),
      )) {
        dispatch({ type: "morseProfileDeleteStart", index: prev.index });
        try {
          await session.behavior.deleteProfile(prev.index);
          dispatch({ type: "morseProfileDeleteOk", index: prev.index });
          changed += 1;
        } catch (error) {
          dispatch({
            type: "morseProfileDeleteErr",
            entry: prev,
            positions: state.morseHoldTriggerPositions,
            message: errorMessage(error),
          });
          throw new Error(`Deleting morse profile ${prev.index}: ${errorMessage(error)}`);
        }
      }
      if (changed > 0) applied.push(`${changed} morse profile${changed === 1 ? "" : "s"}`);
    }
  }

  if (hold_trigger_positions !== undefined) {
    const capacity = state.morseHoldTriggerPositionCapacity;
    const invalidProfile = hold_trigger_positions.find(
      (position) =>
        position.profile !== 255 && position.profile >= state.morseProfileCapacity,
    );
    if (capacity === null) {
      skipped.push("morse hold trigger positions (unsupported by this keyboard)");
    } else if (hold_trigger_positions.length > capacity) {
      skipped.push(
        `morse hold trigger positions (${hold_trigger_positions.length}; this keyboard holds ${capacity})`,
      );
    } else if (invalidProfile !== undefined) {
      skipped.push(
        `morse hold trigger positions (profile ${invalidProfile.profile}; this keyboard holds ${state.morseProfileCapacity} profile slots)`,
      );
    } else if (!same(hold_trigger_positions, state.morseHoldTriggerPositions)) {
      const prev = state.morseHoldTriggerPositions;
      dispatch({ type: "holdTriggerPositionsWriteStart", positions: hold_trigger_positions });
      try {
        await session.behavior.setHoldTriggerPositions(hold_trigger_positions);
        dispatch({ type: "holdTriggerPositionsWriteOk" });
        applied.push(
          `${hold_trigger_positions.length} morse hold trigger position${hold_trigger_positions.length === 1 ? "" : "s"}`,
        );
      } catch (error) {
        dispatch({
          type: "holdTriggerPositionsWriteErr",
          prev,
          message: errorMessage(error),
        });
        throw new Error(`Writing morse hold trigger positions: ${errorMessage(error)}`);
      }
    }
  }

  if (auto_mouse_layers !== undefined) {
    if (auto_mouse_layers.length > state.autoMouseLayerCapacity) {
      skipped.push(
        `auto-mouse layers (${auto_mouse_layers.length}; this keyboard holds ${state.autoMouseLayerCapacity})`,
      );
    } else if (!same(auto_mouse_layers, state.autoMouseLayers)) {
      const prev = state.autoMouseLayers;
      dispatch({ type: "autoMouseWriteStart", configs: auto_mouse_layers });
      try {
        await session.behavior.setAutoMouseLayers(auto_mouse_layers);
        dispatch({ type: "autoMouseWriteOk" });
        applied.push(`${auto_mouse_layers.length} auto-mouse layer${auto_mouse_layers.length === 1 ? "" : "s"}`);
      } catch (error) {
        dispatch({ type: "autoMouseWriteErr", prev, message: errorMessage(error) });
        throw new Error(`Writing auto-mouse layers: ${errorMessage(error)}`);
      }
    }
  }

  if (macros !== undefined) {
    const bytes = new Uint8Array(macros);
    if (bytes.length > bundle.caps.macro_space_size) {
      skipped.push(
        `macros (${bytes.length} B; this keyboard holds ${bundle.caps.macro_space_size} B)`,
      );
    } else if (!same([...bytes], [...state.macroBytes])) {
      const prev = state.macroBytes;
      dispatch({ type: "macrosWriteStart", bytes });
      try {
        await session.macros.write(bytes);
        dispatch({ type: "macrosWriteOk" });
        applied.push(`${bytes.length} B of macro space`);
      } catch (error) {
        dispatch({ type: "macrosWriteErr", prev, message: errorMessage(error) });
        throw new Error(`Writing macro space: ${errorMessage(error)}`);
      }
    }
  }

  const table = async (
    kind: "morse" | "combos" | "forks",
    wanted: Morse[] | ComboDefinition[] | Fork[] | undefined,
    capacity: number,
    noun: string,
  ) => {
    if (wanted === undefined) return;
    if (wanted.length > capacity) {
      skipped.push(`${noun} (${wanted.length}; this keyboard holds ${capacity})`);
      return;
    }
    let changed = 0;
    for (let index = 0; index < wanted.length; index += 1) {
      const value = wanted[index];
      const prev = state[kind][index];
      if (same(value, prev)) continue;
      dispatch({ type: "slotWriteStart", kind, index, value });
      try {
        if (kind === "morse") await session.morse.set(index, value as Morse);
        else if (kind === "combos") await session.combos.set(index, value as ComboDefinition);
        else await session.forks.set(index, value as Fork);
        dispatch({ type: "slotWriteOk", kind, index });
        changed += 1;
      } catch (error) {
        dispatch({ type: "slotWriteErr", kind, index, prev, message: errorMessage(error) });
        throw new Error(`Writing ${noun} slot ${index}: ${errorMessage(error)}`);
      }
    }
    if (changed > 0) applied.push(`${changed} ${noun} slot${changed === 1 ? "" : "s"}`);
  };

  await table("morse", morses, bundle.caps.max_morse, "morse");
  await table("combos", combos, bundle.caps.max_combos, "combo");
  await table("forks", forks, bundle.caps.max_forks, "fork");
  return { applied, skipped };
}

/** Write only the cells that differ, one key at a time with the same optimistic
 *  dispatch the editor uses, so a partial failure leaves the UI showing exactly
 *  which key refused. */
async function writeChangedKeys(
  snapshot: RuntimeSnapshot,
  session: RynkSession,
  bundle: ConnectedBundle,
  state: WorkbenchState,
  dispatch: Dispatch<WorkbenchAction>,
): Promise<number> {
  const cols = bundle.caps.num_cols;
  let changed = 0;
  for (let layer = 0; layer < snapshot.layers.length; layer += 1) {
    for (let offset = 0; offset < snapshot.layers[layer].length; offset += 1) {
      const action = snapshot.layers[layer][offset];
      const previous = state.layers[layer][offset];
      if (same(action, previous)) continue;
      const row = Math.floor(offset / cols);
      const col = offset % cols;
      dispatch({ type: "keyWriteStart", layer, row, col, action });
      try {
        await session.keymap.setKey(layer, row, col, action);
        dispatch({ type: "keyWriteOk", layer, row, col });
        changed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        dispatch({ type: "keyWriteErr", layer, row, col, prev: previous, attempted: action, message });
        throw new Error(`Writing layer ${layer} r${row},c${col}: ${message}`);
      }
    }
  }
  if (snapshot.default_layer !== state.defaultLayer) {
    await session.keymap.setDefaultLayer(snapshot.default_layer);
    dispatch({ type: "defaultLayer", layer: snapshot.default_layer });
  }
  return changed;
}

/** Apply the lighting a document carries. A MoErgo backup carries none, so this
 *  is a no-op for that format; a `glove80.toml` describes the whole managed
 *  lighting state and every part of it is written here. */
async function writeLighting(
  snapshot: RuntimeSnapshot,
  session: RynkSession,
  state: WorkbenchState,
  dispatch: Dispatch<WorkbenchAction>,
): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];
  const desired = snapshot.lighting;
  if (!desired) return { applied, skipped };

  const live = state.lightingState;
  if (
    live !== null &&
    (desired.brightness !== live.output_brightness || !same(desired.background, live.background))
  ) {
    const lightingState = await session.lighting.setState({
      output_enabled: live.output_enabled,
      output_brightness: desired.brightness,
      background: desired.background,
    });
    dispatch({ type: "lightingStateSet", state: lightingState });
    applied.push("background");
  }

  // The three-state output policy is owned by the keyboard: it is cycled from
  // the Magic layer, and this session seam exposes no setter for it. Reporting
  // the difference is the honest alternative to writing it.
  if (state.lightingOutputMode !== null && desired.output_mode !== state.lightingOutputMode.mode) {
    skipped.push(`output mode (${desired.output_mode}; set it from the keyboard)`);
  }

  if (state.scenePolicy !== null && desired.scene_policy !== state.scenePolicy) {
    const lightingState = await session.lighting.scenes.setLayerPolicy(desired.scene_policy);
    dispatch({ type: "scenePolicySet", state: lightingState, policy: desired.scene_policy });
    applied.push("scene policy");
  }

  if (!same(desired.scenes, state.scenes)) {
    const lightingState = await session.lighting.scenes.replaceScenes(desired.scenes);
    dispatch({ type: "scenesApplied", state: lightingState, cells: desired.scenes });
    applied.push(`${desired.scenes.length} scene cell${desired.scenes.length === 1 ? "" : "s"}`);
  }

  const rules = desired.conditional_scenes;
  if (rules !== undefined && !same(rules, state.runtimeConditionalScenes)) {
    const lightingState = await session.lighting.conditionalScenes.replace(rules);
    dispatch({ type: "conditionalApplied", state: lightingState, cells: rules });
    applied.push(`${rules.length} conditional rule${rules.length === 1 ? "" : "s"}`);
  }

  await writeExtension(desired, session, state, dispatch, applied);
  return { applied, skipped };
}

async function writeExtension(
  desired: NonNullable<RuntimeSnapshot["lighting"]>,
  session: RynkSession,
  state: WorkbenchState,
  dispatch: Dispatch<WorkbenchAction>,
  applied: string[],
): Promise<void> {
  const effects = desired.effects;
  if (!effects || state.lightingExtension === null) return;

  // Each extension mutation is durable, so writing an unchanged selection would
  // queue pointless flash work and an extra refresh for no visible change.
  const selectionChanged = !same(effects, state.lightingExtension.state);
  if (selectionChanged) await session.lighting.setExtensionState(effects);
  const overlayChanged =
    state.lightingExtensionLayers !== null &&
    desired.overlay !== state.lightingExtensionLayers.overlay;
  if (overlayChanged) await session.lighting.setExtensionLayers(desired.overlay);

  for (const write of desired.effect_params) {
    await session.lighting.setExtensionParam(write.effect, write.index, write.value);
  }

  if (!selectionChanged && !overlayChanged && desired.effect_params.length === 0) return;

  const [lightingState, extension, extensionLayers] = await Promise.all([
    session.lighting.state(),
    session.lighting.extension(),
    state.lightingExtensionLayers === null
      ? Promise.resolve(null)
      : session.lighting.extensionLayers(),
  ]);
  dispatch({
    type: "extensionStateSet",
    state: lightingState,
    extension: extension.state,
    extensionLayers,
  });
  applied.push("effect");
  if (desired.effect_params.length > 0) {
    applied.push(
      `${desired.effect_params.length} effect parameter${desired.effect_params.length === 1 ? "" : "s"}`,
    );
  }
}

/** Live state rendered as a document, ready to be written to a file. */
export function exportDocument(
  state: WorkbenchState,
  catalog: ExtensionCatalog,
  format: ConfigFormat,
  previous?: string,
  incompleteReads: string[] = [],
): string {
  if (incompleteReads.length > 0) {
    throw new Error(
      `Cannot export an incomplete device snapshot. Reconnect and try again.\n\nFailed reads:\n- ${incompleteReads.join("\n- ")}`,
    );
  }
  return renderDocument(snapshotFromState(state), catalog, format, previous);
}
