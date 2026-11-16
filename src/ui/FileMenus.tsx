// Open and Save in the top bar, as in GLIDE. Open reads a layout file (into
// the file being edited, or onto the attached keyboard). Save writes the
// layout in the board's main format at one click; its ▾ lists every format
// and a copy for the board's sibling. The work is the workbench's one
// document transfer; its report shows under the bar.

import { useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { FORMAT_EXTENSION, FORMAT_LABEL } from "../config/document";
import { useSharedDocumentTransfer } from "./transfer-actions";
import { TransferReportPanel } from "./TransferReport";
import { useWorkbench } from "./state";
import { RowMenu, type MenuEntry } from "./RowMenu";
import { cx } from "./kit";
import { ChevronDownIcon, DownloadIcon, FolderIcon } from "./icons";

const BAR_BUTTON =
  "flex cursor-pointer items-center gap-1.5 py-1.5 text-body font-semibold text-ink transition-all duration-150 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40";

function BarButton({
  title,
  onClick,
  disabled,
  rounded = "rounded-xl px-3",
  children,
  expanded,
}: {
  title: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  rounded?: string;
  children: ReactNode;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-expanded={expanded}
      disabled={disabled}
      onClick={onClick}
      className={cx(BAR_BUTTON, rounded)}
    >
      {children}
    </button>
  );
}

export function FileMenus() {
  const { bundle, history } = useWorkbench();
  const transfer = useSharedDocumentTransfer();
  const { documentTools, phase, report, dismissReport, importFile, exportFile, migrationTarget, previewMigration } =
    transfer;
  const fileInput = useRef<HTMLInputElement>(null);
  const [saveMenu, setSaveMenu] = useState<{ x: number; y: number } | null>(null);
  if (!documentTools) return null;

  const offline = bundle.session.kind === "offline";
  const busy = phase !== null || history.phase !== "idle";
  const [mainFormat] = documentTools.formats;
  const items: MenuEntry[] = [
    { heading: "Save as" },
    ...documentTools.formats.map((format) => ({
      id: `format:${format}`,
      label: `${FORMAT_LABEL[format]} (.${FORMAT_EXTENSION[format]})`,
      hint: format === mainFormat ? "What Save writes" : undefined,
    })),
    ...(migrationTarget
      ? (["-", { id: "migrate", label: `For ${migrationTarget}…`, hint: `See what carries over, then save it` }] as MenuEntry[])
      : []),
  ];

  return (
    <div className="flex items-center gap-1">
      <input
        ref={fileInput}
        type="file"
        accept={documentTools.formats.map((format) => `.${FORMAT_EXTENSION[format]}`).join(",")}
        className="hidden"
        onChange={importFile}
      />
      <BarButton
        title={offline ? "Open a layout file" : documentTools.importHint}
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        <FolderIcon size={15} />
        <span className="max-sm:hidden">{phase === "importing" ? "Opening…" : offline ? "Open" : "Import"}</span>
      </BarButton>
      <div className="flex items-center">
        <BarButton
          title={`Save this layout as ${FORMAT_LABEL[mainFormat]} (.${FORMAT_EXTENSION[mainFormat]})`}
          disabled={phase !== null}
          rounded="rounded-l-xl pl-3 pr-1"
          onClick={() => void exportFile(mainFormat)}
        >
          <DownloadIcon size={15} />
          <span className="max-sm:hidden">{phase === "exporting" ? "Saving…" : "Save"}</span>
        </BarButton>
        <BarButton
          title="More ways to save"
          disabled={phase !== null}
          expanded={saveMenu !== null}
          rounded="rounded-r-xl px-1.5"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setSaveMenu(saveMenu ? null : { x: box.left - 60, y: box.bottom + 8 });
          }}
        >
          <ChevronDownIcon size={12} className="opacity-60" />
        </BarButton>
      </div>
      {saveMenu && (
        <RowMenu
          x={saveMenu.x}
          y={saveMenu.y}
          width={256}
          label="Save"
          items={items}
          onClose={() => setSaveMenu(null)}
          onAction={(id) => {
            if (id === "migrate") void previewMigration();
            else if (id.startsWith("format:")) {
              const format = documentTools.formats.find((candidate) => `format:${candidate}` === id);
              if (format) void exportFile(format);
            }
          }}
        />
      )}
      {report && <TransferReportPanel report={report} onDismiss={dismissReport} />}
    </div>
  );
}
