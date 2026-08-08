// App root: connect flow → workbench. Hardware providers come from the session
// registry; simulated providers are loaded only in an explicitly opted-in build.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardEnrichment } from "./model/keyboard";
import { buildKeyboardModel } from "./model/keyboard";
import type {
  DeviceInfo,
  KeyAction,
  LightingCapabilities,
  LightingCompiledSceneStatus,
  LightingConditionalSceneCell,
  LightingExtendedConditionalSceneCell,
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
} from "./vendor/rynk-wasm/rynk_wasm";
import type { LightingTopology, RynkSession, SessionProvider } from "./session/types";
import { RECONNECT_DELAYS_MS, retryReconnect } from "./session/reconnect";
import type { ConnectAttempt } from "./ui/ConnectScreen";
import { ConnectScreen } from "./ui/ConnectScreen";
import { SpinnerIcon } from "./ui/icons";
import { Workbench } from "./ui/Workbench";
import type { ConnectedBundle } from "./ui/state";
import { errorMessage } from "./ui/state";

const MOCKS_ENABLED = import.meta.env.VITE_ENABLE_MOCKS === "1";

async function loadProviders(): Promise<SessionProvider[]> {
  let providers: SessionProvider[] = [];
  try {
    const registry = await import("./session");
    providers = registry.sessionProviders();
  } catch (err) {
    // Backend modules may not exist yet in a partial dev checkout. In
    // production this is a real error; an opted-in dev build may use mocks.
    if (!import.meta.env.DEV) throw err;
    console.warn("session registry unavailable", err);
  }
  if (MOCKS_ENABLED) {
    const { mockProviders } = await import("./session/mock");
    providers = [...providers, ...mockProviders];
    if (import.meta.env.DEV) {
      const { devStubProvider } = await import("./ui/dev/stub-session");
      providers = [...providers, devStubProvider];
    }
  }
  return providers;
}

async function loadEnrichment(info: DeviceInfo): Promise<BoardEnrichment | undefined> {
  try {
    const mod = await import("./ui/enrichment");
    return mod.enrichmentFor(info);
  } catch {
    // src/model/boards is built in parallel; tolerate its absence in dev.
    return undefined;
  }
}

const EMPTY_TOPOLOGY: LightingTopology = {
  revision: 0,
  keys: [],
  physicalKeys: [],
  leds: [],
  routes: [],
  zones: [],
  zoneMemberships: [],
};

