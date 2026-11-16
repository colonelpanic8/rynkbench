// The workbench, laid out as GLIDE's main screen: the top bar (files, the
// other screens, history, settings), the side panel of layers and combos, and
// the keymap; the other screens open in its place with their own tabs.

import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { ledNodesOf, type ConnectedBundle } from "../workbench";
import { WorkbenchContext, useWorkbench } from "./state";
import {
  initialWorkbenchState,
  ioFeaturesFor,
  makeIo,
  makeWorkbenchReducer,
} from "../workbench";
import { TopBar } from "./TopBar";
import { KeymapCenter } from "./keymap/KeymapCenter";
import { KeymapInspector } from "./keymap/SideInspector";
import { DraftKeeper } from "./draft/DraftKeeper";
import { guardIo, guardJudge } from "./guard/guardIo";
import { useHistory } from "./draft/useHistory";
import { ComboEditor } from "./keymap/ComboEditor";
import { ComboFocusCanvas } from "./keymap/ComboFocusCanvas";
import { useComboFocus } from "./keymap/useComboFocus";
import { KeyEditor } from "./keymap/KeyEditor";
import { useEditorBeside } from "./keymap/EditorPanel";
import { PREFERENCES, usePreference } from "./preferences";
import { LiveMode } from "./live/LiveMode";
import { AdvancedSection } from "./advanced/AdvancedMode";
import { ProfilesMode } from "./ProfilesMode";
import { DeviceMode } from "./device/DeviceMode";
import { SidePanel } from "./sidepanel/SidePanel";
import { LIBRARY_ORDER } from "./behaviors/library";
import { ResizeHandle, usePaneSize } from "./panes";
import { SETTING_KEYS } from "./settings";
import { InspectorShell, cx } from "./kit";
import { historyShortcut } from "../model/history";
import { useTerms } from "./terms";
import { getLocaleId, subscribeLocale } from "./locale";
import { areaOfSection, areasFor, sectionTerm, type Area, type AreaId, type SectionId } from "./areas";
import { DocumentTransferContext, useDocumentTransfer } from "./transfer-actions";
/** The sections of the current area, when it has more than one. */
function SectionTabs({
  sections,
  current,
  onSection,
}: {
  sections: SectionId[];
  current: SectionId;
  onSection: (section: SectionId) => void;
}) {
  const term = useTerms();
  if (sections.length < 2) return null;
  return (
    <div
      role="tablist"
      aria-label="Sections"
      className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line-soft bg-bg px-4"
    >
      {sections.map((section) => {
        const active = section === current;
        return (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSection(section)}
            className={cx(
              "relative shrink-0 cursor-pointer whitespace-nowrap px-3 py-2.5 text-ui font-medium transition-colors duration-150",
              active ? "text-ink" : "text-faint hover:text-mute",
            )}
          >
            {term(sectionTerm(section))}
            {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

/** The keymap, as GLIDE lays it out: the keyboard, the key editor below it.
 *  A combo open in Focus Mode swaps both for its canvas and its editor.
 *  A trackpad or an encoder opens a side panel with its settings. */
function KeymapScreen() {
  const { state } = useWorkbench();
  const combo = useComboFocus();
  const selected = state.selection?.type;
  const side = selected === "encoder" || selected === "pointing";
  const beside = useEditorBeside();
  const heightPane = usePaneSize(SETTING_KEYS.keyEditorHeight, 310, 180, 640);
  const widthPane = usePaneSize(SETTING_KEYS.keyEditorWidth, 480, 360, 760);
  const editorPane = beside ? widthPane : heightPane;
  return (
    <>
      <div className={cx("flex min-h-0 min-w-0 flex-1 flex-col", beside && "lg:flex-row")}>
        {combo ? <ComboFocusCanvas focus={combo} /> : <KeymapCenter />}
        {selected !== "encoder" && selected !== "pointing" && (
          <>
            <div className="flex max-lg:hidden">
              {beside ? (
                <ResizeHandle edge="left" label="Editor width" pane={widthPane} />
              ) : (
                <ResizeHandle edge="top" label="Editor height" pane={heightPane} />
              )}
            </div>
            {combo ? <ComboEditor focus={combo} size={editorPane.size} /> : <KeyEditor size={editorPane.size} />}
          </>
        )}
      </div>
      {side && (
        <InspectorShell>
          <KeymapInspector />
        </InspectorShell>
      )}
    </>
  );
}

/** One section's screen. */
function SectionView({ section }: { section: SectionId }) {
  switch (section) {
    case "keymap":
      return <KeymapScreen />;
    case "combos":
    case "morse":
    case "macros":
    case "forks":
    case "transforms":
    case "usage":
      return <AdvancedSection section={section} />;
    case "profiles":
      return <ProfilesMode />;
    case "device":
      return <DeviceMode />;
    case "live":
      return <LiveMode />;
  }
}

/** Shares the workbench's one document transfer with the top bar's Open, Save and name. */
function DocumentTransferProvider({ children }: { children: ReactNode }) {
  const transfer = useDocumentTransfer();
  return <DocumentTransferContext value={transfer}>{children}</DocumentTransferContext>;
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
  useSyncExternalStore(subscribeLocale, getLocaleId, getLocaleId);

  // The areas and their sections come from what the keyboard and the session
  // offer (src/ui/areas.ts).
  const areas = useMemo(
    () =>
      areasFor({
        connected: bundle.session.kind !== "offline",
        combos: bundle.caps.max_combos > 0,
        morse: bundle.caps.max_morse > 0,
        macros: bundle.caps.macro_space_size > 0,
        forks: bundle.caps.max_forks > 0,
        tapProfiles: bundle.morseProfileCapacity > 0,
      }),
    [bundle],
  );
  // The Behavior Library lists the behavior sections this keyboard has.
  const libraryKinds = useMemo(() => {
    const sections: readonly string[] = areas.find((area) => area.id === "behaviors")?.sections ?? [];
    return LIBRARY_ORDER.filter((kind) => sections.includes(kind));
  }, [areas]);
  // A section the board does not offer (a link from elsewhere) falls back to
  // the keymap, which every board has.
  const currentArea = areaOfSection(areas, state.mode);
  const section: SectionId = currentArea ? state.mode : "keymap";
  const area = currentArea ?? areas[0];
  // The phone's side-panel drawer, and the side panel's width elsewhere.
  const [drawer, setDrawer] = useState(false);
  const sidePane = usePaneSize(SETTING_KEYS.sidePanelWidth, 300, 220, 440);
  const panelRight = usePreference(PREFERENCES.sidePanelSide) === "right";
  // Each area remembers the section last shown in it.
  const lastSection = useRef<Partial<Record<AreaId, SectionId>>>({});
  useEffect(() => {
    lastSection.current[area.id] = section;
  }, [area.id, section]);
  const showArea = (next: Area) => {
    const remembered = lastSection.current[next.id];
    const target = remembered && next.sections.includes(remembered) ? remembered : next.sections[0];
    dispatch({ type: "mode", mode: target });
  };

  const stateRef = useRef(state);
  stateRef.current = state;

  // The bundle is an immutable connect-time snapshot, so it is the whole
  // dependency: every feature flag derives from it. Guard stands in front of
  // every key write (ADR 0011).
  const io = useMemo(
    () =>
      guardIo(
        makeIo(bundle.session, () => stateRef.current, dispatch, {
          cols: bundle.caps.num_cols,
          onDisconnect: onClose,
          features: ioFeaturesFor(bundle),
          judge: guardJudge(bundle),
          ledNodes: ledNodesOf(bundle),
        }),
        bundle,
        () => stateRef.current,
      ),
    [bundle, onClose],
  );

  // One Undo and Redo, in Draft, Live and a file alike (ADR 0018).
  const history = useHistory(state, io, dispatch);
  const historyRef = useRef(history);
  useEffect(() => {
    historyRef.current = history;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = historyShortcut(event);
      const current = historyRef.current;
      if (!shortcut || !(shortcut === "undo" ? current.canUndo : current.canRedo)) return;
      event.preventDefault();
      void current[shortcut]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
      <DocumentTransferProvider>
      <DraftKeeper />
      <div className="relative flex h-full flex-col" aria-busy={state.layerBusy}>
        {state.layerBusy && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center bg-well/70 backdrop-blur-[1px]"
            role="status"
          >
            <div className="rounded-xl border border-line bg-panel px-4 py-3 text-ui text-ink shadow-lg">
              Rewriting and verifying layers on the keyboard…
            </div>
          </div>
        )}
        <TopBar
          areas={areas}
          current={area.id}
          onArea={showArea}
          onDrawer={section === "keymap" ? () => setDrawer(true) : undefined}
        />
        <div className="flex min-h-0 flex-1">
          {section === "keymap" && (
            <div
              className={cx("flex shrink-0 max-sm:hidden", panelRight && "order-last flex-row-reverse")}
              style={{ width: sidePane.size + 12 }}
            >
              <div className="min-w-0 flex-1">
                <SidePanel libraryKinds={libraryKinds} />
              </div>
              <ResizeHandle edge={panelRight ? "left" : "right"} label="Side panel width" pane={sidePane} />
            </div>
          )}
          {section === "keymap" && drawer && (
            <div className="fixed inset-0 z-[60] sm:hidden" onClick={() => setDrawer(false)}>
              <div className="absolute inset-0 bg-well/70" />
              <div
                className={cx("absolute inset-y-0 w-[86vw] max-w-sm bg-bg shadow-2xl", panelRight ? "right-0" : "left-0")}
                onClick={(e) => e.stopPropagation()}
              >
                <SidePanel onPicked={() => setDrawer(false)} libraryKinds={libraryKinds} />
              </div>
            </div>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <SectionTabs
              sections={area.sections}
              current={section}
              onSection={(mode) => dispatch({ type: "mode", mode })}
            />
            <main
              className={cx(
                "flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto",
                // The keymap is GLIDE's main screen: canvas and editor edge to edge.
                section === "keymap" ? "" : "gap-4 p-4 max-sm:p-2",
              )}
            >
              <SectionView section={section} />
            </main>
          </div>
        </div>
      </div>
      </DocumentTransferProvider>
    </WorkbenchContext>
  );
}
