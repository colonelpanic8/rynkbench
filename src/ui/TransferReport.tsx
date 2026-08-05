// What an import or export actually did, shown at a size you can read it.
//
// These outcomes used to share one truncated line in the top bar, which meant a
// validation error naming the exact layer and key — the whole reason the parser
// runs in the browser — arrived clipped to a few dim words. Parse failures are
// multi-line by design now (an unportable layout names every binding it choked
// on), and a successful import still has things to say: an editor export
// describes a keyboard that expresses some behaviors differently, and the notes
// are the difference between what the file asked for and what the keyboard will
// do.

import type { ImportNote } from "../config/document";
import { Button, SectionLabel, cx } from "./kit";
import { WarningIcon } from "./icons";

export type TransferOutcome = "ok" | "warning" | "error";

export interface TransferReport {
  outcome: TransferOutcome;
  /** One line: what happened. Always shown. */
  headline: string;
  /** The full message, newlines intact. Long and multi-line is expected. */
  detail?: string;
  /** How an imported layout differs from its source. */
  notes?: ImportNote[];
}

const TONE: Record<TransferOutcome, { border: string; text: string }> = {
  ok: { border: "border-line-soft", text: "text-ink" },
  warning: { border: "border-warn/40", text: "text-warn" },
  error: { border: "border-danger/40", text: "text-danger" },
};

/** Build the report for a thrown error, keeping the message whole. */
export function errorReport(headline: string, error: unknown): TransferReport {
  const message = error instanceof Error ? error.message : String(error);
  // The headline stays scannable; the message keeps its own structure below it,
  // because that is where the layer and key names live.
  return { outcome: "error", headline, detail: message };
}

function Notes({ notes }: { notes: ImportNote[] }) {
  // Anything unrepresentable fails the parse outright, so a report that reaches
  // here holds approximations — but label them from the data rather than
  // assuming, so a future permissive import cannot mislabel a dropped key.
  const dropped = notes.filter((note) => !note.approximated);
  const approximated = notes.filter((note) => note.approximated);

  const group = (label: string, items: ImportNote[], tone: string) =>
    items.length === 0 ? null : (
      <div className="mt-2">
        <SectionLabel>{label}</SectionLabel>
        <ul className="mt-1 flex flex-col gap-1">
          {items.map((note, index) => (
            <li key={index} className="text-[11.5px] leading-relaxed">
              {note.location && (
                <span className="font-mono text-faint">{note.location} · </span>
              )}
              <span className={tone}>{note.message}</span>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <>
      {group("Not imported", dropped, "text-danger")}
      {group("Imported, but not exactly", approximated, "text-mute")}
    </>
  );
}

export function TransferReportPanel({
  report,
  onDismiss,
}: {
  report: TransferReport;
  onDismiss: () => void;
}) {
  const tone = TONE[report.outcome];

  return (
    <div
      className={cx(
        "absolute right-4 top-full z-20 mt-2 max-h-[60vh] w-[32rem] overflow-y-auto rounded-xl border bg-panel p-4 shadow-lg",
        tone.border,
      )}
      role={report.outcome === "error" ? "alert" : "status"}
    >
      <div className="flex items-start gap-2">
        {report.outcome !== "ok" && (
          <WarningIcon size={14} className={cx("mt-0.5 shrink-0", tone.text)} />
        )}
        <div className={cx("flex-1 text-[12.5px] leading-relaxed", tone.text)}>
          {report.headline}
        </div>
        <Button variant="ghost" onClick={onDismiss} title="Dismiss">
          Dismiss
        </Button>
      </div>

      {report.detail && (
        // `whitespace-pre-wrap` rather than `truncate`: the message is the
        // diagnostic, and its line breaks separate one bad binding from the next.
        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed text-mute">
          {report.detail}
        </pre>
      )}

      {report.notes && report.notes.length > 0 && <Notes notes={report.notes} />}
    </div>
  );
}