async function openBundle(session: RynkSession): Promise<ConnectedBundle> {
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
  let runtimeConditionalScenes: LightingExtendedConditionalSceneCell[] = [];
  let lightingExtension: LightingExtension | null = null;
  let lightingExtensionLayers: LightingExtensionLayers | null = null;
  let extensionEffectNames: string[] = [];
  let extensionPaletteNames: string[] = [];
  if (caps.lighting_enabled) {
    try {
      [topology, lightingCaps, lightingState] = await Promise.all([
        session.lighting.topology(),
        session.lighting.capabilities(),
        session.lighting.state(),
      ]);
    } catch {
      topology = EMPTY_TOPOLOGY;
    }
    try {
      lightingOutputMode = await session.lighting.outputMode();
    } catch {
      lightingOutputMode = null;
    }
    try {
      overlay = await session.lighting.readOverlay();
    } catch {
      overlayReadSupported = false;
    }
    // Layer scenes are a newer firmware feature; a rejected status read just
    // means this device falls back to browser-local layer presets.
    try {
      const status = await session.lighting.scenes.sceneStatus();
      if (status.capacity > 0) {
        sceneStatus = status;
        scenes = await session.lighting.scenes.readScenes();
      }
    } catch {
      sceneStatus = null;
    }
    // Compiled scenes are an immutable, independently composited source. Old
    // firmware simply rejects discovery and continues with an empty source.
    try {
      compiledSceneStatus = await session.lighting.scenes.compiledStatus();
      compiledScenes = await session.lighting.scenes.readCompiledScenes();
    } catch {
      compiledSceneStatus = null;
    }
    // Conditional rules and board-level lighting controls are compiled from
    // keyboard.toml and exposed as another immutable firmware source.
    try {
      const status = await session.lighting.scenes.conditionalStatus();
      lightingControls = status.controls;
      conditionalScenes = await session.lighting.scenes.readConditionalScenes();
    } catch {
      conditionalScenes = [];
    }
    // The mutable ordered conditional table is a newer, additive surface.
    // Firmware without it reports no table at all, and the editor is hidden
    // entirely — "unsupported" (status null) is distinct from "empty table".
    try {
      const status = await session.lighting.conditionalScenes.status();
      if (status.capacity > 0) {
        runtimeConditionalStatus = status;
        runtimeConditionalScenes = await session.lighting.conditionalScenes.read();
      }
    } catch {
      runtimeConditionalStatus = null;
      runtimeConditionalScenes = [];
    }
    // Extension effects (animated effect packs with selectable palettes) are
    // feature-gated newer firmware; absence just hides the panel.
    try {
      lightingExtension = await session.lighting.extension();
      lightingExtensionLayers = await session.lighting.extensionLayers().catch(() => null);
      [extensionEffectNames, extensionPaletteNames] = await Promise.all([
        session.lighting.extensionNames("Effects"),
        session.lighting.extensionNames("Palettes"),
      ]);
    } catch {
      lightingExtension = null;
      lightingExtensionLayers = null;
      extensionEffectNames = [];
      extensionPaletteNames = [];
    }
  }

  const enrichment = await loadEnrichment(info);
  const model = buildKeyboardModel(layout, topology, {
    enrichment,
    fallbackName: info.product_name,
  });

  const layerKeymaps = await session.keymap.readAll();
  const layers: KeyAction[][] = Array.from({ length: caps.num_layers }, (_, i) => {
    return layerKeymaps.find((l) => l.layer === i)?.actions ?? [];
  });

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

  // Advanced tables — every read is capability-gated and failure-tolerant so
  // sparse firmware degrades to hidden features, never a failed connect.
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
  ] =
    await Promise.all([
      caps.max_combos > 0 ? session.combos.readAll().catch(() => []) : [],
      caps.max_morse > 0 ? session.morse.readAll().catch(() => []) : [],
      caps.max_forks > 0 ? session.forks.readAll().catch(() => []) : [],
      caps.macro_space_size > 0
        ? session.macros.read().catch(() => new Uint8Array(0))
        : new Uint8Array(0),
      session.behavior.get().catch(() => null),
      session.behavior.options().catch(() => null),
      session.behavior.profiles().catch(() => []),
      session.behavior.holdTriggerPositions().catch(() => null),
      session.behavior.autoMouseLayers().catch(() => null),
      session.device.ledIndicator().catch(() => null),
      session.device.modifierState().catch((): ModifierCombination | null => null),
    ]);

  return {
    session,
    model,
    info,
    caps,
    protocol,
    build,
    lightingCaps,
    overlayReadSupported,
    layers,
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
    morseProfiles,
    morseHoldTriggerPositionCapacity: holdTriggerPositions?.capacity ?? null,
    morseHoldTriggerPositions: holdTriggerPositions?.positions ?? [],
    autoMouseLayerCapacity: autoMouse?.capacity ?? 0,
    autoMouseLayers: autoMouse?.configs ?? [],
    ledIndicator,
    modifierState,
  };
}

