// Write-status chrome for optimistic writes: one status line and one save
// footer, shared by every panel that owns a `state.pending` record.

import type { ReactNode } from "react";
import { useWorkbench } from "./state";
import { Button } from "./kit";
import { WarningIcon } from "./icons";

/**
 * "Writing…" / "Write failed: …" for one pending id, with a dismiss and an
 * optional retry. Every optimistic-write panel renders this; the pending id is
 * the only thing that differs.
 */
export function WriteStatus({
  id,
  onRetry,
  compact = false,
}: {
  id: string;
  onRetry?: () => void;
  /** Inline single-line form, for panels whose footer has no room for a card. */
  compact?: boolean;
}) {
  const { state, dispatch } = useWorkbench();
  const pending = state.pending[id];
  if (!pending) return null;
  if (pending.status === "pending") {
    return <div className="text-[11.5px] text-accent">Writing to device…</div>;
  }
  const dismiss = () => dispatch({ type: "pendingErrDismiss", id });

  if (compact) {
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-danger">
        <WarningIcon size={13} className="shrink-0" />
        <span className="truncate">Write failed: {pending.message}</span>
        {onRetry && (
          <button
            type="button"
            className="shrink-0 cursor-pointer underline underline-offset-2"
            onClick={onRetry}
          >
            Retry
          </button>
        )}
        <button
          type="button"
          className="shrink-0 cursor-pointer text-mute underline underline-offset-2"
          onClick={dismiss}
        >
          Dismiss
        </button>
      </span>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-dim/25 px-3 py-2 text-[12px] text-danger">
      <WarningIcon size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div>Write failed: {pending.message}</div>
        <div className="mt-1 flex gap-3">
          {onRetry && (
            <button
              type="button"
              className="cursor-pointer text-mute underline underline-offset-2"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
          <button
            type="button"
            className="cursor-pointer text-mute underline underline-offset-2"
            onClick={dismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}

/** Save / reset footer shared by the whole-value editors. */
export function SaveBar({
  dirty,
  writing,
  onSave,
  onReset,
  saveLabel = "Save",
  writingLabel = "Writing…",
  resetLabel = "Reset",
  saveDisabled = false,
  className = "mt-4 flex items-center gap-2 border-t border-line-soft pt-4",
  children,
}: {
  dirty: boolean;
  writing: boolean;
  onSave: () => void;
  onReset: () => void;
  saveLabel?: string;
  writingLabel?: string;
  resetLabel?: string;
  /** Additional reason the save is unavailable (invalid input, over capacity). */
  saveDisabled?: boolean;
  className?: string;
  /** Trailing content: capacity warnings, "Saved ✓", a write-status line. */
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      <Button
        variant="primary"
        disabled={!dirty || writing || saveDisabled}
        onClick={onSave}
      >
        {writing ? writingLabel : saveLabel}
      </Button>
      <Button variant="ghost" disabled={!dirty || writing} onClick={onReset}>
        {resetLabel}
      </Button>
      {children}
    </div>
  );
}
