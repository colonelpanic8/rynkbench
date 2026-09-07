// Document import/export orchestration for the top bar: the staged-edit guard,
// the history suspension around a bulk write, the retained source text an
// export reuses as its template, and the phrasing of the result report.

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FORMAT_EXTENSION, FORMAT_LABEL } from "../config/document";
import type { ConfigFormat, ExtensionCatalog } from "../config/document";
import { documentAdapterFor } from "../config/adapters";
import { pointingDraftDirty, stagedEditCount, useWorkbench } from "./state";
import { errorReport } from "./TransferReport";
import type { TransferReport } from "./TransferReport";
import { profileById } from "../model/boards/profiles";
import type { BoardDocumentTools } from "../model/boards/profiles";

const boardLabel = (id: string) => profileById(id)?.name ?? id;

export interface DocumentTransfer {
  /** Which direction is running, or null when idle. */
  phase: "importing" | "exporting" | "migrating" | null;
  report: TransferReport | null;
  documentTools: BoardDocumentTools | undefined;
  migrationTarget: string | null;
  previewMigration: () => Promise<void>;
  dismissReport: () => void;
  /** Display name of the workspace; follows the file an offline import opened. */
  workspaceName: string;
  importFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  exportFile: (format: ConfigFormat) => Promise<void>;
}

export function useDocumentTransfer(): DocumentTransfer {
  const { bundle, state, dispatch, history } = useWorkbench();
  const offline = bundle.session.kind === "offline";
  const documentTools = bundle.boardProfile?.documents;
  const adapter = documentAdapterFor(documentTools);
  const requireDocumentTools = (format?: ConfigFormat) => {
    if (!documentTools || !adapter || (format && !documentTools.formats.includes(format))) {
      throw new Error("No compatible configuration file tools are registered for this board.");
    }
    return adapter;
  };
  /** The last document imported, kept verbatim. An export reuses it for the
   *  layer labels the firmware does not store, and — for MoErgo output — as the
   *  template carrying the editor-owned sections Rynk never sees. */
  const imported = useRef<string | null>(bundle.workspace?.sourceText ?? null);
  const [workspaceName, setWorkspaceName] = useState(
    bundle.workspace?.name ?? bundle.model.name,
  );
  const [phase, setPhase] = useState<"importing" | "exporting" | "migrating" | null>(null);
  const [report, setReport] = useState<TransferReport | null>(null);

  const catalog = async (): Promise<ExtensionCatalog> => {
    const codec = requireDocumentTools();
    await codec.initialize();
    return codec.loadCatalog(
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
    try {
      requireDocumentTools();
    } catch (error) {
      setReport(errorReport("Could not import configuration", error));
      return;
    }
    if (stagedEditCount(state) > 0 || pointingDraftDirty(state)) {
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
    setPhase("importing");
    setReport(null);
    try {
      const text = await file.text();
      const loadedCatalog = await catalog();
      const codec = requireDocumentTools();
      requireDocumentTools(codec.detectFormat(text));
      const result = await codec.importDocument({
        text,
        session: bundle.session,
        bundle,
        state,
        dispatch,
        catalog: loadedCatalog,
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
            ? `${file.name}'s ${boardLabel(result.sourceBoard)} layout already matches this ${boardLabel(result.targetBoard)} on every shared key`
            : offline
              ? `${file.name} already matches this workspace`
              : `${file.name} already matches the keyboard`
          : result.converted
            ? `Transferred ${parts.join(", ")} from ${boardLabel(result.sourceBoard)} to ${boardLabel(result.targetBoard)} using ${file.name}`
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
      setPhase(null);
    }
  };

  const migrationTarget = documentTools?.migrationTarget?.name ?? null;

  const previewMigration = async () => {
    setReport(null);
    if (!documentTools?.migrationTarget) {
      setReport({ outcome: "error", headline: "No configuration migration is registered for this board." });
      return;
    }
    if (stagedEditCount(state) > 0 || pointingDraftDirty(state)) {
      setReport({ outcome: "error", headline: "Apply or discard staged edits before migrating." });
      return;
    }
    if ((bundle.incompleteReads ?? []).length > 0) {
      setReport({ outcome: "error", headline: "Reconnect before migrating an incomplete device snapshot.",
        detail: bundle.incompleteReads!.join("\n") });
      return;
    }
    setPhase("migrating");
    try {
      const codec = requireDocumentTools();
      const draft = codec.migrationDraft(codec.snapshotFromState(state), await catalog());
      setReport({
        outcome: draft.notes.length ? "warning" : "ok",
        headline: `Migration draft: ${bundle.boardProfile?.name} → ${boardLabel(draft.target)}`,
        detail: "Number and letter rows align. Lower thumb arcs and the shared bottom-row keys transfer. Review missing bindings and layer access below. Extra destination keys are transparent. Set a Bluetooth name in the downloaded file. Your workspace and keyboard stay unchanged.",
        notes: draft.notes,
        download: { text: draft.text, filename: `${draft.target}-migrated.toml` },
      });
    } catch (error) {
      setReport(errorReport("Could not prepare migration", error));
    } finally {
      setPhase(null);
    }
  };

  const exportFile = async (format: ConfigFormat) => {
    setPhase("exporting");
    setReport(null);
    try {
      const text = requireDocumentTools(format).exportDocument(
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
        (offline ? workspaceName.replace(/\.(toml|json)$/i, "") : bundle.model.name)
          ?.replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase() || "keyboard";
      link.download = `${stem}-rynkbench.${FORMAT_EXTENSION[format]}`;
      link.click();
      URL.revokeObjectURL(url);
      setReport({
        outcome: "ok",
        headline: `${offline ? "Downloaded" : "Exported"} ${FORMAT_LABEL[format]}`,
      });
    } catch (error) {
      setReport(errorReport(`Could not export ${FORMAT_LABEL[format]}`, error));
    } finally {
      setPhase(null);
    }
  };

  return {
    phase,
    report,
    documentTools,
    migrationTarget,
    previewMigration,
    dismissReport: () => setReport(null),
    workspaceName,
    importFile,
    exportFile,
  };
}
