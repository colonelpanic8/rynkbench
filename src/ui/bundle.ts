// The connect-time snapshot: everything the workbench needs read off a freshly
// opened session, in one pass, before it mounts. Reads that the firmware may
// legitimately not support fall back to "absent"; reads that fail for any
// other reason are recorded in `incompleteReads` so export can refuse to turn
// a fallback into a lossy file.

import type {
  LightingCapabilities,
  LightingCompiledSceneStatus,
  LightingConditionalSceneCell,
  LightingAdvancedConditionalSceneCell,
  LightingControls,
  LightingExtension,
  LightingExtensionLayers,
  LightingOverlayCell,
  LightingOutputModeState,
  LightingRuntimeConditionalSceneStatus,
  LightingSceneCell,
  LightingSceneStatus,
  LightingState,
  ModifierCombination,
  PointingCapabilities,
  PointingConfig,
} from "../vendor/rynk-wasm/rynk_wasm";
import { buildKeyboardModel } from "../model/keyboard";
import { resolveBoardProfile } from "../model/boards";
import type { LayerMetadata, LightingTopology, RynkSession } from "../session/types";
import { isUnsupportedError } from "../session/unsupported";
import type { ConnectedBundle } from "./state";
import { errorMessage } from "./state";

const EMPTY_TOPOLOGY: LightingTopology = {
  revision: 0,
  keys: [],
  physicalKeys: [],
  leds: [],
  routes: [],
  zones: [],
  zoneMemberships: [],
};

