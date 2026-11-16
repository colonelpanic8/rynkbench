// The top bar, as in GLIDE: the wordmark (back to the keymap) and the layout's
// name, Open and Save, the screens that open over the keymap, then history,
// batch, live status, display settings and Close.

import type { BatteryStatus } from "../vendor/rynk-wasm/rynk_wasm";
import { useWorkbench } from "./state";
import { useSharedDocumentTransfer } from "./transfer-actions";
import { LayoutProperties } from "./properties/LayoutProperties";
import { openProperties } from "./properties/store";
import { Chip, Button, cx } from "./kit";
import {
  SlidersIcon,
  BatteryGlyph,
  CombinatorIcon,
  DeviceIcon,
  InsightsIcon,
  KeymapIcon,
  MenuIcon,
  PowerIcon,
  RedoIcon,
  UndoIcon,
  Wordmark,
} from "./icons";
import { FileMenus } from "./FileMenus";
import { useTerms } from "./terms";
import { layerName } from "./layer-names";
import type { Area, AreaId } from "./areas";
import { ConnectionChip } from "./draft/ConnectionChip";
import { SettingsPanel } from "./SettingsPanel";

function BatteryReadout({ battery, split }: { battery: BatteryStatus; split: boolean }) {
  const available = battery !== "Unavailable" ? battery.Available : null;
  const level = available?.level ?? null;
  const charging = available?.charge_state === "Charging";
  return (
    <div
      className="flex items-center gap-2"
      title={
        available
          ? `${split ? "Central half · " : ""}${available.charge_state}${level != null ? ` · ${level}%` : ""}`
          : "Battery status unavailable"
      }
    >
      <BatteryGlyph level={level} charging={charging} />
      <span className="tnum text-body text-mute">
        {level != null ? `${level}%` : available ? "—" : "n/a"}
      </span>
    </div>
  );
}

const AREA_ICON: Record<AreaId, typeof KeymapIcon> = {
  layout: KeymapIcon,
  behaviors: CombinatorIcon,
  device: DeviceIcon,
  insights: InsightsIcon,
};

/** The keymap and the screens that open over it. */
function ScreenNav({ areas, current, onArea }: { areas: Area[]; current: AreaId; onArea: (area: Area) => void }) {
  const term = useTerms();
  return (
    <nav aria-label="Screens" className="flex items-center gap-0.5">
      {areas.map((area) => {
        const Icon = AREA_ICON[area.id];
        const active = area.id === current;
        return (
          <button
            key={area.id}
            type="button"
            onClick={() => onArea(area)}
            aria-current={active ? "page" : undefined}
            title={term(area.term)}
            className={cx(
              "flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-body font-semibold transition-all duration-150",
              active ? "bg-raised text-accent" : "text-ink hover:bg-hover",
            )}
          >
            <Icon size={15} />
            <span className="max-xl:hidden">{term(area.term)}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function TopBar({
  areas,
  current,
  onArea,
  onDrawer,
}: {
  areas: Area[];
  current: AreaId;
  onArea: (area: Area) => void;
  /** Opens the side panel on a phone; absent where there is no panel. */
  onDrawer?: () => void;
}) {
  const { bundle, state, io, history } = useWorkbench();
  const offline = bundle.session.kind === "offline";
  const { workspaceName } = useSharedDocumentTransfer();
  const split = bundle.caps.is_split;
  const activeLabel = [...new Set([state.defaultLayer, ...state.activeLayers])]
    .sort((a, b) => a - b)
    .join(" | ");

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg px-4 max-sm:gap-2 max-sm:overflow-x-auto max-sm:px-2">
      <div className="flex min-w-0 shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => onArea(areas[0])}
          title="Back to the keymap"
          className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-1.5 -mx-1.5 py-1 transition-colors hover:bg-hover"
        >
          <Wordmark size={22} />
          <span className="text-title font-bold uppercase tracking-widest text-ink max-md:hidden">Rynkbench</span>
        </button>
        {onDrawer && (
          <button
            type="button"
            onClick={onDrawer}
            title="Layers and combos"
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-raised px-2 py-1.5 text-body font-semibold text-ink sm:hidden"
          >
            <MenuIcon size={14} />
            <span className="max-w-[72px] truncate">{layerName(state.layerMetadata, state.uiLayer)}</span>
          </button>
        )}
        <div className="h-5 w-px shrink-0 bg-line max-sm:hidden" />
        <span className="max-w-[220px] truncate text-body font-semibold text-mute max-sm:hidden" title={workspaceName}>
          {workspaceName}
        </span>
        {/* As in GLIDE: the sliders beside the layout's name open Layout properties. */}
        <button
          type="button"
          onClick={() => openProperties()}
          aria-label="Layout properties"
          title="Layout properties: name, keyboard, firmware options and lighting"
          className="-ml-1.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink hover:bg-hover"
        >
          <SlidersIcon size={16} />
        </button>
      </div>
      <LayoutProperties />

      <FileMenus />
      <div className="h-5 w-px shrink-0 bg-line max-sm:hidden" />
      <ScreenNav areas={areas} current={current} onArea={onArea} />

      <div className="flex-1" />

      <div
        className="flex items-center gap-0.5"
        title="Undo covers every change, in Draft and Live. Imports and transforms start it over."
      >
        <Button
          variant="ghost"
          className="px-2"
          disabled={!history.canUndo}
          reason={history.phase !== "idle" ? "Wait for the keyboard to finish saving" : "Nothing to undo"}
          onClick={() => void history.undo()}
          aria-label="Undo"
          title={`Undo ${history.undoLabel ?? "the last edit"} · Ctrl/⌘ Z`}
        >
          <UndoIcon size={15} />
        </Button>
        <Button
          variant="ghost"
          className="px-2"
          disabled={!history.canRedo}
          reason={history.phase !== "idle" ? "Wait for the keyboard to finish saving" : "Nothing to redo"}
          onClick={() => void history.redo()}
          aria-label="Redo"
          title={`Redo ${history.redoLabel ?? "the last edit"} · Ctrl/⌘ Shift Z or Ctrl Y`}
        >
          <RedoIcon size={15} />
        </Button>
      </div>

      <div className="h-6 w-px bg-line-soft max-sm:hidden" />
      <ConnectionChip />

      {history.phase !== "idle" && (
        <span className="text-small text-accent" role="status">
          {history.phase === "writing"
            ? "Saving configuration…"
            : history.phase === "undoing"
              ? "Undoing key…"
              : "Redoing key…"}
        </span>
      )}
      {history.error && (
        <span
          className="max-w-48 truncate text-small text-danger"
          role="alert"
          title={history.error}
        >
          {history.error}
        </span>
      )}

      <div
        key={activeLabel}
        className="animate-pop max-sm:hidden"
        title={`Active layers: ${activeLabel}. Default layer: ${state.defaultLayer}.`}
      >
        <Chip tone="accent" className="tnum">
          <span className="size-1.5 rounded-full bg-accent" />
          {activeLabel}
        </Chip>
      </div>

      {!offline && <BatteryReadout battery={state.battery} split={split} />}

      <div className="h-6 w-px bg-line-soft" />

      <SettingsPanel />

      {offline && (
        <Button variant="ghost" onClick={io.disconnect} title="Close file">
          <PowerIcon size={15} />
          Close
        </Button>
      )}
    </header>
  );
}
