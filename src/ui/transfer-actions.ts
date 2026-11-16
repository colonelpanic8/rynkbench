// Document import/export orchestration (the top bar's Open, Save and name):
// an import becomes one commit through the io, the retained source text an
// export reuses as its template, and the phrasing of the result report.

import { createContext, useContext, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { FORMAT_EXTENSION, FORMAT_LABEL } from "../config/document";
import type { ConfigFormat, ExtensionCatalog } from "../config/document";
import type { ImportedLayout, LayoutImport } from "../config/transfer";
import { documentAdapterFor } from "../config/adapters";
import { draftEditCount, pointingDraftDirty } from "../workbench";
import { useWorkbench } from "./state";
import { labelsFromToml } from "../config/behavior-labels";
import { errorReport } from "./TransferReport";
import type { TransferReport } from "./TransferReport";
import { profileById } from "../model/boards/profiles";
import type { BoardDocumentTools } from "../model/boards/profiles";

const boardLabel = (id: string) => profileById(id)?.name ?? id;

/** What an import changed, and what it could not: anything skipped or
 *  approximated is a caveat on an otherwise clean result, so the headline says so. */
function importReport(
  name: string,
  parsed: LayoutImport,
  { changedKeys, applied, skipped }: ImportedLayout,
  target: string,
  drafted: boolean,
): TransferReport {
  const parts = [changedKeys > 0 ? `${changedKeys} key${changedKeys === 1 ? "" : "s"}` : null, ...applied].filter(
    (part) => part !== null,
  );
  const from = boardLabel(parsed.sourceBoard);
  const to = boardLabel(parsed.targetBoard);
  const headline =
    parts.length === 0
      ? parsed.converted
        ? `${name}'s ${from} layout already matches this ${to} on every shared key`
        : `${name} already matches ${target}`
      : `${parsed.converted ? `Transferred ${parts.join(", ")} from ${from} to ${to} using ${name}` : `Imported ${parts.join(", ")} from ${name}`}${drafted ? " into the draft; Send writes it to the keyboard" : ""}`;
  return {
    outcome: skipped.length > 0 || parsed.notes.length > 0 ? "warning" : "ok",
    headline,
    detail: skipped.length > 0 ? `Not applied:\n  ${skipped.join("\n  ")}` : undefined,
    notes: parsed.notes,
  };
}

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
  /** Renames it (Layout properties); a file saved later takes this name. */
  renameWorkspace: (name: string) => void;
  importFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  exportFile: (format: ConfigFormat) => Promise<void>;
}

export function useDocumentTransfer(): DocumentTransfer {
  const { bundle, state, io } = useWorkbench();
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
    setPhase("importing");
    setReport(null);
    try {
      const text = await file.text();
      const loadedCatalog = await catalog();
      const codec = requireDocumentTools();
      const format = codec.detectFormat(text);
      requireDocumentTools(format);
      const parsed = codec.readImport({ text, bundle, state, catalog: loadedCatalog });
      // The file's names for its behaviors come with them (ADR 0020).
      const labels = !parsed.converted && format === "toml" ? labelsFromToml(text) : undefined;
      const drafting = state.batchMode;
      const { layout, written } = await io.importLayout(parsed, labels);
      if (!written.ok) {
        setReport({ outcome: "error", headline: `Could not import ${file.name}`, detail: written.message });
        return;
      }
      // A document for the other board cannot safely serve as this board's
      // later export template: its matrix and layer grids have a different
      // shape. Same-board imports still retain labels and editor-owned JSON.
      imported.current = parsed.converted ? null : text;
      if (offline && !parsed.converted) setWorkspaceName(file.name);
      setReport(importReport(file.name, parsed, layout, offline ? "this workspace" : drafting ? "the draft" : "the keyboard", drafting && !offline));
    } catch (error) {
      setReport(errorReport(`Could not import ${file.name}`, error));
    } finally {
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
    if (draftEditCount(state) > 0 || pointingDraftDirty(state)) {
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
        bundle.topology,
      );
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const link = document.createElement("a");
      link.href = url;
      const stem =
        workspaceName
          .replace(/\.(toml|json)$/i, "")
          .replace(/[^a-z0-9]+/gi, "-")
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
    renameWorkspace: setWorkspaceName,
    importFile,
    exportFile,
  };
}

/** One transfer per workbench, shared by the top bar (the workspace name) and
 *  its Open and Save (the actions and their report). Provided by the workbench. */
export const DocumentTransferContext = createContext<DocumentTransfer | null>(null);

export function useSharedDocumentTransfer(): DocumentTransfer {
  const transfer = useContext(DocumentTransferContext);
  if (!transfer) throw new Error("useSharedDocumentTransfer outside the workbench");
  return transfer;
}
