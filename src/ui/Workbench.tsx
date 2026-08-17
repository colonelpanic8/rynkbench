// The workbench: top bar, mode rail, canvas center, contextual inspector.

import { useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from "react";
import type { ConnectedBundle, Mode } from "./state";
import {
  WorkbenchContext,
  canTravelKeyEditHistory,
  hasPendingConfigurationWrite,
  initialWorkbenchState,
  makeIo,
  makeWorkbenchReducer,
} from "./state";
import { TopBar } from "./TopBar";
import { KeymapCenter, KeymapInspector } from "./keymap/KeymapMode";
import { LightingMode } from "./lighting/LightingMode";
import { EffectsMode } from "./effects/EffectsMode";
import { LiveMode } from "./live/LiveMode";
import { AdvancedMode } from "./advanced/AdvancedMode";
import { ProfilesMode } from "./ProfilesMode";
import { DeviceMode } from "./device/DeviceMode";
import { InspectorShell, cx } from "./kit";
import { historyShortcut, keyEditHistoryLabel } from "./history";
import { getLocaleId, subscribeLocale } from "./locale";
import {
  CombinatorIcon,
  DeviceIcon,
  EyeIcon,
  KeymapIcon,
  LightingIcon,
  ProfilesIcon,
  SparkleIcon,
} from "./icons";

interface ModeEntry {
  id: Mode;
  label: string;
  icon: typeof KeymapIcon;
}

const MODES: ModeEntry[] = [
  { id: "keymap", label: "Keymap", icon: KeymapIcon },
  { id: "lighting", label: "Lighting", icon: LightingIcon },
  { id: "effects", label: "Effects", icon: SparkleIcon },
  { id: "live", label: "Live", icon: EyeIcon },
  { id: "profiles", label: "Profiles", icon: ProfilesIcon },
  { id: "advanced", label: "Advanced", icon: CombinatorIcon },
  { id: "device", label: "Device", icon: DeviceIcon },
];

function ModeRail({
  modes,
  mode,
  onMode,
}: {
  modes: ModeEntry[];
  mode: Mode;
  onMode: (m: Mode) => void;
}) {
  const activeIndex = modes.findIndex((m) => m.id === mode);
  return (
    <nav className="relative flex w-[76px] shrink-0 flex-col items-stretch gap-1 border-r border-line-soft bg-panel px-2 py-3">
      {/* sliding active indicator */}
      <div
        aria-hidden
        className="absolute left-0 h-14 w-0.5 rounded-r bg-accent transition-all duration-180"
        style={{
          top: `${12 + activeIndex * 60}px`,
          transitionTimingFunction: "cubic-bezier(0.25,0.8,0.35,1)",
        }}
      />
      {modes.map((m) => {
        const Icon = m.icon;
        const active = m.id === mode;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onMode(m.id)}
            className={cx(
              "flex h-14 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl transition-colors duration-150",
              active ? "bg-raised text-accent" : "text-faint hover:bg-raised/60 hover:text-mute",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={18} />
            <span className="text-[10px] font-medium tracking-wide">{m.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function Workbench({
  bundle,
  onClose,
  onUnexpectedDisconnect,
}: {
  bundle: ConnectedBundle;
  onClose: () => void;
  onUnexpectedDisconnect: (session: ConnectedBundle["session"]) => void;
}) {
  const reducer = useMemo(
    () => makeWorkbenchReducer(bundle.caps.num_cols),
    [bundle.caps.num_cols],
  );
  const [state, dispatch] = useReducer(reducer, bundle, initialWorkbenchState);

  // Key labels everywhere derive from the active OS locale; re-render the
  // whole workbench when the TopBar selector changes it.
  useSyncExternalStore(subscribeLocale, getLocaleId);

  // Effects is its own view rather than a lighting panel, but it only exists
  // on firmware that ships the effect extension.
  const modes = useMemo(
    () =>
      MODES.filter(
        (m) =>
          (bundle.session.kind !== "offline" || (m.id !== "live" && m.id !== "device")) &&
          (m.id !== "effects" || bundle.lightingExtension !== null) &&
          (m.id !== "profiles" || bundle.morseProfileCapacity > 0),
      ),
    [bundle.session.kind, bundle.lightingExtension, bundle.morseProfileCapacity],
  );

  const stateRef = useRef(state);
  stateRef.current = state;

  const io = useMemo(
    () =>
      makeIo(
        bundle.session,
        () => stateRef.current,
        dispatch,
        bundle.caps.num_cols,
        onClose,
        bundle.sceneStatus !== null,
        bundle.lightingExtension !== null,
        bundle.runtimeConditionalStatus !== null,
        {
          sceneCapacity: bundle.sceneStatus?.capacity ?? null,
          conditionalSceneCapacity: bundle.runtimeConditionalStatus?.capacity ?? null,
          scenesSupported: bundle.sceneStatus !== null,
          conditionalScenesSupported: bundle.runtimeConditionalStatus !== null,
          pointingSupported: bundle.pointingConfig !== null,
          lightingOutputSupported:
            bundle.lightingState !== null && bundle.lightingOutputMode !== null,
        },
      ),
    [
      bundle.session,
      bundle.caps.num_cols,
      onClose,
      bundle.sceneStatus,
      bundle.lightingExtension,
      bundle.runtimeConditionalStatus,
      bundle.pointingConfig,
      bundle.lightingState,
      bundle.lightingOutputMode,
    ],
  );

  const historyBusy = hasPendingConfigurationWrite(state);
  const historyOperation = state.keyEditHistory.operation;
  const undoEntry = state.keyEditHistory.past.at(-1);
  const redoEntry = state.keyEditHistory.future.at(-1);
  const history = useMemo(
    () => ({
      canUndo: canTravelKeyEditHistory(state, "undo"),
      canRedo: canTravelKeyEditHistory(state, "redo"),
      phase: historyOperation
        ? historyOperation.direction === "undo"
          ? ("undoing" as const)
          : ("redoing" as const)
        : historyBusy
          ? ("writing" as const)
          : ("idle" as const),
      error: state.keyEditHistory.error,
      undoLabel: undoEntry ? keyEditHistoryLabel(undoEntry) : null,
      redoLabel: redoEntry ? keyEditHistoryLabel(redoEntry) : null,
      undo: async () => {
        await io.undoKeyEdit();
      },
      redo: async () => {
        await io.redoKeyEdit();
      },
      clear: () => dispatch({ type: "keyHistoryClear" }),
    }),
    [historyBusy, historyOperation, io, redoEntry, state, undoEntry],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = historyShortcut(event);
      if (!shortcut || !canTravelKeyEditHistory(stateRef.current, shortcut)) return;
      event.preventDefault();
      if (shortcut === "undo") void io.undoKeyEdit();
      else void io.redoKeyEdit();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [io]);

  // Server-push topics.
  useEffect(() => {
    bundle.session.onTopic((event) => {
      if ("LayerChange" in event) {
        io.refreshLayerState();
      } else if ("BatteryStatusChange" in event) {
        dispatch({ type: "topicBattery", battery: event.BatteryStatusChange });
      } else if ("ConnectionChange" in event) {
        dispatch({ type: "topicConnection", connection: event.ConnectionChange });
      } else if ("LightingChange" in event) {
        io.refreshLighting();
      } else if ("LedIndicatorChange" in event) {
        dispatch({ type: "topicLedIndicator", indicator: event.LedIndicatorChange });
      } else if ("ModifierChange" in event) {
        dispatch({ type: "topicModifier", modifiers: event.ModifierChange });
      }
    });
    // Subscribe first, then resample state whose topic updates could have
    // landed between the connect snapshot and this handler registration.
    if (bundle.caps.lighting_enabled) {
      io.refreshLighting();
    }
    // Old firmware rejects this additive endpoint and keeps the matrix
    // fallback.
    bundle.session.device.modifierState().then(
      (modifiers) => dispatch({ type: "topicModifier", modifiers }),
      () => {},
    );
    bundle.session.onDisconnect(() => onUnexpectedDisconnect(bundle.session));
  }, [bundle.session, bundle.caps.lighting_enabled, io, onUnexpectedDisconnect]);

  const ctx = useMemo(
    () => ({ bundle, state, dispatch, io, history }),
    [bundle, state, io, history],
  );

  return (
    <WorkbenchContext value={ctx}>
      <div className="relative flex h-full flex-col" aria-busy={state.layerBusy}>
        {state.layerBusy && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-well/70 backdrop-blur-[1px]"
            role="status"
          >
            <div className="rounded-xl border border-line bg-panel px-4 py-3 text-[13px] text-ink shadow-lg">
              Rewriting and verifying layers on the keyboard…
            </div>
          </div>
        )}
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <ModeRail
            modes={modes}
            mode={state.mode}
            onMode={(mode) => dispatch({ type: "mode", mode })}
          />
          <main className="flex min-h-0 flex-1 gap-4 p-4 max-lg:flex-col max-lg:overflow-y-auto">
            {state.mode === "keymap" && (
              <>
                <KeymapCenter />
                <InspectorShell>
                  <KeymapInspector />
                </InspectorShell>
              </>
            )}
            {state.mode === "lighting" && <LightingMode />}
            {state.mode === "effects" && <EffectsMode />}
            {state.mode === "live" && <LiveMode />}
            {state.mode === "profiles" && <ProfilesMode />}
            {state.mode === "advanced" && <AdvancedMode />}
            {state.mode === "device" && <DeviceMode />}
          </main>
        </div>
      </div>
    </WorkbenchContext>
  );
}
