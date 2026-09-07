import { useRef } from "react";
import { FORMAT_EXTENSION, FORMAT_LABEL } from "../config/document";
import type { DocumentTransfer } from "./transfer-actions";
import { Button } from "./kit";

export function DocumentControls({
  transfer,
  offline,
  busy,
}: {
  transfer: DocumentTransfer;
  offline: boolean;
  busy: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { documentTools, phase, importFile, exportFile, migrationTarget, previewMigration } = transfer;
  if (!documentTools) return null;

  return (
    <>
      <div className="h-6 w-px bg-line-soft" />
      <input
        ref={fileInput}
        type="file"
        accept={documentTools.formats.map((format) => `.${FORMAT_EXTENSION[format]}`).join(",")}
        className="hidden"
        onChange={importFile}
      />
      <Button
        variant="ghost"
        disabled={phase !== null || busy}
        onClick={() => fileInput.current?.click()}
        title={documentTools.importHint}
      >
        {phase === "importing" ? "Opening…" : offline ? "Open" : "Import layout"}
      </Button>
      {documentTools.formats.map((format) => (
        <Button
          key={format}
          variant="ghost"
          disabled={phase !== null}
          onClick={() => void exportFile(format)}
          title={`${offline ? "Download this workspace" : "Export the live configuration"} as ${FORMAT_LABEL[format]}`}
        >
          {offline ? "Download" : "Export"} {FORMAT_LABEL[format]}
        </Button>
      ))}
      {migrationTarget && (
        <Button
          variant="ghost"
          disabled={phase !== null || busy}
          onClick={() => void previewMigration()}
          title="Preview a migration report and download a configuration for the other board"
        >
          {phase === "migrating" ? "Preparing migration…" : `Migrate to ${migrationTarget}`}
        </Button>
      )}
    </>
  );
}
