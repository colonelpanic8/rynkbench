// Workbench top bar: identity, live status, disconnect.

import { useRef, useState, useSyncExternalStore } from "react";
import type { ChangeEvent } from "react";
import {
  FORMAT_EXTENSION,
  FORMAT_LABEL,
  initConfigWasm,
  loadCatalog,
} from "../config/document";
import type { ConfigFormat, ExtensionCatalog } from "../config/document";
import { exportDocument, importDocument } from "../config/transfer";
import type { BatteryStatus } from "../vendor/rynk-wasm/rynk_wasm";
import { pointingDraftDirty, stagedEditCount, useWorkbench } from "./state";
import { Chip, Button } from "./kit";
import { errorReport, TransferReportPanel } from "./TransferReport";
import type { TransferReport } from "./TransferReport";
import { BatteryGlyph, PowerIcon, RedoIcon, UndoIcon, Wordmark } from "./icons";
import { KIND_LABEL } from "./session-labels";
import { LOCALES, getLocaleId, setLocaleId, subscribeLocale } from "./locale";

/** OS keyboard-layout picker: what characters HID codes are displayed and
 *  searched as. A browser-local display preference, never written anywhere. */
function LocaleSelect() {
  const localeId = useSyncExternalStore(subscribeLocale, getLocaleId);
  return (
    <select
      value={localeId}
      onChange={(event) => setLocaleId(event.target.value)}
      title="OS keyboard layout used to display and pick characters"
      aria-label="OS keyboard layout"
      className="max-w-40 cursor-pointer rounded-md border border-line bg-raised px-2 py-1.5 text-[12px] text-mute hover:border-line-strong"
    >
      {LOCALES.map((locale) => (
        <option key={locale.id} value={locale.id}>
          {locale.name}
        </option>
      ))}
    </select>
  );
}

const BOARD_LABEL = { glove80: "Glove80", go60: "Go60" } as const;

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
      <span className="tnum text-[12.5px] text-mute">
        {level != null ? `${level}%` : available ? "—" : "n/a"}
      </span>
    </div>
  );
}