export async function openBundle(session: RynkSession): Promise<ConnectedBundle> {
  const incompleteReads: string[] = [];
  /** A read whose failure is always a fault worth reporting. */
  const requiredRead = async <T,>(label: string, read: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await read;
    } catch (error) {
      incompleteReads.push(`${label}: ${errorMessage(error)}`);
      return fallback;
    }
  };
  /** A read the firmware may not implement; only other failures are faults. */
  const optionalRead = async <T,>(label: string, read: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await read;
    } catch (error) {
      if (!isUnsupportedError(error)) incompleteReads.push(`${label}: ${errorMessage(error)}`);
      return fallback;
    }
  };

  const [info, caps, protocol, layout] = await Promise.all([
    session.device.info(),
    session.device.capabilities(),
    session.device.protocolVersion(),
    session.device.layout(),
  ]);

  // Firmware predating GetBuildInfo answers UnknownCmd. That is a missing
  // diagnostic, never a reason to refuse the connection.
  const build = await session.device.buildInfo().catch(() => null);

  let topology = EMPTY_TOPOLOGY;
  let lightingCaps: LightingCapabilities | null = null;
  let lightingState: LightingState | null = null;
  let lightingOutputMode: LightingOutputModeState | null = null;
  let overlay: LightingOverlayCell[] = [];
  let overlayReadSupported = true;
  let sceneStatus: LightingSceneStatus | null = null;
  let scenes: LightingSceneCell[] = [];
  let compiledSceneStatus: LightingCompiledSceneStatus | null = null;
  let compiledScenes: LightingSceneCell[] = [];
  let conditionalScenes: LightingConditionalSceneCell[] = [];
  let lightingControls: LightingControls = {
    output_toggle_user_action: undefined,
    wake_layers: 0,
  };
  let runtimeConditionalStatus: LightingRuntimeConditionalSceneStatus | null = null;
  let runtimeConditionalScenes: LightingAdvancedConditionalSceneCell[] = [];
  let lightingExtension: LightingExtension | null = null;
  let lightingExtensionLayers: LightingExtensionLayers | null = null;
  let extensionEffectNames: string[] = [];
  let extensionPaletteNames: string[] = [];
  if (caps.lighting_enabled) {
    [topology, lightingCaps, lightingState] = await Promise.all([
      requiredRead("lighting topology", session.lighting.topology(), EMPTY_TOPOLOGY),
      requiredRead("lighting capabilities", session.lighting.capabilities(), null),
      requiredRead("lighting state", session.lighting.state(), null),
    ]);
    lightingOutputMode = await optionalRead(
      "lighting output mode",
      session.lighting.outputMode(),
      null,
    );
    try {
      overlay = await session.lighting.readOverlay();
    } catch (error) {
      if (isUnsupportedError(error)) overlayReadSupported = false;
      else incompleteReads.push(`lighting overlay: ${errorMessage(error)}`);
    }
    // Firmware without layer scenes falls back to browser-local presets.
    try {
      const status = await session.lighting.scenes.sceneStatus();
      if (status.capacity > 0) {
        sceneStatus = status;
        scenes = await requiredRead("lighting scenes", session.lighting.scenes.readScenes(), []);
      }
    } catch (error) {
      if (!isUnsupportedError(error)) {
        incompleteReads.push(`lighting scene status: ${errorMessage(error)}`);
      }
      sceneStatus = null;
    }
    // Compiled scenes are an immutable, independently composited source. Old
    // firmware simply rejects discovery and continues with an empty source.
    compiledSceneStatus = await optionalRead(
      "compiled lighting scene status", session.lighting.scenes.compiledStatus(), null,
    );
    if (compiledSceneStatus !== null) {
      compiledScenes = await requiredRead(
        "compiled lighting scenes", session.lighting.scenes.readCompiledScenes(), [],
      );
    }
    // Conditional rules and board-level lighting controls are compiled from
    // keyboard.toml and exposed as another immutable firmware source.
    const status = await optionalRead(
      "compiled conditional lighting status", session.lighting.scenes.conditionalStatus(), null,
    );
    if (status !== null) {
      lightingControls = status.controls;
      conditionalScenes = await requiredRead(
        "compiled conditional lighting scenes", session.lighting.scenes.readConditionalScenes(), [],
      );
    }
    // The mutable ordered conditional table is a newer, additive surface.
    // Firmware without it reports no table at all, and the editor is hidden
    // entirely — "unsupported" (status null) is distinct from "empty table".
    try {
      const status = await session.lighting.conditionalScenes.status();
      if (status.capacity > 0) {
        runtimeConditionalStatus = status;
        runtimeConditionalScenes = await requiredRead(
          "conditional lighting scenes",
          session.lighting.conditionalScenes.read(),
          [],
        );
      }
    } catch (error) {
      if (!isUnsupportedError(error)) {
        incompleteReads.push(`conditional lighting status: ${errorMessage(error)}`);
      }
      runtimeConditionalStatus = null;
      runtimeConditionalScenes = [];
    }
    // Extension effects (animated effect packs with selectable palettes) are
    // feature-gated newer firmware; absence just hides the panel.
    try {
      lightingExtension = await session.lighting.extension();
      lightingExtensionLayers = await optionalRead(
        "lighting extension layers",
        session.lighting.extensionLayers(),
        null,
      );
      [extensionEffectNames, extensionPaletteNames] = await Promise.all([
        requiredRead("lighting effect names", session.lighting.extensionNames("Effects"), []),
        requiredRead("lighting palette names", session.lighting.extensionNames("Palettes"), []),
      ]);
    } catch (error) {
      if (!isUnsupportedError(error)) {
        incompleteReads.push(`lighting extension: ${errorMessage(error)}`);
      }
      lightingExtension = null;
      lightingExtensionLayers = null;
      extensionEffectNames = [];
      extensionPaletteNames = [];
    }
  }

  const boardProfile = resolveBoardProfile(info, caps);
  const model = buildKeyboardModel(layout, topology, {
    enrichment: boardProfile?.enrichment,
    fallbackName: info.product_name,
  });

  const layerKeymaps = await session.keymap.readAll();
  const expectedKeys = caps.num_rows * caps.num_cols;
  const layers = Array.from({ length: caps.num_layers }, (_, i) => {
    const keymap = layerKeymaps.find((candidate) => candidate.layer === i);
    if (!keymap) throw new Error(`keymap read omitted layer ${i}`);
    if (keymap.actions.length !== expectedKeys) {
      throw new Error(
        `keymap layer ${i} returned ${keymap.actions.length} keys; expected ${expectedKeys}`,
      );
    }
    return keymap.actions;
  });
  let layerMetadata: LayerMetadata[] | null = null;
  try {
    layerMetadata = await Promise.all(
      Array.from({ length: caps.num_layers }, (_, layer) =>
        session.keymap.getLayerMetadata(layer),
      ),
    );
  } catch (error) {
    if (!isUnsupportedError(error)) {
      incompleteReads.push(`layer metadata: ${errorMessage(error)}`);
    }
  }
  // A failed pointing read is not proof that the firmware lacks the feature.
  // Keep the reason, so the trackpad inspector can offer a re-read instead of
  // telling the user their firmware cannot do something it can.
  let pointingConfig: PointingConfig | null = null;
  let pointingReadError: string | null = null;
  try {
    pointingConfig = await session.pointing.get();
  } catch (error) {
    if (!isUnsupportedError(error)) {
      pointingReadError = errorMessage(error);
      incompleteReads.push(`pointing configuration: ${pointingReadError}`);
    }
  }
  const pointingCapabilities =
    pointingConfig === null
      ? null
      : await optionalRead<PointingCapabilities>(
          "pointing capabilities",
          session.pointing.capabilities(),
          { mode_flags: 0 },
        );

  const [layerState, battery, connection, peripheralBattery] = await Promise.all([
    session.keymap.layerState(),
    session.device.battery().catch(() => "Unavailable" as const),
    session.device.connectionStatus().catch(() => null),
    caps.num_split_peripherals > 0
      ? session.device
          .peripheralStatus(0)
          .then((status) => status.battery)
          .catch(() => "Unavailable" as const)
      : Promise.resolve("Unavailable" as const),
  ]);
  const activeLayers = layerState.activeLayers.filter((layer) => layer < caps.num_layers);
  const defaultLayer = layerState.defaultLayer;
  const currentLayer = Math.max(defaultLayer, ...activeLayers);

  // Advanced tables are capability-gated. Failed advertised reads are retained
  // as diagnostics so the workbench can open, but export cannot mistake the
  // fallback for an intentionally empty table.
  const [
    combos,
    morse,
    forks,
    macroBytes,
    behavior,
    behaviorOptions,
    morseProfiles,
    holdTriggerPositions,
    autoMouse,
    ledIndicator,
    modifierState,
  ] = await Promise.all([
    caps.max_combos > 0 ? requiredRead("combos", session.combos.readAll(), []) : [],
    caps.max_morse > 0 ? requiredRead("morse table", session.morse.readAll(), []) : [],
    caps.max_forks > 0 ? requiredRead("fork table", session.forks.readAll(), []) : [],
    caps.macro_space_size > 0
      ? requiredRead("macro buffer", session.macros.read(), new Uint8Array(0))
      : new Uint8Array(0),
    optionalRead("behavior timing", session.behavior.get(), null),
    optionalRead("behavior options", session.behavior.options(), null),
    optionalRead("morse profiles", session.behavior.profiles(), {
      capacity: 0,
      total: 0,
      entries: [],
    }),
    optionalRead("morse hold-trigger positions", session.behavior.holdTriggerPositions(), null),
    optionalRead("auto-mouse layers", session.behavior.autoMouseLayers(), null),
    session.device.ledIndicator().catch(() => null),
    session.device.modifierState().catch((): ModifierCombination | null => null),
  ]);

  return {
    session,
    incompleteReads,
    boardProfile,
    model,
    info,
    caps,
    protocol,
    build,
    lightingCaps,
    overlayReadSupported,
    layers,
    layerMetadata,
    pointingConfig,
    pointingReadError,
    pointingCapabilities,
    currentLayer,
    defaultLayer,
    activeLayers,
    layerStateComplete: layerState.complete,
    battery,
    peripheralBattery,
    connection,
    lightingState,
    lightingOutputMode,
    overlay,
    sceneStatus,
    scenes,
    compiledSceneStatus,
    compiledScenes,
    conditionalScenes,
    lightingControls,
    runtimeConditionalStatus,
    runtimeConditionalScenes,
    lightingExtension,
    lightingExtensionLayers,
    extensionEffectNames,
    extensionPaletteNames,
    combos,
    morse,
    forks,
    macroBytes,
    behavior,
    behaviorOptions,
    morseProfileCapacity: morseProfiles.capacity,
    morseProfiles: morseProfiles.entries,
    morseHoldTriggerPositionCapacity: holdTriggerPositions?.capacity ?? null,
    morseHoldTriggerPositions: holdTriggerPositions?.positions ?? [],
    autoMouseLayerCapacity: autoMouse?.capacity ?? 0,
    autoMouseLayers: autoMouse?.configs ?? [],
    ledIndicator,
    modifierState,
  };
}
