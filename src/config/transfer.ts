// Moving a configuration document between a file and the keyboard.
//
// Every document is parsed and fully validated before a single write goes out,
// so a file that cannot be represented fails with the exact layer and key it
// failed on rather than leaving the keyboard half-written. Only differences are
// written: an import that matches the device is a no-op, which is what makes
// re-importing a file a safe way to check it.

import type { Dispatch } from "react";
import type { RynkSession } from "../session/types";
import type { ConnectedBundle, WorkbenchAction, WorkbenchState } from "../ui/state";
import {
  assertSupportedMatrix,
  parseDocument,
  renderDocument,
  snapshotFromState,
} from "./document";
import type { ConfigFormat, ExtensionCatalog, RuntimeSnapshot } from "./document";

export interface ImportResult {
  format: ConfigFormat;
  changedKeys: number;
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
  assertSupportedMatrix(bundle.caps.num_rows, bundle.caps.num_cols);

  const { format, snapshot } = parseDocument(text, catalog);
  if (snapshot.layers.length > bundle.caps.num_layers) {
    throw new Error(
      `Layout has ${snapshot.layers.length} layers; this keyboard supports ${bundle.caps.num_layers}`,
    );
  }

  const changedKeys = await writeChangedKeys(snapshot, session, bundle, state, dispatch);
  const { applied, skipped } = await writeLighting(snapshot, session, state, dispatch);
  return { format, changedKeys, applied, skipped };
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
): string {
  return renderDocument(snapshotFromState(state), catalog, format, previous);
}
