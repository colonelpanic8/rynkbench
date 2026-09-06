// App root: connect flow → workbench. Hardware providers come from the session
// registry; simulated providers are loaded only in an explicitly opted-in build.

import { useCallback, useEffect, useRef, useState } from "react";
import { initConfigWasm, parseDocument } from "./config/document";
import { sessionProviders } from "./session";
import { RECONNECT_DELAYS_MS, retryReconnect } from "./session/reconnect";
import type { RynkSession, SessionProvider, SessionTarget } from "./session/types";
import { openBundle } from "./ui/bundle";
import type { ConnectAttempt } from "./ui/ConnectScreen";
import { ConnectScreen } from "./ui/ConnectScreen";
import { SpinnerIcon } from "./ui/icons";
import { Workbench } from "./ui/Workbench";
import type { ConnectedBundle } from "./ui/state";
import { errorMessage } from "./ui/state";

const MOCKS_ENABLED = import.meta.env.VITE_ENABLE_MOCKS === "1";

/** The hardware registry, plus the simulated boards when a build opts in.
 *  Those stay behind a dynamic import so a production bundle never carries
 *  them. */
async function loadProviders(): Promise<SessionProvider[]> {
  if (!MOCKS_ENABLED) return sessionProviders();
  const { mockProviders } = await import("./session/mock");
  return [...sessionProviders(), ...mockProviders];
}

export default function App() {
  const [providers, setProviders] = useState<SessionProvider[] | null>(null);
  const [attempt, setAttempt] = useState<ConnectAttempt | null>(null);
  const [bundle, setBundle] = useState<ConnectedBundle | null>(null);
  const [connectionId, setConnectionId] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [offlineBusy, setOfflineBusy] = useState(false);
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

  const adopt = useCallback((loaded: ConnectedBundle, providerIndex: number | null) => {
    bundleRef.current = loaded;
    providerIndexRef.current = providerIndex;
    setBundle(loaded);
    setConnectionId((id) => id + 1);
    reconnectingSessionRef.current = null;
    setReconnectAttempt(null);
    setAttempt(null);
  }, []);

  const connect = useCallback(
    async (index: number, selectedTargetId?: string) => {
      const provider = providers?.[index];
      if (!provider) return;
      setNotice(null);
      setAttempt({ providerIndex: index, status: "connecting" });
      let session: RynkSession | null = null;
      try {
        let targetId = selectedTargetId;
        if (provider.listTargets && targetId === undefined) {
          const targets: SessionTarget[] = await provider.listTargets();
          if (targets.length > 1) {
            setAttempt({ providerIndex: index, status: "selecting", targets });
            return;
          }
          targetId = targets[0]?.id;
        }
        session = await provider.connect(targetId);
        adopt(await openBundle(session), index);
      } catch (err) {
        await session?.close().catch(() => {});
        setAttempt({ providerIndex: index, status: "error", message: errorMessage(err) });
      }
    },
    [adopt, providers],
  );

  const close = useCallback(() => {
    reconnectingSessionRef.current = null;
    bundleRef.current?.session.close().catch(() => {});
    bundleRef.current = null;
    providerIndexRef.current = null;
    setBundle(null);
    setReconnectAttempt(null);
    setAttempt(null);
  }, []);

  const openOffline = useCallback(
    async (file?: File) => {
      setNotice(null);
      setOfflineBusy(true);
      let session: RynkSession | null = null;
      try {
        const offline = await import("./session/offline/glove80");
        await initConfigWasm();
        const sourceText = file ? await file.text() : null;
        const parsed =
          sourceText === null ? null : parseDocument(sourceText, offline.offlineGlove80Catalog());
        session = offline.openOfflineGlove80(parsed?.snapshot);
        const loaded = await openBundle(session);
        loaded.workspace = {
          name: file?.name ?? "untitled-glove80.toml",
          sourceText,
          format: parsed?.format ?? "toml",
        };
        adopt(loaded, null);
      } catch (error) {
        await session?.close().catch(() => {});
        setNotice(`Could not open configuration: ${errorMessage(error)}`);
      } finally {
        setOfflineBusy(false);
      }
    },
    [adopt],
  );

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
              onAttempt: (attempt, total) => {
                if (reconnectingSessionRef.current !== droppedSession) {
                  throw new Error("Reconnect cancelled");
                }
                setReconnectAttempt({ attempt, total });
              },
            },
          );

          // Ignore a stale completion if this session ceased being the active
          // recovery while its async work was in flight.
          if (reconnectingSessionRef.current !== droppedSession) {
            await loaded.session.close().catch(() => {});
            return;
          }
          adopt(loaded, providerIndex);
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
    [adopt, providers],
  );

  if (bundle) {
    return (
      <div className="relative h-full">
        <Workbench
          key={connectionId}
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
    <ConnectScreen
      providers={providers}
      attempt={attempt}
      notice={notice}
      offlineBusy={offlineBusy}
      onConnect={connect}
      onOpenFile={(file) => void openOffline(file)}
      onNewFile={() => void openOffline()}
    />
  );
}