export function TopBar() {
  const { bundle, state, dispatch, io, history } = useWorkbench();
  const offline = bundle.session.kind === "offline";
  const fileInput = useRef<HTMLInputElement>(null);
  /** The last document imported, kept verbatim. An export reuses it for the
   *  layer labels the firmware does not store, and — for MoErgo output — as the
   *  template carrying the editor-owned sections Rynk never sees. */
  const imported = useRef<string | null>(bundle.workspace?.sourceText ?? null);
  const [workspaceName, setWorkspaceName] = useState(
    bundle.workspace?.name ?? bundle.model.name,
  );
  const [transfer, setTransfer] = useState<"importing" | "exporting" | null>(null);
  const [report, setReport] = useState<TransferReport | null>(null);
  const split = bundle.caps.is_split;
  const stagedCount = stagedEditCount(state);
  const pointingStaged = pointingDraftDirty(state);
  const activeLabel = [...new Set([state.defaultLayer, ...state.activeLayers])]
    .sort((a, b) => a - b)
    .join(" | ");

  const catalog = async (): Promise<ExtensionCatalog> => {
    await initConfigWasm();
    return loadCatalog(
      bundle.session,
      state,
      bundle.extensionEffectNames,
      bundle.extensionPaletteNames,
    );
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (stagedCount > 0 || pointingStaged) {
      // An import writes device differences directly; staged edits would go
      // stale underneath it.
      setReport({
        outcome: "error",
        headline: "Apply or discard staged configuration edits before importing a layout.",
      });
      return;
    }
    // Imports are bulk, cross-feature writes outside direct-key history.
    dispatch({ type: "keyHistorySuspend", suspended: true });
    history.clear();
    setTransfer("importing");
    setReport(null);
    try {
      const text = await file.text();
      const result = await importDocument({
        text,
        session: bundle.session,
        bundle,
        state,
        dispatch,
        catalog: await catalog(),
      });
      // A document for the other board cannot safely serve as this board's
      // later export template: its matrix and layer grids have a different
      // shape. Same-board imports still retain labels and editor-owned JSON.
      imported.current = result.converted ? null : text;
      if (offline && !result.converted) setWorkspaceName(file.name);
      const parts = [
        result.changedKeys > 0
          ? `${result.changedKeys} key${result.changedKeys === 1 ? "" : "s"}`
          : null,
        ...result.applied,
      ].filter((part) => part !== null);
      const headline =
        parts.length === 0
          ? result.converted
            ? `${file.name}'s ${BOARD_LABEL[result.sourceBoard]} layout already matches this ${BOARD_LABEL[result.targetBoard]} on every shared key`
            : offline
            ? `${file.name} already matches this workspace`
            : `${file.name} already matches the keyboard`
          : result.converted
            ? `Transferred ${parts.join(", ")} from ${BOARD_LABEL[result.sourceBoard]} to ${BOARD_LABEL[result.targetBoard]} using ${file.name}`
            : `Imported ${parts.join(", ")} from ${file.name}`;
      // Anything the document asked for that could not be written, and anything
      // the import had to approximate, is a caveat on an otherwise clean result
      // — so say so in the headline rather than only in the detail below it.
      const caveats = result.skipped.length > 0 || result.notes.length > 0;
      setReport({
        outcome: caveats ? "warning" : "ok",
        headline,
        detail:
          result.skipped.length > 0
            ? `Not applied:\n  ${result.skipped.join("\n  ")}`
            : undefined,
        notes: result.notes,
      });
    } catch (error) {
      setReport(errorReport(`Could not import ${file.name}`, error));
    } finally {
      history.clear();
      dispatch({ type: "keyHistorySuspend", suspended: false });
      setTransfer(null);
    }
  };

  const exportFile = async (format: ConfigFormat) => {
    setTransfer("exporting");
    setReport(null);
    try {
      const text = exportDocument(
        state,
        await catalog(),
        format,
        imported.current ?? undefined,
        bundle.incompleteReads ?? [],
      );
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const link = document.createElement("a");
      link.href = url;
      const stem =
        (offline
          ? workspaceName.replace(/\.(toml|json)$/i, "")
          : bundle.model.name
        )
          ?.replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase() || "glove80";
      link.download = `${stem}-rynkbench.${FORMAT_EXTENSION[format]}`;
      link.click();
      URL.revokeObjectURL(url);
      if (offline) imported.current = text;
      setReport({
        outcome: "ok",
        headline: `${offline ? "Downloaded" : "Exported"} ${FORMAT_LABEL[format]}`,
      });
    } catch (error) {
      setReport(errorReport(`Could not export ${FORMAT_LABEL[format]}`, error));
    } finally {
      setTransfer(null);
    }
  };

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-4 border-b border-line-soft bg-panel px-4">
      <div className="flex items-center gap-3">
        <Wordmark size={26} />
        <div className="flex flex-col leading-tight">
          <span className="max-w-52 truncate text-[13.5px] font-semibold text-ink">
            {workspaceName}
          </span>
          <span className="text-[10.5px] text-faint">Rynkbench</span>
        </div>
        <Chip tone="neutral">{KIND_LABEL[bundle.session.kind] ?? bundle.session.kind}</Chip>
      </div>

      <div className="flex-1" />

      <div
        className="flex items-center gap-0.5"
        title="History covers individual key binding edits only. Imports, encoder bindings, default layers, lighting, profiles, and advanced settings are not included."
      >
        <Button
          variant="ghost"
          className="px-2"
          disabled={!history.canUndo}
          onClick={() => void history.undo()}
          aria-label="Undo key binding edit"
          title={
            history.undoLabel
              ? `Undo key binding edit · ${history.undoLabel} · Ctrl/⌘ Z`
              : "No key binding edit to undo"
          }
        >
          <UndoIcon size={15} />
          Undo key
        </Button>
        <Button
          variant="ghost"
          className="px-2"
          disabled={!history.canRedo}
          onClick={() => void history.redo()}
          aria-label="Redo key binding edit"
          title={
            history.redoLabel
              ? `Redo key binding edit · ${history.redoLabel} · Ctrl/⌘ Shift Z or Ctrl Y`
              : "No key binding edit to redo"
          }
        >
          <RedoIcon size={15} />
          Redo key
        </Button>
      </div>

      {!offline && (
        <>
          <div className="h-6 w-px bg-line-soft" />
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              className={state.batchMode ? "text-accent" : undefined}
              disabled={state.batchBusy || (state.batchMode && stagedCount > 0)}
              onClick={() =>
                dispatch({ type: "batchMode", enabled: !state.batchMode })
              }
              title={
                state.batchMode
                  ? stagedCount > 0
                    ? "Apply or discard the staged edits to leave batch mode"
                    : "Batch mode is on: key and encoder edits are staged locally until you apply them"
                  : "Stage key and encoder edits locally and write them to the keyboard all at once"
              }
            >
              Batch{state.batchMode ? ": on" : ""}
            </Button>
            {state.batchMode && (
              <>
                <Chip tone="accent" className="tnum">
                  {stagedCount} staged
                </Chip>
                <Button
                  variant="primary"
                  className="py-1"
                  disabled={state.batchBusy || stagedCount === 0}
                  onClick={() => void io.applyBatch()}
                  title="Write every staged edit to the keyboard"
                >
                  {state.batchBusy ? "Applying…" : "Apply all"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={state.batchBusy || stagedCount === 0}
                  onClick={() => dispatch({ type: "batchDiscard" })}
                  title="Drop every staged edit and restore what the keyboard holds"
                >
                  Discard
                </Button>
              </>
            )}
            {state.batchError && (
              <span
                className="max-w-48 truncate text-[11.5px] text-danger"
                role="alert"
                title={state.batchError}
              >
                {state.batchError}
              </span>
            )}
          </div>
        </>
      )}

      {history.phase !== "idle" && (
        <span className="text-[11.5px] text-accent" role="status">
          {history.phase === "writing"
            ? "Saving configuration…"
            : history.phase === "undoing"
              ? "Undoing key…"
              : "Redoing key…"}
        </span>
      )}
      {history.error && (
        <span
          className="max-w-48 truncate text-[11.5px] text-danger"
          role="alert"
          title={history.error}
        >
          {history.error}
        </span>
      )}

      <div
        key={activeLabel}
        className="animate-pop"
        title={`Active layers: ${activeLabel}. Default layer: ${state.defaultLayer}.`}
      >
        <Chip tone="accent" className="tnum">
          <span className="size-1.5 rounded-full bg-accent" />
          {activeLabel}
        </Chip>
      </div>

      {!offline && <BatteryReadout battery={state.battery} split={split} />}

      <div className="h-6 w-px bg-line-soft" />

      <LocaleSelect />

      <div className="h-6 w-px bg-line-soft" />

      <input
        ref={fileInput}
        type="file"
        accept=".toml,.json,application/json,application/toml"
        className="hidden"
        onChange={importFile}
      />
      <Button
        variant="ghost"
        disabled={transfer !== null || history.phase !== "idle"}
        onClick={() => fileInput.current?.click()}
        title={
          offline
            ? "Open another Glove80 TOML or MoErgo JSON document into this workspace"
            : "Import a Glove80 or Go60 TOML (or MoErgo JSON), automatically transferring shared physical keys between boards"
        }
      >
        {transfer === "importing" ? "Opening…" : offline ? "Open" : "Import layout"}
      </Button>
      <Button
        variant="ghost"
        disabled={transfer !== null}
        onClick={() => void exportFile("toml")}
        title={offline ? "Download this workspace as Glove80 TOML" : "Export the live configuration as Glove80 TOML"}
      >
        {transfer === "exporting" ? "Downloading…" : offline ? "Download TOML" : "Export TOML"}
      </Button>
      <Button
        variant="ghost"
        disabled={transfer !== null}
        onClick={() => void exportFile("moergo-json")}
        title={offline ? "Download this workspace as MoErgo JSON" : "Export the live keymap as MoErgo JSON"}
      >
        {offline ? "Download JSON" : "Export JSON"}
      </Button>

      <div className="h-6 w-px bg-line-soft" />

      <Button variant="ghost" onClick={io.disconnect} title={offline ? "Close file" : "Disconnect"}>
        <PowerIcon size={15} />
        {offline ? "Close" : "Disconnect"}
      </Button>

      {report && (
        <TransferReportPanel report={report} onDismiss={() => setReport(null)} />
      )}
    </header>
  );
}
