// Configuration documents: the seam between a file on disk and live device
// state.
//
// Both supported formats — the native `glove80.toml` and the MoErgo Layout
// Editor's JSON backup — are parsed, validated and rendered by the same Rust
// code the `glove80-control` CLI runs, compiled to wasm. Nothing here reimplements
// the formats; this module only assembles the arguments that code needs and
// restates its results in the workbench's own vocabulary.

import wasmInit, {
  detect_config_format,
  parse_config_document,
  render_config_as,
} from "../vendor/glove80-config-wasm/glove80_config_wasm";
import type {
  ConfigFormat,
  EffectParamSet,
  ExtensionCatalog,
  ImportNote,
  ParsedConfig,
  RuntimeSnapshot,
} from "../vendor/glove80-config-wasm/glove80_config_wasm";
import type { RynkSession } from "../session/types";
import type { WorkbenchState } from "../ui/state";

export type { ConfigFormat, ExtensionCatalog, ImportNote, ParsedConfig, RuntimeSnapshot };

/** The matrix the document formats describe. Both are Glove80-specific: the
 *  TOML schema and the editor's 80-key walk are written against this exact
 *  grid, so a different board needs a different format, not a different
 *  catalog. */
const ROWS = 6;
const COLS = 14;

let wasmReady: Promise<unknown> | null = null;

/** One-shot loader for the vendored document module, mirroring the session's
 *  own wasm loader: a failed init is retryable on the next attempt. */
export function initConfigWasm(): Promise<unknown> {
  wasmReady ??= wasmInit().catch((error: unknown) => {
    wasmReady = null;
    throw error;
  });
  return wasmReady;
}

export function assertSupportedMatrix(rows: number, cols: number): void {
  if (rows !== ROWS || cols !== COLS) {
    throw new Error(
      `Configuration files describe a ${ROWS}x${COLS} Glove80; this keyboard reports ${rows}x${cols}`,
    );
  }
}

/** What the connected keyboard advertises, which is what lets a file's effect,
 *  palette and parameter *names* resolve to the indices the protocol uses.
 *
 *  Reading every effect's parameter list costs one request per effect, so this
 *  is built on demand rather than during connect. Firmware predating the
 *  parameter surface rejects the request outright; that is recorded as "this
 *  effect has no parameters", exactly as the live editor treats it. */
export async function loadCatalog(
  session: RynkSession,
  state: WorkbenchState,
  effectNames: string[],
  paletteNames: string[],
): Promise<ExtensionCatalog> {
  if (state.lightingExtension === null) return { effects: [], palettes: [], params: [] };
  const params: EffectParamSet[] = [];
  for (let effect = 0; effect < effectNames.length; effect += 1) {
    const items = await session.lighting.extensionParams(effect).catch(() => []);
    if (items.length > 0) params.push({ effect, name: effectNames[effect], params: items });
  }
  return { effects: effectNames, palettes: paletteNames, params };
}

/** Live state as a snapshot, which is what an export renders and what an
 *  imported document is compared against.
 *
 *  Lighting is present only when the device has the durable surfaces a file
 *  describes. A device without them still exports a keymap, which is the whole
 *  of a MoErgo document anyway. */
export function snapshotFromState(state: WorkbenchState): RuntimeSnapshot {
  const lightingState = state.lightingState;
  const lighting =
    lightingState === null || state.scenePolicy === null
      ? undefined
      : {
          brightness: lightingState.output_brightness,
          output_mode: state.lightingOutputMode?.mode ?? "AlwaysOn",
          scene_policy: state.scenePolicy,
          background: lightingState.background,
          effects: state.lightingExtension?.state,
          overlay: state.lightingExtensionLayers?.overlay,
          // A snapshot taken from the device asserts no parameter writes: the
          // values are already whatever the device holds, and the renderer
          // reads them back out of the catalog.
          effect_params: [],
          scenes: state.scenes,
          // Distinguish "no such table in this firmware" from an empty one; a
          // file naming rules conflicts with the former and not the latter.
          conditional_scenes: state.runtimeConditionalScenes,
        };
  return {
    default_layer: state.defaultLayer,
    layers: state.layers,
    lighting,
    // Live state always describes all three, so an export never renders a file
    // that would read as "leave them alone" when it meant to record them.
    behaviors: {
      config: state.behavior ?? undefined,
      options: state.behaviorOptions ?? undefined,
      morse_profiles: state.morseProfiles.map((entry) => entry.profile),
      hold_trigger_positions:
        state.morseHoldTriggerPositionCapacity === null
          ? undefined
          : state.morseHoldTriggerPositions,
      auto_mouse_layers: state.autoMouseLayers,
      morses: state.morse,
      combos: state.combos,
      forks: state.forks,
      macros: [...state.macroBytes],
    },
  };
}

export function detectFormat(text: string): ConfigFormat {
  return detect_config_format(text);
}

/** Parse and fully validate a document before anything is written. A document
 *  that cannot be represented fails here, naming the exact layer and key, so a
 *  bad file never leaves the keyboard half-written. */
export function parseDocument(text: string, catalog: ExtensionCatalog): ParsedConfig {
  return parse_config_document(text, catalog);
}

/** Render live state as a document. `previous` is the file being replaced: it
 *  carries the layer labels the firmware does not store, and for MoErgo output
 *  it is also the template that preserves the editor-owned sections — macros,
 *  combos, custom behaviors, the document's identity — that Rynk never sees. */
export function renderDocument(
  snapshot: RuntimeSnapshot,
  catalog: ExtensionCatalog,
  format: ConfigFormat,
  previous?: string,
): string {
  return render_config_as(snapshot, catalog, format, previous);
}

export const FORMAT_LABEL: Record<ConfigFormat, string> = {
  toml: "TOML",
  "moergo-json": "MoErgo JSON",
};

export const FORMAT_EXTENSION: Record<ConfigFormat, string> = {
  toml: "toml",
  "moergo-json": "json",
};
