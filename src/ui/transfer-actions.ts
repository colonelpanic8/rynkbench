// Document import/export orchestration for the top bar: the staged-edit guard,
// the history suspension around a bulk write, the retained source text an
// export reuses as its template, and the phrasing of the result report.

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  FORMAT_EXTENSION,
  FORMAT_LABEL,
  initConfigWasm,
  loadCatalog,
} from "../config/document";
import type { ConfigFormat, ExtensionCatalog } from "../config/document";
import { exportDocument, importDocument } from "../config/transfer";
import { pointingDraftDirty, stagedEditCount, useWorkbench } from "./state";
import { errorReport } from "./TransferReport";
import type { TransferReport } from "./TransferReport";

const BOARD_LABEL = { glove80: "Glove80", go60: "Go60" } as const;

export interface DocumentTransfer {
  /** Which direction is running, or null when idle. */
  phase: "importing" | "exporting" | null;
  report: TransferReport | null;
  dismissReport: () => void;
  /** Display name of the workspace; follows the file an offline import opened. */
  workspaceName: string;
  importFile: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  exportFile: (format: ConfigFormat) => Promise<void>;
}

export function useDocumentTransfer(): DocumentTransfer {
  const { bundle, state, dispatch, history } = useWorkbench();
  const offline = bundle.session.kind === "offline";
  /** The last document imported, kept verbatim. An export reuses it for the
   *  layer labels the firmware does not store, and — for MoErgo output — as the
   *  template carrying the editor-owned sections Rynk never sees. */
  const imported = useRef<string | null>(bundle.workspace?.sourceText ?? null);
  const [workspaceName, setWorkspaceName] = useState(
    bundle.workspace?.name ?? bundle.model.name,
  );
  const [phase, setPhase] = useState<"importing" | "exporting" | null>(null);
  const [report, setReport] = useState<TransferReport | null>(null);

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
      setPhase(null);
    }
  };

  const exportFile = async (format: ConfigFormat) => {
    setPhase("exporting");
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
        (offline ? workspaceName.replace(/\.(toml|json)$/i, "") : bundle.model.name)
          ?.replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "")
          .toLowerCase() || "glove80";
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
    dismissReport: () => setReport(null),
    workspaceName,
    importFile,
    exportFile,
  };
}
