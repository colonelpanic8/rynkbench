// The workbench: top bar, mode rail, canvas center, contextual inspector.

import { useEffect, useMemo, useReducer, useRef } from "react";
import type { ConnectedBundle, Mode } from "./state";
import {
  WorkbenchContext,
  initialWorkbenchState,
  makeIo,
  makeWorkbenchReducer,
} from "./state";
import { TopBar } from "./TopBar";
import { KeymapCenter, KeymapInspector } from "./keymap/KeymapMode";
import { LightingMode } from "./lighting/LightingMode";
import { LiveMode } from "./live/LiveMode";
import { AdvancedMode } from "./advanced/AdvancedMode";
import { DeviceMode } from "./device/DeviceMode";
import { InspectorShell, cx } from "./kit";
import { CombinatorIcon, DeviceIcon, EyeIcon, KeymapIcon, LightingIcon } from "./icons";

const MODES: Array<{ id: Mode; label: string; icon: typeof KeymapIcon }> = [
  { id: "keymap", label: "Keymap", icon: KeymapIcon },
  { id: "lighting", label: "Lighting", icon: LightingIcon },
  { id: "live", label: "Live", icon: EyeIcon },
  { id: "advanced", label: "Advanced", icon: CombinatorIcon },
  { id: "device", label: "Device", icon: DeviceIcon },
];

function ModeRail({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  const activeIndex = MODES.findIndex((m) => m.id === mode);
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
      {MODES.map((m) => {
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
  onUnexpectedDisconnect: () => void;
}) {
  const reducer = useMemo(
    () => makeWorkbenchReducer(bundle.caps.num_cols),
    [bundle.caps.num_cols],
  );
  const [state, dispatch] = useReducer(reducer, bundle, initialWorkbenchState);

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
      ),
    [bundle.session, bundle.caps.num_cols, onClose, bundle.sceneStatus, bundle.lightingExtension],
  );

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
    bundle.session.onDisconnect(onUnexpectedDisconnect);
  }, [bundle.session, bundle.caps.lighting_enabled, io, onUnexpectedDisconnect]);

  const ctx = useMemo(
    () => ({ bundle, state, dispatch, io }),
    [bundle, state, io],
  );

  return (
    <WorkbenchContext value={ctx}>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <ModeRail mode={state.mode} onMode={(mode) => dispatch({ type: "mode", mode })} />
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
            {state.mode === "live" && <LiveMode />}
            {state.mode === "advanced" && <AdvancedMode />}
            {state.mode === "device" && <DeviceMode />}
          </main>
        </div>
      </div>
    </WorkbenchContext>
  );
}
