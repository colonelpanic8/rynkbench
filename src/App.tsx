// App root: connect flow → workbench. Providers come from the session
// registry (src/session/index.ts); a dev stub is appended in DEV builds.

import { useCallback, useEffect, useState } from "react";
import type { BoardEnrichment } from "./model/keyboard";
import { buildKeyboardModel } from "./model/keyboard";
import type {
  DeviceInfo,
  KeyAction,
  LightingCapabilities,
  LightingOverlayCell,
  LightingState,
} from "./vendor/rynk-wasm/rynk_wasm";
import type { LightingTopology, RynkSession, SessionProvider } from "./session/types";
import type { ConnectAttempt } from "./ui/ConnectScreen";
import { ConnectScreen } from "./ui/ConnectScreen";
import { Workbench } from "./ui/Workbench";
import type { ConnectedBundle } from "./ui/state";
import { errorMessage } from "./ui/state";

async function loadProviders(): Promise<SessionProvider[]> {
  let providers: SessionProvider[] = [];
  try {
    const registry = await import("./session");
    providers = registry.sessionProviders();
  } catch (err) {
    // Backend modules may not exist yet in a partial dev checkout; the dev
    // stub below keeps the UI workable. In production this is a real error.
    if (!import.meta.env.DEV) throw err;
    console.warn("session registry unavailable, continuing with dev stub only", err);
  }
  if (import.meta.env.DEV) {
    const { devStubProvider } = await import("./ui/dev/stub-session");
    providers = [...providers, devStubProvider];
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

  let topology = EMPTY_TOPOLOGY;
  let lightingCaps: LightingCapabilities | null = null;
  let lightingState: LightingState | null = null;
  let overlay: LightingOverlayCell[] = [];
  let overlayReadSupported = true;
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
      overlay = await session.lighting.readOverlay();
    } catch {
      overlayReadSupported = false;
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

  const [currentLayer, defaultLayer, battery, connection] = await Promise.all([
    session.keymap.currentLayer(),
    session.keymap.defaultLayer(),
    session.device.battery(),
    session.device.connectionStatus().catch(() => null),
  ]);

  return {
    session,
    model,
    info,
    caps,
    protocol,
    lightingCaps,
    overlayReadSupported,
    layers,
    currentLayer,
    defaultLayer,
    battery,
    connection,
    lightingState,
    overlay,
  };
}

export default function App() {
  const [providers, setProviders] = useState<SessionProvider[] | null>(null);
  const [attempt, setAttempt] = useState<ConnectAttempt | null>(null);
  const [bundle, setBundle] = useState<ConnectedBundle | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
    setAttempt(null);
  }, []);

  const unexpectedDisconnect = useCallback(() => {
    setBundle((current) => {
      if (current) setNotice(`Connection to ${current.model.name} was lost.`);
      return null;
    });
    setAttempt(null);
  }, []);

  if (bundle) {
    return (
      <Workbench
        key={bundle.session.label}
        bundle={bundle}
        onClose={close}
        onUnexpectedDisconnect={unexpectedDisconnect}
      />
    );
  }

  return (
    <ConnectScreen providers={providers} attempt={attempt} notice={notice} onConnect={connect} />
  );
}