export default function App() {
  const [providers, setProviders] = useState<SessionProvider[] | null>(null);
  const [attempt, setAttempt] = useState<ConnectAttempt | null>(null);
  const [bundle, setBundle] = useState<ConnectedBundle | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reconnectAttempt, setReconnectAttempt] = useState<{ attempt: number; total: number } | null>(
    null,
  );
  const bundleRef = useRef<ConnectedBundle | null>(null);
  const providerIndexRef = useRef<number | null>(null);
  const reconnectingSessionRef = useRef<RynkSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadProviders().then(
      (list) => {
        if (!cancelled) setProviders(list);
      },
      (err) => {
        if (!cancelled) {
          setProviders([]);
          setNotice(`Failed to load backends: ${errorMessage(err)}`);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(
    async (index: number) => {
      const provider = providers?.[index];
      if (!provider) return;
      setNotice(null);
      setAttempt({ providerIndex: index, status: "connecting" });
      let session: RynkSession | null = null;
      try {
        session = await provider.connect();
        const loaded = await openBundle(session);
        bundleRef.current = loaded;
        providerIndexRef.current = index;
        setBundle(loaded);
        setAttempt(null);
      } catch (err) {
        await session?.close().catch(() => {});
        setAttempt({ providerIndex: index, status: "error", message: errorMessage(err) });
      }
    },
    [providers],
  );

  const close = useCallback(() => {
    setBundle((current) => {
      current?.session.close().catch(() => {});
      return null;
    });
    bundleRef.current = null;
    providerIndexRef.current = null;
    setReconnectAttempt(null);
    setAttempt(null);
  }, []);

  const unexpectedDisconnect = useCallback(
    (droppedSession: RynkSession) => {
      const current = bundleRef.current;
      const providerIndex = providerIndexRef.current;
      if (
        !current ||
        current.session !== droppedSession ||
        providerIndex === null ||
        reconnectingSessionRef.current
      )
        return;

      const provider = providers?.[providerIndex];
      if (!provider) return;
      reconnectingSessionRef.current = droppedSession;
      setReconnectAttempt({ attempt: 0, total: RECONNECT_DELAYS_MS.length });
      setNotice(null);

      void (async () => {
        await droppedSession.close().catch(() => {});
        try {
          const loaded = await retryReconnect(
            async () => {
              let session: RynkSession | null = null;
              try {
                session = await provider.reconnect();
                return await openBundle(session);
              } catch (error) {
                await session?.close().catch(() => {});
                throw error;
              }
            },
            {
              onAttempt: (attempt, total) => setReconnectAttempt({ attempt, total }),
            },
          );

          // Ignore a stale completion if this session ceased being the active
          // recovery while its async work was in flight.
          if (reconnectingSessionRef.current !== droppedSession) {
            await loaded.session.close().catch(() => {});
            return;
          }
          bundleRef.current = loaded;
          setBundle(loaded);
          setAttempt(null);
        } catch (error) {
          if (reconnectingSessionRef.current !== droppedSession) return;
          bundleRef.current = null;
          setBundle(null);
          setNotice(`Connection to ${current.model.name} was lost and could not be restored.`);
          setAttempt({ providerIndex, status: "error", message: errorMessage(error) });
        } finally {
          if (reconnectingSessionRef.current === droppedSession) {
            reconnectingSessionRef.current = null;
            setReconnectAttempt(null);
          }
        }
      })();
    },
    [providers],
  );

  if (bundle) {
    return (
      <div className="relative h-full">
        <Workbench
          key={bundle.session.label}
          bundle={bundle}
          onClose={close}
          onUnexpectedDisconnect={unexpectedDisconnect}
        />
        {reconnectAttempt && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-bg/72 backdrop-blur-[2px]"
            role="status"
            aria-live="assertive"
          >
            <div className="flex min-w-72 flex-col items-center rounded-2xl border border-line bg-panel px-8 py-7 shadow-2xl">
              <SpinnerIcon size={24} className="text-accent" />
              <div className="mt-4 text-[15px] font-semibold text-ink">Reconnecting to keyboard…</div>
              <div className="mt-1 text-[12.5px] text-mute">
                {reconnectAttempt.attempt > 0
                  ? `Attempt ${reconnectAttempt.attempt} of ${reconnectAttempt.total}`
                  : "Preparing connection recovery"}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <ConnectScreen providers={providers} attempt={attempt} notice={notice} onConnect={connect} />
  );
}
