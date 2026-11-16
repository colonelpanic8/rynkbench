// Draws the message store: the open question as a modal dialog (the
// browser's own <dialog>, which keeps focus inside and closes on Escape) and
// the toasts in a stack at the bottom of the window. Mounted once, beside the app.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, cx } from "../kit";
import { CloseIcon, WarningIcon } from "../icons";
import { GuardLabel } from "../guard/GuardLabel";
import { dismissToast, getMessages, subscribeMessages, type PendingConfirm, type Tone } from "./store";

const TOAST_TONE: Record<Tone, string> = {
  neutral: "border-line",
  ok: "border-ok/50",
  danger: "border-danger/60",
};

function ConfirmDialog({ request }: { request: PendingConfirm }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const details = request.details ?? [];

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal?.();
  }, [request.id]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`confirm-${request.id}-title`}
      aria-describedby={request.body ? `confirm-${request.id}-body` : undefined}
      // Escape closes a <dialog> by itself; treat that as "no".
      onCancel={(event) => {
        event.preventDefault();
        request.resolve(false);
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) request.resolve(false);
      }}
      className={cx(
        "m-auto rounded-2xl border bg-panel p-0 text-ink shadow-xl",
        request.guard ? "w-[min(32rem,calc(100vw-2rem))]" : "w-[min(26rem,calc(100vw-2rem))]",
        "backdrop:bg-well/70 backdrop:backdrop-blur-[1px]",
        request.danger ? "border-danger/40" : "border-line",
      )}
    >
      <div className="flex flex-col gap-4 p-5">
        {request.guard && <GuardLabel />}
        <div className="flex items-start gap-3">
          {request.danger && <WarningIcon size={18} className="mt-0.5 shrink-0 text-danger" />}
          <div className="flex flex-col gap-1.5">
            <h2 id={`confirm-${request.id}-title`} className="text-title font-semibold text-ink">
              {request.title}
            </h2>
            {request.body && (
              <p id={`confirm-${request.id}-body`} className="text-body leading-relaxed text-mute">
                {request.body}
              </p>
            )}
          </div>
        </div>
        {showDetails && (
          <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border border-line bg-well px-3 py-2 text-small text-mute">
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-end gap-2">
          {details.length > 0 && (
            <Button variant="ghost" className="mr-auto" onClick={() => setShowDetails((shown) => !shown)}>
              {showDetails ? "Hide details" : "Show details"}
            </Button>
          )}
          {request.showMe && (
            <Button
              variant="ghost"
              onClick={() => {
                request.resolve(false);
                request.showMe?.();
              }}
            >
              Show me
            </Button>
          )}
          <Button variant="ghost" autoFocus onClick={() => request.resolve(false)}>
            {request.cancelLabel ?? (request.guard ? "Reject" : "Cancel")}
          </Button>
          <Button variant={request.danger ? "danger" : "primary"} onClick={() => request.resolve(true)}>
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function MessageHost() {
  const { confirm, toasts } = useSyncExternalStore(subscribeMessages, getMessages, getMessages);
  return (
    <>
      {confirm && <ConfirmDialog key={confirm.id} request={confirm} />}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 max-sm:bottom-16"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cx(
              "pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border bg-raised py-2 pl-4 pr-2 shadow-lg animate-fade-up",
              TOAST_TONE[toast.tone],
            )}
          >
            {toast.guard && <GuardLabel />}
            <span className={cx("text-body", toast.tone === "danger" ? "text-danger" : "text-ink")}>{toast.text}</span>
            {toast.action && (
              <Button
                variant="ghost"
                className="px-2 py-1 font-semibold text-accent"
                onClick={() => {
                  toast.action?.run();
                  dismissToast(toast.id);
                }}
              >
                {toast.action.label}
              </Button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismissToast(toast.id)}
              className="flex size-6 cursor-pointer items-center justify-center rounded-md text-faint hover:bg-hover hover:text-ink"
            >
              <CloseIcon size={12} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
